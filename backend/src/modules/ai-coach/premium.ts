import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { SubscriptionTier } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";

/**
 * Premium AI experience helpers (Sprint 19, Section 8).
 *
 * Reuses the existing subscription infrastructure (`User.subscriptionTier`) to
 * differentiate the AI Health Coach experience. Any tier above FREE is treated
 * as premium. Premium-only endpoints are gated with {@link requirePremium},
 * which returns HTTP 402 (Payment Required) plus a clear upgrade message so the
 * client can present an upgrade prompt — distinct from the 403 the Sprint 15
 * entitlement guard uses for feature-flag gating.
 */

/** Stable machine-readable code clients can key an upgrade prompt on. */
export const PREMIUM_REQUIRED_CODE = "PREMIUM_REQUIRED";

/** Turkish upgrade message shown to free users hitting a premium surface. */
export const PREMIUM_REQUIRED_MESSAGE =
  "Bu özellik yalnızca Premium üyeler içindir. Yapay zeka koçunun tüm gücünden " +
  "yararlanmak için Premium'a yükseltin.";

/** Days of history included in the memory context, by tier. */
export const MEMORY_WINDOW_DAYS = { premium: 90, free: 14 } as const;

/** Max AI response tokens, by tier (premium replies may be longer/deeper). */
export const AI_MAX_TOKENS = { premium: 1200, free: 500 } as const;

/** True for any paid tier (PREMIUM / PREMIUM_PLUS). */
export function isPremiumTier(tier: SubscriptionTier): boolean {
  return tier !== "FREE";
}

/** Reads the caller's current subscription tier from the database. */
export async function getUserTier(userId: string): Promise<SubscriptionTier> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true },
  });
  if (!user) {
    throw ApiError.unauthorized("Authentication required.");
  }
  return user.subscriptionTier;
}

/** Convenience: resolves whether the caller is on a premium tier. */
export async function isUserPremium(userId: string): Promise<boolean> {
  return isPremiumTier(await getUserTier(userId));
}

/** Memory window (in days) appropriate for the caller's premium status. */
export function memoryWindowDays(isPremium: boolean): number {
  return isPremium ? MEMORY_WINDOW_DAYS.premium : MEMORY_WINDOW_DAYS.free;
}

/**
 * Express guard: allows only premium callers through, otherwise responds 402
 * with the upgrade message. Must be mounted after `authenticate`.
 */
export const requirePremium: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (!req.user) {
    next(ApiError.unauthorized("Authentication required."));
    return;
  }
  getUserTier(req.user.id)
    .then((tier) => {
      if (!isPremiumTier(tier)) {
        next(
          new ApiError(402, PREMIUM_REQUIRED_MESSAGE, {
            code: PREMIUM_REQUIRED_CODE,
            details: { currentTier: tier },
          }),
        );
        return;
      }
      next();
    })
    .catch(next);
};
