import type { SubscriptionTier } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { googlePlayEntitlementsRepository } from "./google-play-entitlements.repository";

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
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true },
  });
  if (!user) return null;

  const play = await googlePlayEntitlementsRepository.findBestActiveForUser(userId);
  if (play) {
    if (user.subscriptionTier !== play.tier) {
      await prisma.user.update({
        where: { id: userId },
        data: { subscriptionTier: play.tier },
      });
    }
    return play.tier;
  }

  if (user.subscriptionTier === "FREE") return "FREE";

  const now = new Date();
  const cachedTierStillValid = await prisma.subscription.findFirst({
    where: {
      userId,
      tier: user.subscriptionTier,
      status: "ACTIVE",
      currentPeriodEnd: { gt: now },
    },
    select: { id: true },
  });
  if (cachedTierStillValid) return user.subscriptionTier;

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
