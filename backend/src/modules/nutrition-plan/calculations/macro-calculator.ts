/**
 * Deterministic macronutrient calculation engine.
 *
 * Splits a daily calorie target into protein/carbohydrate/fat grams based on
 * the weight goal, dietary preference, and any declared carbohydrate-sensitive
 * condition. All adjustments are nutritional ratio choices — never diagnosis or
 * treatment of any condition.
 */

import {
  CARB_MODERATED_FAT_RATIO,
  CARB_MODERATED_MAX_RATIO,
  CARB_SENSITIVE_CONDITION_KEYWORDS,
  DEFAULT_FAT_RATIO,
  KETO_FAT_RATIO,
  PROTEIN_G_PER_KG,
} from "../constants";
import type { MacroBreakdown, NutritionProfile, WeightGoal } from "../types";

const PROTEIN_KCAL_PER_G = 4;
const CARB_KCAL_PER_G = 4;
const FAT_KCAL_PER_G = 9;

/**
 * Determines whether any declared health condition warrants moderating the
 * carbohydrate share. Matching is case-insensitive and substring-based.
 *
 * @param healthConditions - Free-form, user-declared conditions.
 * @returns True when a carbohydrate-sensitive keyword is present.
 */
export function shouldModerateCarbs(healthConditions: string[]): boolean {
  const haystack = healthConditions.join(" ").toLowerCase();
  return CARB_SENSITIVE_CONDITION_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

/**
 * Resolves the fat share (fraction of total calories) for the given inputs.
 * Ketogenic preference dominates; otherwise a moderated share is used when a
 * carbohydrate-sensitive condition is declared, falling back to the default.
 */
function resolveFatRatio(dietaryPreference: string, carbModerated: boolean): number {
  if (dietaryPreference.toUpperCase() === "KETO") return KETO_FAT_RATIO;
  if (carbModerated) return CARB_MODERATED_FAT_RATIO;
  return DEFAULT_FAT_RATIO;
}

/**
 * Splits a daily calorie target into macronutrient grams.
 *
 * Protein is anchored to body weight (goal-dependent g/kg); fat is taken as a
 * share of total calories; carbohydrates absorb the remainder. When carbs are
 * moderated, their share is additionally capped and the surplus shifted to fat.
 *
 * @param profile - The normalized nutrition profile.
 * @param dailyCalories - The goal-adjusted daily calorie target (kcal).
 * @param goal - The weight goal (drives the protein target).
 * @returns The structured macro breakdown.
 */
export function calculateMacros(
  profile: NutritionProfile,
  dailyCalories: number,
  goal: WeightGoal,
): MacroBreakdown {
  const carbModerated = shouldModerateCarbs(profile.healthConditions);

  // Protein anchored to current body weight.
  const proteinGrams = Math.round(PROTEIN_G_PER_KG[goal] * profile.currentWeightKg);
  const proteinCalories = proteinGrams * PROTEIN_KCAL_PER_G;

  // Fat as a share of total calories.
  let fatCalories = Math.round(dailyCalories * resolveFatRatio(profile.dietaryPreference, carbModerated));

  // Carbohydrates absorb whatever remains after protein + fat.
  let carbCalories = Math.max(0, dailyCalories - proteinCalories - fatCalories);

  // When moderating carbs, cap their share and move the excess into fat so the
  // daily calorie total is preserved.
  if (carbModerated) {
    const maxCarbCalories = dailyCalories * CARB_MODERATED_MAX_RATIO;
    if (carbCalories > maxCarbCalories) {
      const excess = carbCalories - maxCarbCalories;
      carbCalories = maxCarbCalories;
      fatCalories += excess;
    }
  }

  const carbsGrams = Math.round(carbCalories / CARB_KCAL_PER_G);
  const fatGrams = Math.round(fatCalories / FAT_KCAL_PER_G);

  const safeTotal = dailyCalories > 0 ? dailyCalories : 1;

  return {
    proteinGrams,
    carbsGrams,
    fatGrams,
    proteinCalories,
    carbsCalories: Math.round(carbCalories),
    fatCalories: Math.round(fatCalories),
    proteinRatio: Number((proteinCalories / safeTotal).toFixed(3)),
    carbsRatio: Number((carbCalories / safeTotal).toFixed(3)),
    fatRatio: Number((fatCalories / safeTotal).toFixed(3)),
    carbModerated,
  };
}
