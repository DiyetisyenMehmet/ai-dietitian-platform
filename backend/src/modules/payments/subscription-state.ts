import type { Subscription, SubscriptionTier } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import {
  googlePlayEntitlementsRepository,
  type GooglePlayEntitlementRow,
} from "./google-play-entitlements.repository";
import { paymentsRepository } from "./payments.repository";

export interface EffectiveSubscriptionReadState {
  cachedTier: SubscriptionTier;
  tier: SubscriptionTier;
  source: "GOOGLE_PLAY" | "IYZICO" | null;
  googlePlay: GooglePlayEntitlementRow | null;
  subscription: Subscription | null;
}

/**
 * Side-effect-free projection of the same source order used by the canonical
 * resolver. Admin/read-only surfaces use this so a GET never repairs cache or
 * changes subscription rows.
 */
export async function readEffectiveSubscriptionState(
  userId: string,
): Promise<EffectiveSubscriptionReadState | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true },
  });
  if (!user) return null;

  const play = await googlePlayEntitlementsRepository.findBestActiveForUser(userId);
  if (play) {
    return {
      cachedTier: user.subscriptionTier,
      tier: play.tier,
      source: "GOOGLE_PLAY",
      googlePlay: play,
      subscription: null,
    };
  }

  if (user.subscriptionTier === "FREE") {
    return {
      cachedTier: user.subscriptionTier,
      tier: "FREE",
      source: null,
      googlePlay: null,
      subscription: null,
    };
  }

  const matching = await paymentsRepository.findEntitlingSubscription(
    userId,
    user.subscriptionTier,
  );
  if (matching) {
    return {
      cachedTier: user.subscriptionTier,
      tier: matching.tier,
      source: "IYZICO",
      googlePlay: null,
      subscription: matching,
    };
  }

  const fallback = await paymentsRepository.findEntitlingSubscription(userId);
  return {
    cachedTier: user.subscriptionTier,
    tier: fallback?.tier ?? "FREE",
    source: fallback ? "IYZICO" : null,
    googlePlay: null,
    subscription: fallback,
  };
}

/**
 * Resolves the tier that is entitled *right now* and repairs stale persisted
 * state. Google Play is checked first because Play purchases are stored in the
 * dedicated token-hash ledger; the legacy Subscription rows remain the source
 * for dormant iyzico/web purchases.
 *
 * User.subscriptionTier is only a cache. It is never sufficient on its own to
 * grant paid access.
 */
export async function resolveEffectiveSubscriptionTier(
  userId: string,
): Promise<SubscriptionTier | null> {
  const state = await readEffectiveSubscriptionState(userId);
  if (!state) return null;

  if (state.googlePlay) {
    if (state.cachedTier !== state.googlePlay.tier) {
      await prisma.user.update({
        where: { id: userId },
        data: { subscriptionTier: state.googlePlay.tier },
      });
    }
    return state.googlePlay.tier;
  }

  if (state.cachedTier === "FREE") return "FREE";
  if (state.subscription?.tier === state.cachedTier) return state.cachedTier;

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    // Close legacy ACTIVE rows that can no longer entitle the account. An ACTIVE
    // row with no period end fails closed; paid access must always be bounded.
    await tx.subscription.updateMany({
      where: {
        userId,
        status: "ACTIVE",
        OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { lte: now } }],
      },
      data: { status: "EXPIRED" },
    });

    const valid = await tx.subscription.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        currentPeriodEnd: { gt: now },
      },
      orderBy: { currentPeriodEnd: "desc" },
      select: { tier: true },
    });
    const effectiveTier: SubscriptionTier = valid?.tier ?? "FREE";

    await tx.user.update({
      where: { id: userId },
      data: { subscriptionTier: effectiveTier },
    });

    return effectiveTier;
  });
}
