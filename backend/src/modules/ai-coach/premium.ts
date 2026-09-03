import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { SubscriptionTier } from "@prisma/client";

import { ApiError } from "../../utils/api-error";
import { resolveEffectiveSubscriptionTier } from "../payments/subscription-state";

/**
 * Premium AI experience helpers (Sprint 19, Section 8).
 *
 * Paid access is resolved through the shared subscription-state capability so
 * an expired `User.subscriptionTier` cache can never continue to unlock longer
 * memory windows or premium-only coach endpoints.
 */

export const PREMIUM_REQUIRED_CODE = "PREMIUM_REQUIRED";

export const PREMIUM_REQUIRED_MESSAGE =
  "Bu özellik yalnızca Premium erişim döneminde kullanılabilir. Devam etmek için ücretli erişim gerekir.";

/** Days of history included in the memory context, by tier. */
export const MEMORY_WINDOW_DAYS = { premium: 90, free: 14 } as const;

/** Max AI response tokens, by tier (premium replies may be longer/deeper). */
export const AI_MAX_TOKENS = { premium: 1200, free: 500 } as const;

/** True for any currently paid tier (PREMIUM / PREMIUM_PLUS). */
export function isPremiumTier(tier: SubscriptionTier): boolean {
  return tier !== "FREE";
}

/** Resolves the caller's currently entitled tier and repairs stale paid state. */
export async function getUserTier(userId: string): Promise<SubscriptionTier> {
  const tier = await resolveEffectiveSubscriptionTier(userId);
  if (!tier) throw ApiError.unauthorized("Authentication required.");
  return tier;
}

/** Convenience: resolves whether the caller currently has paid access. */
export async function isUserPremium(userId: string): Promise<boolean> {
  return isPremiumTier(await getUserTier(userId));
}

/** Memory window (in days) appropriate for the caller's paid status. */
export function memoryWindowDays(isPremium: boolean): number {
  return isPremium ? MEMORY_WINDOW_DAYS.premium : MEMORY_WINDOW_DAYS.free;
}

/** Express guard for currently paid callers. Must follow `authenticate`. */
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
