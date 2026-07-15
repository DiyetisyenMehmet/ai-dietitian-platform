import type { AiUsageEvent, AiUsageFeature, SubscriptionTier } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { aiUsageRepository } from "./ai-usage.repository";
import { QUOTA_EXCEEDED_CODE, QUOTA_MATRIX, type FeatureQuota } from "./constants";
import type { FeatureQuotaStatus, RecordUsageInput, WindowUsage } from "./types";

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
 * Enforces per-tier, per-feature usage limits over rolling daily and monthly
 * windows to protect against external AI cost explosion and to differentiate
 * subscription tiers. The tier is resolved from the user's `subscriptionTier`
 * (defaulting to FREE) so enforcement is "subscription-aware" without coupling
 * to the (future) payments module.
 */
export const aiUsageService = {
  /** Resolves the effective subscription tier for a user (FREE fallback). */
  async resolveTier(userId: string): Promise<SubscriptionTier> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true },
    });
    return user?.subscriptionTier ?? "FREE";
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
    const exceeded =
      (day.limit !== null && day.used >= day.limit) ||
      (month.limit !== null && month.used >= month.limit);

    return { feature, tier: effectiveTier, day, month, exceeded };
  },

  /**
   * Throws a 429 {@link ApiError} when the user has no remaining quota for the
   * feature; otherwise resolves with the current status so callers can surface
   * remaining allowance to the client.
   *
   * @throws {ApiError} 429 when a window is exhausted.
   */
  async assertWithinQuota(
    userId: string,
    feature: AiUsageFeature,
    tier?: SubscriptionTier,
  ): Promise<FeatureQuotaStatus> {
    const status = await this.getStatus(userId, feature, tier);
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
