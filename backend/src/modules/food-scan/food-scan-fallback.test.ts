import assert from "node:assert/strict";
import { test } from "node:test";

import { applyFoodNutritionFallback, finalizeFoodScanRecalculation } from "./food-scan-fallback";
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

const figJamEstimate = {
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

test("recognized fig jam receives clearly labeled AI nutrition only after deterministic core facts are insufficient", async () => {
  let called = 0;
  const result = await applyFoodNutritionFallback(emptyResult(), async () => {
    called += 1;
    return figJamEstimate;
  });
  assert.equal(called, 1);
  assert.equal(result.totals.energyKcal, 520);
  assert.equal(result.totals.carbohydratesG, 128);
  assert.equal(result.nutritionResolution?.method, "AI_ESTIMATE");
  assert.equal(result.nutritionResolution?.providers.length, 0);
});

test("complete deterministic core nutrition suppresses the AI estimator", async () => {
  const base = emptyResult();
  base.totals.energyKcal = 300;
  base.totals.proteinG = 1;
  base.totals.carbohydratesG = 72;
  base.totals.fatG = 0.5;
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

test("partial deterministic facts do not block a complete last-resort AI estimate", async () => {
  const base = emptyResult();
  base.totals.energyKcal = 300;
  base.ingredients[0]!.matchedFood = {
    externalId: "partial-source",
    provider: "USDA",
    displayNameTr: "İncir",
    confidence: 0.8,
  };
  base.ingredients[0]!.nutrients = { ...base.totals };
  let called = 0;
  const result = await applyFoodNutritionFallback(base, async () => {
    called += 1;
    return figJamEstimate;
  });
  assert.equal(called, 1);
  assert.equal(result.nutritionResolution?.method, "AI_ESTIMATE");
  assert.equal(result.totals.proteinG, 1.2);
});

test("failed AI estimate preserves partial deterministic facts instead of erasing them", async () => {
  const base = emptyResult();
  base.totals.energyKcal = 300;
  base.ingredients[0]!.matchedFood = {
    externalId: "partial-source",
    provider: "USDA",
    displayNameTr: "İncir",
    confidence: 0.8,
  };
  base.ingredients[0]!.nutrients = { ...base.totals };
  const result = await applyFoodNutritionFallback(base, async () => null);
  assert.equal(result.totals.energyKcal, 300);
  assert.notEqual(result.nutritionResolution?.method, "UNAVAILABLE");
  assert.deepEqual(result.nutritionResolution?.providers, ["USDA"]);
});

test("recalculation receives a fresh provenance decision and cannot retain stale AI labeling", async () => {
  const totals = {
    energyKcal: 300,
    proteinG: 1,
    carbohydratesG: 72,
    fatG: 0.5,
    saturatedFatG: null,
    sugarsG: 60,
    fiberG: 2,
    sodiumMg: 10,
    saltG: 0.03,
  };
  const result = await finalizeFoodScanRecalculation("İncir reçeli", {
    estimatedGrams: 200,
    totals,
    ingredients: [{
      name: "incir reçeli",
      estimatedGrams: 200,
      confidence: 100,
      optional: false,
      included: true,
      matchedFood: {
        externalId: "verified-jam",
        provider: "USDA",
        displayNameTr: "İncir reçeli",
        confidence: 0.9,
      },
      nutrients: totals,
    }],
  }, async () => {
    throw new Error("AI must not be called");
  });
  assert.equal(result.nutritionResolution?.method, "VERIFIED_SOURCE");
  assert.deepEqual(result.nutritionResolution?.providers, ["USDA"]);
});
