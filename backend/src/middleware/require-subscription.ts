import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { SubscriptionTier } from "@prisma/client";

import { ApiError } from "../utils/api-error";
import { ENTITLEMENT_REQUIRED_CODE } from "../modules/payments/constants";
import {
  tierAtLeast,
  tierHasFeature,
  type EntitlementFeature,
} from "../modules/payments/entitlements";
import { resolveEffectiveSubscriptionTier } from "../modules/payments/subscription-state";

/**
 * Subscription / entitlement guards (Sprint 15).
 *
 * These reusable guards validate the caller's current paid-through period before
 * trusting the cached `User.subscriptionTier`. Expired access is repaired back
 * to FREE by the shared subscription-state resolver, preventing a stale database
 * tier from granting post-expiry entitlements.
 */

/** Reads the authenticated user's currently entitled subscription tier. */
async function resolveTier(userId: string): Promise<SubscriptionTier> {
  const tier = await resolveEffectiveSubscriptionTier(userId);
  if (!tier) throw ApiError.unauthorized("Authentication required.");
  return tier;
}

/** Guard requiring the caller's tier to be entitled to a specific feature. */
export function requireFeature(feature: EntitlementFeature): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(ApiError.unauthorized("Authentication required."));
      return;
    }
    resolveTier(req.user.id)
      .then((tier) => {
        if (!tierHasFeature(tier, feature)) {
          next(
            new ApiError(403, "Your current plan does not include this feature.", {
              code: ENTITLEMENT_REQUIRED_CODE,
              details: { requiredFeature: feature, currentTier: tier },
            }),
          );
          return;
        }
        next();
      })
      .catch(next);
  };
}

/** Guard requiring the caller's tier to be at least `minimum`. */
export function requireTier(minimum: SubscriptionTier): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(ApiError.unauthorized("Authentication required."));
      return;
    }
    resolveTier(req.user.id)
      .then((tier) => {
        if (!tierAtLeast(tier, minimum)) {
          next(
            new ApiError(403, "A higher subscription plan is required.", {
              code: ENTITLEMENT_REQUIRED_CODE,
              details: { requiredTier: minimum, currentTier: tier },
            }),
          );
          return;
        }
        next();
      })
      .catch(next);
  };
}
