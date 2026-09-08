import assert from "node:assert/strict";
import { test } from "node:test";

import { calculatePortion, compareByCalories, sumPortions } from "./nutrition-calculator";
import type { CanonicalFood, NutrientValues } from "./nutrition-data.types";

const base: NutrientValues = {
  energyKcal: 165,
  proteinG: 31,
  carbohydratesG: 0,
  fatG: 3.6,
  saturatedFatG: 1,
  sugarsG: 0,
  fiberG: 0,
  sodiumMg: 74,
  saltG: 0.185,
};

test("scales per-100g nutrients deterministically", () => {
  const result = calculatePortion(base, 200);
  assert.equal(result.nutrients.energyKcal, 330);
  assert.equal(result.nutrients.proteinG, 62);
  assert.equal(result.nutrients.sodiumMg, 148);
});

test("preserves missing nutrients instead of inventing values", () => {
  const result = calculatePortion({ ...base, fiberG: null }, 150);
  assert.equal(result.nutrients.fiberG, null);
});

test("rejects zero and extreme servings", () => {
  assert.throws(() => calculatePortion(base, 0), RangeError);
  assert.throws(() => calculatePortion(base, 5001), RangeError);
});

test("sums ingredient portions and calculates calorie-equivalent servings", () => {
  const summed = sumPortions([
    { nutrientsPer100g: base, grams: 100 },
    { nutrientsPer100g: { ...base, energyKcal: 100 }, grams: 50 },
  ]);
  assert.equal(summed.energyKcal, 215);

  const food: CanonicalFood = {
    externalId: "x",
    provider: "USDA",
    name: "test",
    displayNameTr: "test",
    brand: null,
    barcode: null,
    imageUrl: null,
    quantity: null,
    serving: null,
    nutrientsPer100g: base,
    ingredients: [],
    allergens: [],
    additives: [],
    labels: [],
    vegan: null,
    vegetarian: null,
    glutenFree: null,
    nutriScore: null,
    novaGroup: null,
    provenance: {
      provider: "USDA",
      externalId: "x",
      retrievedAt: new Date(0).toISOString(),
      dataBasis: "PER_100_G",
      confidence: 0.95,
    },
  };
  const comparison = compareByCalories(food, 330);
  assert.equal(comparison.servingGrams, 200);
  assert.equal(comparison.nutrients?.proteinG, 62);
});
