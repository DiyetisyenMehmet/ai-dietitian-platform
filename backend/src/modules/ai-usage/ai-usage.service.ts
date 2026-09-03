import type { AiUsageEvent, AiUsageFeature, SubscriptionTier } from "@prisma/client";

import { ApiError } from "../../utils/api-error";
import { ENTITLEMENT_REQUIRED_CODE } from "../payments/constants";
import { resolveEffectiveSubscriptionTier } from "../payments/subscription-state";
import { aiUsageRepository } from "./ai-usage.repository";
import {
  FREE_LIFETIME_TRIAL,
  QUOTA_EXCEEDED_CODE,
  QUOTA_MATRIX,
  type FeatureQuota,
} from "./constants";
import type { FeatureQuotaStatus, RecordUsageInput, TrialUsage, WindowUsage } from "./types";

/** Start of the current UTC day. */
function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Start of the next UTC day (day window reset). */
function startOfNextUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

/** Start of the current UTC month. */
function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Start of the next UTC month (month window reset). */
function startOfNextUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** Builds a single window's usage view from a used count and a limit. */
function buildWindow(used: number, limit: number | null, resetsAt: Date): WindowUsage {
  const remaining = limit === null ? null : Math.max(0, limit - used);
  return { used, limit, remaining, resetsAt };
}

/**
 * AI usage quota service (Sprint 14, C5).
 *
 * Enforces per-tier, per-feature usage limits over daily and monthly windows to
 * protect against external AI cost explosion and to differentiate subscription
 * tiers. Paid access is revalidated against the paid-through date before quota
 * selection, so a stale cached PREMIUM tier can never grant post-expiry calls.
 */
export const aiUsageService = {
  /** Resolves the effective, currently-entitled tier for a user (FREE fallback). */
  async resolveTier(userId: string): Promise<SubscriptionTier> {
    return (await resolveEffectiveSubscriptionTier(userId)) ?? "FREE";
  },

  /**
   * Computes the quota status for a user + feature across both windows.
   *
   * @param userId - Owner id.
   * @param feature - Feature to evaluate.
   * @param tier - Optional pre-resolved tier (avoids a duplicate lookup).
   */
  async getStatus(
    userId: string,
    feature: AiUsageFeature,
    tier?: SubscriptionTier,
  ): Promise<FeatureQuotaStatus> {
    const effectiveTier = tier ?? (await this.resolveTier(userId));
    const limits: FeatureQuota = QUOTA_MATRIX[effectiveTier][feature];
    const now = new Date();

    const dayStart = startOfUtcDay(now);
    const monthStart = startOfUtcMonth(now);
    const [dayUsed, monthUsed] = await Promise.all([
      aiUsageRepository.countSince(userId, feature, dayStart),
      aiUsageRepository.countSince(userId, feature, monthStart),
    ]);

    const day = buildWindow(dayUsed, limits.perDay, startOfNextUtcDay(now));
    const month = buildWindow(monthUsed, limits.perMonth, startOfNextUtcMonth(now));
    const windowExceeded =
      (day.limit !== null && day.used >= day.limit) ||
      (month.limit !== null && month.used >= month.limit);

    // FREE-tier LIFETIME trial (V1 cost protection): a total, non-resetting cap
    // on successful calls per feature. Paid tiers have no trial and rely solely
    // on the rolling day/month windows above.
    let trial: TrialUsage | undefined;
    if (effectiveTier === "FREE") {
      const limit = FREE_LIFETIME_TRIAL[feature];
      const used = await aiUsageRepository.countTotal(userId, feature);
      trial = {
        limit,
        used,
        remaining: Math.max(0, limit - used),
        exhausted: used >= limit,
      };
    }

    const exceeded = windowExceeded || (trial?.exhausted ?? false);

    return { feature, tier: effectiveTier, day, month, trial, exceeded };
  },

  /**
   * Throws when the user has no remaining quota for the feature; otherwise
   * resolves with the current status so callers can surface remaining allowance.
   */
  async assertWithinQuota(
    userId: string,
    feature: AiUsageFeature,
    tier?: SubscriptionTier,
  ): Promise<FeatureQuotaStatus> {
    const status = await this.getStatus(userId, feature, tier);

    // FREE lifetime trial exhausted → this is a PAYWALL, not a transient limit.
    // Checked FIRST (and before any expensive AI provider call) so the client
    // receives a stable SUBSCRIPTION_REQUIRED (403) upgrade prompt rather than a
    // "try again later" message. Paid tiers never carry a `trial`.
    if (status.trial?.exhausted) {
      throw new ApiError(
        403,
        "Ücretsiz deneme hakkınız doldu. Bu özelliği kullanmaya devam etmek için Premium'a geçin.",
        {
          code: ENTITLEMENT_REQUIRED_CODE,
          details: {
            feature,
            tier: status.tier,
            reason: "FREE_TRIAL_EXHAUSTED",
            trialLimit: status.trial.limit,
          },
        },
      );
    }

    if (status.exceeded) {
      const which = status.day.remaining === 0 ? status.day : status.month;
      throw new ApiError(429, "AI usage limit reached for your plan. Please try again later.", {
        code: QUOTA_EXCEEDED_CODE,
        details: {
          feature,
          tier: status.tier,
          resetsAt: which.resetsAt.toISOString(),
        },
      });
    }
    return status;
  },

  /** Records a single successful AI invocation for quota + cost accounting. */
  record(input: RecordUsageInput): Promise<AiUsageEvent> {
    return aiUsageRepository.record(input);
  },
};
