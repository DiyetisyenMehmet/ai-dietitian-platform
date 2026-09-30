import type {
  AdminSupportEntitlement,
  Subscription,
  SubscriptionTier,
} from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { TIER_RANK } from "./entitlements";
import {
  googlePlayEntitlementsRepository,
  type GooglePlayEntitlementRow,
} from "./google-play-entitlements.repository";
import { paymentsRepository } from "./payments.repository";
import { findActiveSupportEntitlementForUser } from "./support-entitlements.repository";

export type EffectiveSubscriptionSource =
  | "GOOGLE_PLAY"
  | "IYZICO"
  | "ADMIN_SUPPORT"
  | null;

export interface EffectiveSubscriptionReadState {
  cachedTier: SubscriptionTier;
  tier: SubscriptionTier;
  source: EffectiveSubscriptionSource;
  providerTier: SubscriptionTier;
  providerSource: "GOOGLE_PLAY" | "IYZICO" | null;
  googlePlay: GooglePlayEntitlementRow | null;
  subscription: Subscription | null;
  supportEntitlement: AdminSupportEntitlement | null;
}

function higherTier(
  providerTier: SubscriptionTier,
  support: AdminSupportEntitlement | null,
): { tier: SubscriptionTier; supportWins: boolean } {
  if (support && TIER_RANK[support.tier] > TIER_RANK[providerTier]) {
    return { tier: support.tier, supportWins: true };
  }
  return { tier: providerTier, supportWins: false };
}

/**
 * Side-effect-free projection of the canonical paid-access resolver.
 *
 * Provider state remains authoritative for provider subscriptions. A separate
 * Admin/Support entitlement may only raise the effective tier; it never edits,
 * cancels, renews or fabricates Google Play/IYZICO state.
 */
export async function readEffectiveSubscriptionState(
  userId: string,
): Promise<EffectiveSubscriptionReadState | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true },
  });
  if (!user) return null;

  const [play, supportEntitlement] = await Promise.all([
    googlePlayEntitlementsRepository.findBestActiveForUser(userId),
    findActiveSupportEntitlementForUser(userId),
  ]);

  let providerTier: SubscriptionTier = "FREE";
  let providerSource: "GOOGLE_PLAY" | "IYZICO" | null = null;
  let subscription: Subscription | null = null;

  if (play) {
    providerTier = play.tier;
    providerSource = "GOOGLE_PLAY";
  } else if (user.subscriptionTier !== "FREE") {
    subscription = await paymentsRepository.findEntitlingSubscription(
      userId,
      user.subscriptionTier,
    );
    if (!subscription) {
      subscription = await paymentsRepository.findEntitlingSubscription(userId);
    }
    if (subscription) {
      providerTier = subscription.tier;
      providerSource = "IYZICO";
    }
  }

  const effective = higherTier(providerTier, supportEntitlement);

  return {
    cachedTier: user.subscriptionTier,
    tier: effective.tier,
    source: effective.supportWins ? "ADMIN_SUPPORT" : providerSource,
    providerTier,
    providerSource,
    googlePlay: play,
    subscription,
    supportEntitlement,
  };
}

/**
 * Resolves the tier entitled right now and repairs only the derivative
 * users.subscriptionTier cache. Provider rows remain provider-owned.
 */
export async function resolveEffectiveSubscriptionTier(
  userId: string,
): Promise<SubscriptionTier | null> {
  const state = await readEffectiveSubscriptionState(userId);
  if (!state) return null;
  if (state.cachedTier === state.tier) return state.tier;

  // Active Google Play or Admin/Support state is already bounded by its own
  // ledger. Only the derivative user cache needs synchronization.
  if (state.source === "GOOGLE_PLAY" || state.source === "ADMIN_SUPPORT") {
    await prisma.user.update({
      where: { id: userId },
      data: { subscriptionTier: state.tier },
    });
    return state.tier;
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    // Close legacy IYZICO ACTIVE rows that can no longer entitle the account.
    // Provider cancellation/renewal is never manufactured here.
    await tx.subscription.updateMany({
      where: {
        userId,
        status: "ACTIVE",
        OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { lte: now } }],
      },
      data: { status: "EXPIRED" },
    });

    const validProvider = await tx.subscription.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        currentPeriodEnd: { gt: now },
      },
      orderBy: { currentPeriodEnd: "desc" },
      select: { tier: true },
    });
    const activeSupport = await findActiveSupportEntitlementForUser(userId, tx, now);
    const effective = higherTier(validProvider?.tier ?? "FREE", activeSupport);

    await tx.user.update({
      where: { id: userId },
      data: { subscriptionTier: effective.tier },
    });

    return effective.tier;
  });
}
