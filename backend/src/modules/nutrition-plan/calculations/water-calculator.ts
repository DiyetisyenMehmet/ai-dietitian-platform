/**
 * Deterministic water-intake calculation engine.
 *
 * Estimates a daily water target from body weight plus an activity-based bonus,
 * honoring the user's own onboarding water goal as a floor. This is a general
 * hydration guideline, not medical advice.
 */

import { MIN_WATER_ML, WATER_ACTIVITY_BONUS_ML, WATER_ML_PER_KG } from "../constants";
import type { NutritionProfile, WaterRecommendation } from "../types";

/**
 * Computes a recommended daily water intake.
 *
 * base   = weightKg × 35 ml
 * bonus  = activity-level bonus (ml)
 * result = max(base + bonus, user's onboarding goal, conservative floor)
 *
 * @param profile - The normalized nutrition profile.
 * @returns The structured water recommendation (rounded to 50 ml).
 */
export function calculateWater(profile: NutritionProfile): WaterRecommendation {
  const baseMl = Math.round(profile.currentWeightKg * WATER_ML_PER_KG);
  const activityBonusMl = WATER_ACTIVITY_BONUS_ML[profile.activityLevel];

  const computed = baseMl + activityBonusMl;
  const withFloors = Math.max(computed, profile.dailyWaterGoalMl, MIN_WATER_ML);

  // Round to the nearest 50 ml for a clean, actionable target.
  const waterMl = Math.round(withFloors / 50) * 50;

  return { waterMl, baseMl, activityBonusMl };
}
