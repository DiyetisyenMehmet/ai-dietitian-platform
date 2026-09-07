import type { NutritionProfile } from "./types";

/**
 * Deterministic eligibility guard for the ordinary automated meal-plan engine.
 *
 * This is a routing/safety decision, not a diagnosis. BMI is used only as a
 * screening signal to keep profiles that require more individual clinical
 * assessment out of the generic calorie/macro -> AI meal generation path.
 *
 * References used for the conservative V1 boundaries:
 * - WHO: BMI < 16 kg/m² is severe thinness / an extreme risk boundary.
 * - NICE CG32: BMI < 16 kg/m² is a high-risk refeeding criterion.
 * - CDC: BMI >= 40 kg/m² is class 3 (severe) obesity.
 * - BMI < 18.5 kg/m² is underweight; Diewish must not automate a target that
 *   intentionally lands below that screening threshold.
 */
const MIN_ORDINARY_PLAN_AGE_YEARS = 18;
const SEVERE_THINNESS_BMI = 16;
const UNDERWEIGHT_BMI = 18.5;
const SEVERE_OBESITY_BMI = 40;

export type NutritionPlanSafetyReason =
  | "AGE_REQUIRES_SPECIALIZED_PLAN"
  | "CURRENT_BMI_SEVERE_THINNESS"
  | "CURRENT_BMI_SEVERE_OBESITY"
  | "TARGET_BMI_UNDERWEIGHT";

export interface NutritionPlanSafetyAssessment {
  eligible: boolean;
  reasons: NutritionPlanSafetyReason[];
}

export function calculateProfileBmi(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

export function assessNutritionPlanSafety(profile: NutritionProfile): NutritionPlanSafetyAssessment {
  const reasons: NutritionPlanSafetyReason[] = [];

  if (profile.ageYears < MIN_ORDINARY_PLAN_AGE_YEARS) {
    reasons.push("AGE_REQUIRES_SPECIALIZED_PLAN");
  }

  const currentBmi = calculateProfileBmi(profile.currentWeightKg, profile.heightCm);
  const targetBmi = calculateProfileBmi(profile.targetWeightKg, profile.heightCm);

  if (currentBmi < SEVERE_THINNESS_BMI) {
    reasons.push("CURRENT_BMI_SEVERE_THINNESS");
  } else if (currentBmi >= SEVERE_OBESITY_BMI) {
    reasons.push("CURRENT_BMI_SEVERE_OBESITY");
  }

  if (targetBmi < UNDERWEIGHT_BMI) {
    reasons.push("TARGET_BMI_UNDERWEIGHT");
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}
