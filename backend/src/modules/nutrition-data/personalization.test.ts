import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveNutritionPersonalization } from "./personalization";

test("personalization derives target contribution and remaining budgets deterministically", () => {
  const result = deriveNutritionPersonalization(
    { energyKcal: 400, proteinG: 30, carbohydratesG: 40, fatG: 12, saturatedFatG: null, sugarsG: 8, fiberG: 6, sodiumMg: 500, saltG: 1.25 },
    { calories: 2000, proteinG: 100, carbohydratesG: 200, fatG: 60, mealsPerDay: 4 },
    { calories: 700, proteinG: 30, carbohydratesG: 70, fatG: 20 },
  );
  assert.equal(result.contribution.caloriesPercent, 20);
  assert.equal(result.contribution.proteinPercent, 30);
  assert.equal(result.remainingAfter.calories, 900);
  assert.equal(result.remainingAfter.proteinG, 40);
  assert.equal(result.portionFit, "BALANCED");
  assert.equal(result.satiety, "HIGH");
});

test("missing nutrient values stay unavailable instead of becoming zero", () => {
  const result = deriveNutritionPersonalization(
    { energyKcal: null, proteinG: null, carbohydratesG: null, fatG: null, saturatedFatG: null, sugarsG: null, fiberG: null, sodiumMg: null, saltG: null },
    { calories: 2000, proteinG: 100, carbohydratesG: 200, fatG: 60, mealsPerDay: 3 },
    { calories: 0, proteinG: 0, carbohydratesG: 0, fatG: 0 },
  );
  assert.equal(result.contribution.caloriesPercent, null);
  assert.equal(result.remainingAfter.calories, null);
  assert.equal(result.portionFit, "UNKNOWN");
  assert.equal(result.satiety, "UNKNOWN");
});
