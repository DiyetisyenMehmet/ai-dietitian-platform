import assert from "node:assert/strict";
import test from "node:test";

import { findNutritionTargetViolations } from "./nutrition-target-validator";
import type { DailyPlan, NutritionPlanAIInput, PlannedMeal } from "../types";

const input: NutritionPlanAIInput = {
  goal: "LOSE_WEIGHT",
  dailyCalories: 2000,
  proteinGrams: 100,
  carbsGrams: 200,
  fatGrams: 80,
  waterMl: 2500,
  mealTiming: {
    mealsPerDay: 1,
    slots: [{ name: "Dinner", time: "19:00", calorieShare: 1 }],
  },
  dietaryPreference: "OMNIVORE",
  allergies: [],
  healthConditions: [],
  bloodTestImplications: [],
  cycleLengthDays: 1,
};

function meal(overrides: Partial<PlannedMeal> = {}): PlannedMeal {
  return {
    name: "Dinner",
    time: "19:00",
    foods: [{ name: "Test meal", portion: "1 porsiyon", calories: 2000 }],
    calories: 2000,
    proteinGrams: 100,
    carbsGrams: 200,
    fatGrams: 80,
    explanation: "Test",
    ...overrides,
  };
}

function day(overrides: Partial<DailyPlan> = {}): DailyPlan {
  return {
    dayLabel: "Day 1",
    meals: [meal()],
    totalCalories: 2000,
    totalProteinGrams: 100,
    totalCarbsGrams: 200,
    totalFatGrams: 80,
    ...overrides,
  };
}

test("accepts daily totals that match deterministic targets and meal sums", () => {
  assert.deepEqual(findNutritionTargetViolations([day()], input), []);
});

test("flags a daily calorie value outside the deterministic target tolerance", () => {
  const result = findNutritionTargetViolations(
    [day({ meals: [meal({ calories: 1500 })], totalCalories: 1500 })],
    input,
  );

  assert.deepEqual(result, [{ dayLabel: "Day 1", field: "calories", kind: "TARGET_MISMATCH" }]);
});

test("flags a mismatch between reported daily calories and persisted meal calories", () => {
  const result = findNutritionTargetViolations(
    [day({ meals: [meal({ calories: 1800 })] })],
    input,
  );

  assert.deepEqual(result, [{ dayLabel: "Day 1", field: "calories", kind: "MEAL_SUM_MISMATCH" }]);
});

test("rejects non-finite nutrition values before target comparison", () => {
  const result = findNutritionTargetViolations([day({ totalProteinGrams: Number.NaN })], input);

  assert.deepEqual(result, [{ dayLabel: "Day 1", field: "protein", kind: "INVALID_VALUE" }]);
});

test("uses macro tolerances independently from calorie tolerances", () => {
  const result = findNutritionTargetViolations(
    [
      day({
        meals: [meal({ proteinGrams: 130 })],
        totalProteinGrams: 130,
      }),
    ],
    input,
  );

  assert.deepEqual(result, [{ dayLabel: "Day 1", field: "protein", kind: "TARGET_MISMATCH" }]);
});
