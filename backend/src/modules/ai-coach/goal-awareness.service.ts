import type { InsightPriority, PrioritizedInsight } from "./health-prioritization.service";

/**
 * Goal Awareness layer (Sprint 21.1).
 *
 * A COMPLETELY INDEPENDENT, pure re-ordering layer that runs AFTER the Smart
 * Health Prioritization layer. It nudges recommendations that are relevant to
 * the user's primary health goal higher WITHIN their existing priority tier.
 *
 * Hard guarantees (never violated):
 *   - CRITICAL recommendations always remain first.
 *   - A safety recommendation (CRITICAL/IMPORTANT) never moves below an
 *     INFORMATIONAL item — reordering happens strictly within a single priority
 *     tier, so tiers never cross.
 *   - It NEVER rewrites recommendation text, generates new recommendations, or
 *     removes any recommendation. It ONLY changes ordering.
 *
 * New goals are added by extending {@link GOAL_BOOST_KEYWORDS} — no existing
 * service needs to change.
 */

/** Supported primary health goals. Extend freely; unknown goals are inert. */
export type HealthGoal =
  | "WEIGHT_LOSS"
  | "WEIGHT_GAIN"
  | "MUSCLE_GAIN"
  | "WEIGHT_MAINTENANCE";

/** Fixed priority ranking (must mirror the prioritization layer's order). */
const PRIORITY_ORDER: Record<InsightPriority, number> = {
  CRITICAL: 0,
  IMPORTANT: 1,
  POSITIVE: 2,
  INFORMATIONAL: 3,
};

/**
 * Per-goal keyword tables (Turkish + English, diacritic-folded). A
 * recommendation matching any keyword for the active goal is boosted within its
 * tier. Add a new goal by adding a new entry here.
 */
const GOAL_BOOST_KEYWORDS: Record<HealthGoal, readonly string[]> = {
  WEIGHT_LOSS: [
    "kalori",
    "porsiyon",
    "kilo",
    "hareket",
    "aktivite",
    "adim",
    "seker",
    "sekerli",
    "tatli",
    "calorie",
    "portion",
    "weight",
    "activity",
    "sugar",
  ],
  WEIGHT_GAIN: [
    "kalori",
    "porsiyon",
    "kilo",
    "ogun",
    "protein",
    "kalori al",
    "calorie",
    "portion",
    "weight",
    "meal",
    "protein",
  ],
  MUSCLE_GAIN: [
    "protein",
    "hareket",
    "aktivite",
    "guc",
    "kuvvet",
    "antrenman",
    "dinlen",
    "toparlan",
    "uyku",
    "strength",
    "training",
    "activity",
    "recovery",
    "sleep",
  ],
  WEIGHT_MAINTENANCE: [
    "tutarli",
    "duzen",
    "su",
    "hidrasyon",
    "aliskanlik",
    "koru",
    "surdur",
    "denge",
    "consistency",
    "water",
    "hydration",
    "habit",
    "maintain",
  ],
};

/** Lowercases and strips Turkish diacritics for robust keyword matching. */
function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export const goalAwarenessService = {
  /**
   * Derives the user's primary goal from their profile. There is no explicit
   * goal enum on the profile, so the intent is inferred from target vs. current
   * weight. Muscle gain is not inferable from weight alone and must be supplied
   * explicitly by future callers.
   *
   * @param profile - Minimal profile fields (target & current weight in kg).
   * @returns The inferred goal, or `null` when it cannot be determined.
   */
  deriveGoalFromProfile(
    profile: { targetWeightKg?: number | null; currentWeightKg?: number | null } | null,
  ): HealthGoal | null {
    if (!profile || profile.targetWeightKg == null || profile.currentWeightKg == null) {
      return null;
    }
    const diff = profile.targetWeightKg - profile.currentWeightKg;
    if (Math.abs(diff) < 1) return "WEIGHT_MAINTENANCE";
    return diff < 0 ? "WEIGHT_LOSS" : "WEIGHT_GAIN";
  },

  /**
   * Re-orders prioritized insights so goal-relevant items rise within their
   * priority tier. Priority tiers are never crossed, so CRITICAL stays first
   * and safety items never fall below informational ones. Pure; text unchanged.
   *
   * @param insights - The already-prioritized insights.
   * @param goal - The active goal, or `null` to leave ordering untouched.
   * @returns The re-ordered insights (same items, same text, same count).
   */
  reorderByGoal(
    insights: readonly PrioritizedInsight[],
    goal: HealthGoal | null,
  ): PrioritizedInsight[] {
    if (!goal || insights.length === 0) return [...insights];
    const keywords = GOAL_BOOST_KEYWORDS[goal];
    if (!keywords || keywords.length === 0) return [...insights];

    const isRelevant = (message: string): boolean => {
      const text = fold(message);
      return keywords.some((k) => text.includes(k));
    };

    return insights
      .map((insight, index) => ({
        insight,
        index,
        tier: PRIORITY_ORDER[insight.category],
        // Within a tier, relevant items (boost 0) sort before non-relevant (1).
        boost: isRelevant(insight.message) ? 0 : 1,
      }))
      .sort((a, b) =>
        a.tier !== b.tier
          ? a.tier - b.tier
          : a.boost !== b.boost
            ? a.boost - b.boost
            : a.index - b.index,
      )
      .map((entry) => entry.insight);
  },
};
