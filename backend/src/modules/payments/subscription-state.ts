import type { SubscriptionTier } from "@prisma/client";

import { prisma } from "../../lib/prisma";

/**
 * Resolves the tier that is entitled *right now* and repairs stale persisted
 * state when a paid period has elapsed.
 *
 * `User.subscriptionTier` is a fast cache used across the application, but a
 * cache must never grant paid access beyond `Subscription.currentPeriodEnd`.
 * This helper therefore validates every non-FREE cached tier against an ACTIVE
 * subscription with a future period end. If no such row exists, expired ACTIVE
 * rows are closed and the user is downgraded to FREE atomically. If a different
 * valid ACTIVE row exists (for example after a plan change), its tier becomes
 * the repaired cache value.
 *
 * Returns `null` only when the user no longer exists.
 */
export async function resolveEffectiveSubscriptionTier(
  userId: string,
): Promise<SubscriptionTier | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true },
  });
  if (!user) return null;
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
    // Close ACTIVE rows that can no longer entitle the account. An ACTIVE row
    // with no period end also fails closed; paid access must always be bounded.
    await tx.subscription.updateMany({
      where: {
        userId,
        status: "ACTIVE",
        OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { lte: now } }],
      },
      data: { status: "EXPIRED" },
    });

    // A newer valid purchase may coexist with the stale cached tier. Prefer the
    // valid ACTIVE row with the furthest paid-through date instead of blindly
    // downgrading such an account.
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
