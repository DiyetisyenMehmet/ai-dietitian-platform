import type { DailyPlan, NutritionPlanAIInput } from "../types";

/**
 * Provider meal values are approximate, but persisted plans must stay bounded
 * around Diewish's deterministic targets and internally reconcile. These are
 * engineering tolerances, not medical thresholds.
 */
const DAILY_CALORIE_TARGET_TOLERANCE = 0.12;
const DAILY_MACRO_TARGET_TOLERANCE = 0.2;
const INTERNAL_TOTAL_TOLERANCE = 0.05;
const INTERNAL_CALORIE_ABSOLUTE_TOLERANCE = 75;
const INTERNAL_MACRO_ABSOLUTE_TOLERANCE_GRAMS = 5;

export interface NutritionTargetViolation {
  dayLabel: string;
  field: "calories" | "protein" | "carbs" | "fat";
  kind: "INVALID_VALUE" | "TARGET_MISMATCH" | "MEAL_SUM_MISMATCH";
}

function isValidNutritionValue(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function withinTolerance(
  actual: number,
  expected: number,
  ratio: number,
  absoluteTolerance = 0,
): boolean {
  if (!isValidNutritionValue(actual) || !isValidNutritionValue(expected)) return false;
  const allowedDifference = Math.max(absoluteTolerance, Math.abs(expected) * ratio);
  return Math.abs(actual - expected) <= allowedDifference;
}

function pushFieldViolation(
  violations: NutritionTargetViolation[],
  dayLabel: string,
  field: NutritionTargetViolation["field"],
  actual: number,
  target: number,
  mealSum: number,
  targetTolerance: number,
  internalAbsoluteTolerance: number,
): void {
  if (!isValidNutritionValue(actual) || !isValidNutritionValue(mealSum)) {
    violations.push({ dayLabel, field, kind: "INVALID_VALUE" });
    return;
  }

  if (!withinTolerance(actual, target, targetTolerance)) {
    violations.push({ dayLabel, field, kind: "TARGET_MISMATCH" });
  }

  if (
    !withinTolerance(
      actual,
      mealSum,
      INTERNAL_TOTAL_TOLERANCE,
      internalAbsoluteTolerance,
    )
  ) {
    violations.push({ dayLabel, field, kind: "MEAL_SUM_MISMATCH" });
  }
}

/**
 * Validates AI-reported daily totals against deterministic engine targets and
 * against the sum of the meal-level values that will actually be persisted.
 */
export function findNutritionTargetViolations(
  cycle: DailyPlan[],
  input: NutritionPlanAIInput,
): NutritionTargetViolation[] {
  const violations: NutritionTargetViolation[] = [];

  for (const day of cycle) {
    const mealCalories = day.meals.reduce((sum, meal) => sum + meal.calories, 0);
    const mealProtein = day.meals.reduce((sum, meal) => sum + meal.proteinGrams, 0);
    const mealCarbs = day.meals.reduce((sum, meal) => sum + meal.carbsGrams, 0);
    const mealFat = day.meals.reduce((sum, meal) => sum + meal.fatGrams, 0);

    pushFieldViolation(
      violations,
      day.dayLabel,
      "calories",
      day.totalCalories,
      input.dailyCalories,
      mealCalories,
      DAILY_CALORIE_TARGET_TOLERANCE,
      INTERNAL_CALORIE_ABSOLUTE_TOLERANCE,
    );
    pushFieldViolation(
      violations,
      day.dayLabel,
      "protein",
      day.totalProteinGrams,
      input.proteinGrams,
      mealProtein,
      DAILY_MACRO_TARGET_TOLERANCE,
      INTERNAL_MACRO_ABSOLUTE_TOLERANCE_GRAMS,
    );
    pushFieldViolation(
      violations,
      day.dayLabel,
      "carbs",
      day.totalCarbsGrams,
      input.carbsGrams,
      mealCarbs,
      DAILY_MACRO_TARGET_TOLERANCE,
      INTERNAL_MACRO_ABSOLUTE_TOLERANCE_GRAMS,
    );
    pushFieldViolation(
      violations,
      day.dayLabel,
      "fat",
      day.totalFatGrams,
      input.fatGrams,
      mealFat,
      DAILY_MACRO_TARGET_TOLERANCE,
      INTERNAL_MACRO_ABSOLUTE_TOLERANCE_GRAMS,
    );
  }

  return violations;
}
