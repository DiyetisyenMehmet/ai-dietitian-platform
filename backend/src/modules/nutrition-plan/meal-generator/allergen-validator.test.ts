import assert from "node:assert/strict";
import test from "node:test";

import type { DailyPlan } from "../types";
import { findAllergenViolations } from "./allergen-validator";

function cycle(food: { name: string; ingredients?: string[] }): DailyPlan[] {
  return [{
    dayLabel: "1. Gün",
    meals: [{
      name: "Öğle",
      time: "12:00",
      foods: [{ ...food, portion: "1 porsiyon", calories: 300 }],
      calories: 300,
      proteinGrams: 20,
      carbsGrams: 35,
      fatGrams: 8,
      explanation: "test",
    }],
    totalCalories: 300,
    totalProteinGrams: 20,
    totalCarbsGrams: 35,
    totalFatGrams: 8,
  }];
}

test("allergy-constrained plan rejects missing ingredient evidence as UNKNOWN", () => {
  const violations = findAllergenViolations(cycle({ name: "Granola bar" }), ["peanut"]);
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.reason, "UNKNOWN");
});

test("allergy-constrained plan rejects explicit ingredient match as KNOWN_RISK", () => {
  const violations = findAllergenViolations(
    cycle({ name: "Rice bowl", ingredients: ["rice", "peanut sauce"] }),
    ["peanut"],
  );
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.reason, "KNOWN_RISK");
  assert.deepEqual(violations[0]?.matchedAllergens, ["peanut"]);
});

test("complete ingredient evidence with no match passes the allergen gate", () => {
  assert.deepEqual(
    findAllergenViolations(
      cycle({ name: "Rice bowl", ingredients: ["rice", "olive oil"] }),
      ["peanut"],
    ),
    [],
  );
});

test("users without declared allergies keep the existing plan path", () => {
  assert.deepEqual(findAllergenViolations(cycle({ name: "Granola bar" }), []), []);
});
