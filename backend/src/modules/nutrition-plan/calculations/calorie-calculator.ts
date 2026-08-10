/**
 * Deterministic calorie calculation engine.
 *
 * Pure, side-effect-free functions implementing the Mifflin-St Jeor BMR
 * equation, the standard activity-multiplier TDEE, and a goal-based calorie
 * adjustment. Keeping these deterministic makes them cheap and unit-testable —
 * no AI is involved in the math.
 */

import {
  ACTIVITY_MULTIPLIERS,
  GOAL_CALORIE_ADJUSTMENT,
  MIN_DAILY_CALORIES,
  WEIGHT_GOAL_THRESHOLD_KG,
} from "../constants";
import type { CalculationGender, CalorieCalculation, NutritionProfile, WeightGoal } from "../types";

/**
 * Derives the nutritional weight goal from current vs. target weight.
 *
 * @param currentWeightKg - Current body weight in kg.
 * @param targetWeightKg - Desired body weight in kg.
 * @returns The weight goal (a nutritional objective, never a medical one).
 */
export function deriveWeightGoal(currentWeightKg: number, targetWeightKg: number): WeightGoal {
  const delta = targetWeightKg - currentWeightKg;
  if (delta <= -WEIGHT_GOAL_THRESHOLD_KG) return "LOSE_WEIGHT";
  if (delta >= WEIGHT_GOAL_THRESHOLD_KG) return "GAIN_WEIGHT";
  return "MAINTAIN_WEIGHT";
}

/**
 * Computes the Basal Metabolic Rate using the Mifflin-St Jeor equation.
 *
 * men:   BMR = 10·kg + 6.25·cm − 5·age + 5
 * women: BMR = 10·kg + 6.25·cm − 5·age − 161
 * When sex is unknown/neutral, the mean of the two constants (−78) is used.
 *
 * @returns BMR in kcal/day, rounded to a whole number.
 */
export function calculateBmr(
  gender: CalculationGender,
  weightKg: number,
  heightCm: number,
  ageYears: number,
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  const genderConstant = gender === "MALE" ? 5 : gender === "FEMALE" ? -161 : -78;
  return Math.round(base + genderConstant);
}

/**
 * Computes Total Daily Energy Expenditure from a BMR and activity level.
 *
 * @returns TDEE in kcal/day, rounded to a whole number.
 */
export function calculateTdee(bmr: number, activityMultiplier: number): number {
  return Math.round(bmr * activityMultiplier);
}

/**
 * Runs the full calorie calculation for a profile: BMR → TDEE → goal-adjusted
 * daily target, clamped to a conservative nutritional floor.
 *
 * @param profile - The normalized nutrition profile.
 * @returns The structured calorie calculation.
 */
export function calculateCalories(profile: NutritionProfile): CalorieCalculation {
  const bmr = calculateBmr(
    profile.gender,
    profile.currentWeightKg,
    profile.heightCm,
    profile.ageYears,
  );
  const activityMultiplier = ACTIVITY_MULTIPLIERS[profile.activityLevel];
  const tdee = calculateTdee(bmr, activityMultiplier);

  const goal = deriveWeightGoal(profile.currentWeightKg, profile.targetWeightKg);
  const goalAdjustmentPct = GOAL_CALORIE_ADJUSTMENT[goal];

  const adjusted = Math.round(tdee * (1 + goalAdjustmentPct));
  const dailyCalories = Math.max(adjusted, MIN_DAILY_CALORIES);

  return { bmr, tdee, dailyCalories, activityMultiplier, goal, goalAdjustmentPct };
}
