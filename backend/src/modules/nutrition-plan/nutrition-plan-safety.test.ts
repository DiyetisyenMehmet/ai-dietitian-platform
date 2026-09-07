import assert from "node:assert/strict";
import test from "node:test";

import { assessNutritionPlanSafety, calculateProfileBmi } from "./nutrition-plan-safety";
import type { NutritionProfile } from "./types";

function profile(overrides: Partial<NutritionProfile> = {}): NutritionProfile {
  return {
    ageYears: 30,
    gender: "NEUTRAL",
    heightCm: 175,
    currentWeightKg: 70,
    targetWeightKg: 65,
    activityLevel: "MODERATE",
    dietaryPreference: "OMNIVORE",
    healthConditions: [],
    allergies: [],
    dailyWaterGoalMl: 2500,
    ...overrides,
  };
}

test("calculates BMI deterministically from kilograms and centimeters", () => {
  assert.ok(Math.abs(calculateProfileBmi(70, 175) - 22.8571428571) < 0.000001);
});

test("allows an ordinary adult profile inside the screening boundaries", () => {
  assert.deepEqual(assessNutritionPlanSafety(profile()), { eligible: true, reasons: [] });
});

test("routes minors away from ordinary automated plan generation", () => {
  assert.deepEqual(assessNutritionPlanSafety(profile({ ageYears: 17 })), {
    eligible: false,
    reasons: ["AGE_REQUIRES_SPECIALIZED_PLAN"],
  });
});

test("detects severe current thinness and an underweight target independently", () => {
  const result = assessNutritionPlanSafety(
    profile({ heightCm: 180, currentWeightKg: 45, targetWeightKg: 55 }),
  );

  assert.equal(result.eligible, false);
  assert.deepEqual(result.reasons, ["CURRENT_BMI_SEVERE_THINNESS", "TARGET_BMI_UNDERWEIGHT"]);
});

test("routes class-3 screening BMI away from ordinary automated generation", () => {
  const result = assessNutritionPlanSafety(profile({ currentWeightKg: 130 }));

  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("CURRENT_BMI_SEVERE_OBESITY"));
});

test("rejects a target that would intentionally land in the underweight range", () => {
  const result = assessNutritionPlanSafety(profile({ targetWeightKg: 55 }));

  assert.equal(result.eligible, false);
  assert.deepEqual(result.reasons, ["TARGET_BMI_UNDERWEIGHT"]);
});
