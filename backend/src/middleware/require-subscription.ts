import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { SubscriptionTier } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/api-error";
import { ENTITLEMENT_REQUIRED_CODE } from "../modules/payments/constants";
import {
  tierAtLeast,
  tierHasFeature,
  type EntitlementFeature,
} from "../modules/payments/entitlements";

/**
 * Subscription / entitlement guards (Sprint 15).
 *
 * These are reusable infrastructure: a feature module can mount `requireFeature`
 * or `requireTier` after `authenticate` to gate a route on the caller's current
 * subscription tier. The caller's tier is read from the persisted
 * `User.subscriptionTier`, which the payments module keeps in sync with the
 * active subscription (activation/cancellation/expiry). On insufficient
 * entitlement a 403 is returned with the stable `SUBSCRIPTION_REQUIRED` code so
 * clients can present an upgrade prompt.
 *
 * NOTE: these guards are intentionally NOT wired onto the existing Sprint 12–14
 * feature routes; per-tier *volume* there is already enforced by the AI-usage
 * quota matrix. They exist so future gated surfaces (and the frontend) have a
 * single, consistent entitlement mechanism.
 */

/** Reads the authenticated user's current subscription tier from the DB. */
async function resolveTier(userId: string): Promise<SubscriptionTier> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true },
  });
  if (!user) {
    throw ApiError.unauthorized("Authentication required.");
  }
  return user.subscriptionTier;
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
