import assert from "node:assert/strict";
import { test } from "node:test";

import { applyFoodNutritionFallback } from "./food-scan-fallback";
import type { FoodScanResult } from "./types";

function emptyResult(): FoodScanResult {
  return {
    isFood: true,
    confidence: 85,
    reason: "İncir reçeli",
    dishName: "İncir Reçeli",
    estimatedPortion: "Yaklaşık 200 g",
    estimatedGrams: 200,
    ingredients: [
      { name: "incir", estimatedGrams: 110, confidence: 85, optional: false, included: true, matchedFood: null, nutrients: null },
      { name: "toz şeker", estimatedGrams: 80, confidence: 90, optional: false, included: true, matchedFood: null, nutrients: null },
    ],
    totals: {
      energyKcal: null,
      proteinG: null,
      carbohydratesG: null,
      fatG: null,
      saturatedFatG: null,
      sugarsG: null,
      fiberG: null,
      sodiumMg: null,
      saltG: null,
    },
    disclaimer: "Görsel tahminidir.",
  };
}

test("recognized fig jam receives clearly labeled AI nutrition only after deterministic totals are empty", async () => {
  let called = 0;
  const result = await applyFoodNutritionFallback(emptyResult(), async () => {
    called += 1;
    return {
      confidence: 0.55,
      rationale: "Typical recipe",
      per100g: {
        energyKcal: 260,
        proteinG: 0.6,
        carbohydratesG: 64,
        fatG: 0.3,
        saturatedFatG: 0.05,
        sugarsG: 58,
        fiberG: 2.2,
        sodiumMg: 12,
        saltG: 0.03,
      },
    };
  });
  assert.equal(called, 1);
  assert.equal(result.totals.energyKcal, 520);
  assert.equal(result.totals.carbohydratesG, 128);
  assert.equal(result.nutritionResolution?.method, "AI_ESTIMATE");
  assert.equal(result.nutritionResolution?.providers.length, 0);
});

test("deterministic nutrition suppresses the AI estimator", async () => {
  const base = emptyResult();
  base.totals.energyKcal = 300;
  base.ingredients[0]!.matchedFood = {
    externalId: "usda-fig",
    provider: "USDA",
    displayNameTr: "İncir",
    confidence: 0.9,
  };
  base.ingredients[0]!.nutrients = { ...base.totals };
  let called = 0;
  const result = await applyFoodNutritionFallback(base, async () => {
    called += 1;
    return null;
  });
  assert.equal(called, 0);
  assert.notEqual(result.nutritionResolution?.method, "AI_ESTIMATE");
  assert.deepEqual(result.nutritionResolution?.providers, ["USDA"]);
});
