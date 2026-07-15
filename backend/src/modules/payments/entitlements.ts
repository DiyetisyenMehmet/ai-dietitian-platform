/**
 * Feature entitlements & tier ranking (Sprint 15, D1).
 *
 * Entitlements express *what a tier can do* independently of *how much* it can
 * do (usage volume is the AI-usage quota matrix's job, Sprint 14 C5). Keeping
 * the two concerns separate means a feature can be gated on/off by tier here
 * while its per-window volume is tuned there.
 *
 * This module is pure, dependency-light data + helpers so it can be imported by
 * the subscription middleware, the payments service and any feature module that
 * wants to gate access — without creating cycles.
 */

import type { SubscriptionTier } from "@prisma/client";

/**
 * Gateable product capabilities. Adding a value here lets any surface adopt
 * entitlement gating without a breaking change. These are coarse capability
 * flags, not the fine-grained AI-usage features.
 */
export type EntitlementFeature =
  | "BLOOD_TEST_ANALYSIS"
  | "NUTRITION_PLAN"
  | "DIETITIAN_CHAT"
  | "PRIORITY_SUPPORT";

/** Ascending tier rank so "at least tier X" comparisons are trivial. */
export const TIER_RANK: Record<SubscriptionTier, number> = {
  FREE: 0,
  PREMIUM: 1,
  PREMIUM_PLUS: 2,
};

/**
 * Tier → enabled capabilities. FREE gets the core AI surfaces at a limited
 * volume (enforced by quotas), so they remain usable for evaluation; paid tiers
 * additionally unlock priority support. Adjust here to change gating without
 * touching call sites.
 */
export const FEATURE_ENTITLEMENTS: Record<SubscriptionTier, EntitlementFeature[]> = {
  FREE: ["DIETITIAN_CHAT", "BLOOD_TEST_ANALYSIS", "NUTRITION_PLAN"],
  PREMIUM: ["DIETITIAN_CHAT", "BLOOD_TEST_ANALYSIS", "NUTRITION_PLAN"],
  PREMIUM_PLUS: [
    "DIETITIAN_CHAT",
    "BLOOD_TEST_ANALYSIS",
    "NUTRITION_PLAN",
    "PRIORITY_SUPPORT",
  ],
};

/** True when the tier is entitled to the given feature. */
export function tierHasFeature(tier: SubscriptionTier, feature: EntitlementFeature): boolean {
  return FEATURE_ENTITLEMENTS[tier].includes(feature);
}

/** True when `tier` is at least as high as `minimum` in the tier hierarchy. */
export function tierAtLeast(tier: SubscriptionTier, minimum: SubscriptionTier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[minimum];
}

/** The full entitlement snapshot for a tier (used by the subscription API). */
export function entitlementsForTier(tier: SubscriptionTier): EntitlementFeature[] {
  return FEATURE_ENTITLEMENTS[tier];
}
