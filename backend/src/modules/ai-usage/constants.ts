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
 * The quota matrix. FREE is deliberately tight (cost protection for
 * unmonetized accounts); paid tiers scale up. NUTRITION_PLAN and
 * BLOOD_TEST_ANALYSIS quotas are declared so those features can adopt the
 * shared capability later without a schema or contract change — this sprint
 * only enforces DIETITIAN_CHAT.
 */
export const QUOTA_MATRIX: QuotaMatrix = {
  FREE: {
    DIETITIAN_CHAT: { perDay: 20, perMonth: 200 },
    BLOOD_TEST_ANALYSIS: { perDay: 3, perMonth: 10 },
    NUTRITION_PLAN: { perDay: 3, perMonth: 15 },
  },
  PREMIUM: {
    DIETITIAN_CHAT: { perDay: 100, perMonth: 2000 },
    BLOOD_TEST_ANALYSIS: { perDay: 15, perMonth: 100 },
    NUTRITION_PLAN: { perDay: 15, perMonth: 100 },
  },
  PRO: {
    DIETITIAN_CHAT: { perDay: 500, perMonth: 10000 },
    BLOOD_TEST_ANALYSIS: { perDay: 60, perMonth: 600 },
    NUTRITION_PLAN: { perDay: 60, perMonth: 600 },
  },
};

/** Machine-readable error code surfaced when a quota is exhausted. */
export const QUOTA_EXCEEDED_CODE = "AI_QUOTA_EXCEEDED";
