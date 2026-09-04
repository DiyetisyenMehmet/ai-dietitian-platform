/**
 * Constants for Diewish's AI Usage Quota & Cost-Protection capability
 * (Sprint 14, C5).
 *
 * Quotas exist for two reasons: (1) protect the business from runaway external
 * AI cost, and (2) differentiate subscription tiers. Limits are expressed per
 * feature and per rolling window (daily + monthly). A user must be within BOTH
 * windows to make a call. Limits are intentionally conservative for V1 and can
 * be tuned without code changes elsewhere since every consumer reads them here.
 */

import type { AiUsageFeature, SubscriptionTier } from "@prisma/client";

/** Per-window limits for a single feature. `null` means "no limit". */
export interface FeatureQuota {
  perDay: number | null;
  perMonth: number | null;
}

/** The full quota matrix: tier → feature → window limits. */
export type QuotaMatrix = Record<SubscriptionTier, Record<AiUsageFeature, FeatureQuota>>;

/**
 * The quota matrix. FREE is deliberately conservative for unmonetized accounts;
 * paid tiers scale up without exposing unrealistically large abuse ceilings.
 * NUTRITION_PLAN and BLOOD_TEST_ANALYSIS keep their existing limits in this
 * change; the product decision here applies only to DIETITIAN_CHAT.
 */
export const QUOTA_MATRIX: QuotaMatrix = {
  FREE: {
    DIETITIAN_CHAT: { perDay: 5, perMonth: 100 },
    BLOOD_TEST_ANALYSIS: { perDay: 3, perMonth: 10 },
    NUTRITION_PLAN: { perDay: 3, perMonth: 15 },
  },
  PREMIUM: {
    DIETITIAN_CHAT: { perDay: 20, perMonth: 400 },
    BLOOD_TEST_ANALYSIS: { perDay: 15, perMonth: 100 },
    NUTRITION_PLAN: { perDay: 15, perMonth: 100 },
  },
  PREMIUM_PLUS: {
    DIETITIAN_CHAT: { perDay: 50, perMonth: 1000 },
    BLOOD_TEST_ANALYSIS: { perDay: 60, perMonth: 600 },
    NUTRITION_PLAN: { perDay: 60, perMonth: 600 },
  },
};

/** FREE AI Coach onboarding window: first 7 x 24 hours after account creation. */
export const FREE_CHAT_INTRO_DAYS = 7;

/** Daily AI Coach allowance during the FREE onboarding window. */
export const FREE_CHAT_INTRO_DAILY_LIMIT = 10;

/** Machine-readable error code surfaced when a quota is exhausted. */
export const QUOTA_EXCEEDED_CODE = "AI_QUOTA_EXCEEDED";

/**
 * Feature-specific FREE-tier lifetime trial allowances.
 *
 * DIETITIAN_CHAT intentionally has NO lifetime cap: FREE users keep a small,
 * recurring AI Coach allowance (10/day during the first 7 days, then 5/day,
 * always subject to the 100/month cap). Blood-test analysis and nutrition-plan
 * generation retain their existing lifetime trial rules until those product
 * policies are reviewed in their dedicated work.
 */
export const FREE_LIFETIME_TRIAL: Partial<Record<AiUsageFeature, number>> = {
  BLOOD_TEST_ANALYSIS: 1,
  NUTRITION_PLAN: 1,
};
