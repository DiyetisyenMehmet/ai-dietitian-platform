import assert from "node:assert/strict";
import { test } from "node:test";

import { sanitizeFoodNutritionEstimate } from "./food-nutrition-estimator";

test("AI estimate accepts a plausible internally consistent fig-jam profile", () => {
  const value = sanitizeFoodNutritionEstimate({
    confidence: 0.58,
    rationale: "Typical fig jam",
    per100g: {
      energyKcal: 260,
      proteinG: 0.6,
      carbohydratesG: 64,
      fatG: 0.3,
      saturatedFatG: 0.05,
      sugarsG: 58,
      fiberG: 2.2,
      sodiumMg: 12,
      saltG: null,
    },
  });
  assert.ok(value);
  assert.equal(value.per100g.energyKcal, 260);
  assert.equal(value.per100g.saltG, 0.03);
  assert.equal(value.confidence, 0.58);
});

test("AI estimate rejects impossible sugar and calorie relationships", () => {
  assert.equal(sanitizeFoodNutritionEstimate({
    confidence: 0.9,
    per100g: {
      energyKcal: 50,
      proteinG: 2,
      carbohydratesG: 10,
      fatG: 1,
      sugarsG: 90,
    },
  }), null);
});

test("AI estimate rejects macro/calorie inconsistency", () => {
  assert.equal(sanitizeFoodNutritionEstimate({
    confidence: 0.6,
    per100g: {
      energyKcal: 800,
      proteinG: 1,
      carbohydratesG: 5,
      fatG: 1,
    },
  }), null);
});
