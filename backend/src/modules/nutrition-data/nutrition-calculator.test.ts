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

const waferPer100g: NutrientValues = {
  energyKcal: 509,
  proteinG: 1.4,
  carbohydratesG: 60,
  fatG: 26,
  saturatedFatG: 13.1,
  sugarsG: 35.17,
  fiberG: 2.41,
  sodiumMg: 227.59,
  saltG: 0.586,
};

test("scales the food scanner reference portion from 509 kcal per 100 g", () => {
  const result = calculatePortion(waferPer100g, 29);
  assert.equal(result.grams, 29);
  assert.equal(result.nutrients.energyKcal, 147.61);
  assert.equal(result.nutrients.proteinG, 0.41);
  assert.equal(result.nutrients.carbohydratesG, 17.4);
  assert.equal(result.nutrients.fatG, 7.54);
  assert.equal(result.nutrients.saturatedFatG, 3.8);
  assert.equal(result.nutrients.sugarsG, 10.2);
  assert.equal(result.nutrients.fiberG, 0.7);
  assert.equal(result.nutrients.sodiumMg, 66);
  assert.equal(result.nutrients.saltG, 0.17);
});

test("keeps 1 g, 29 g, 50 g, 100 g and 150 g portions finite", () => {
  const matrix = new Map([
    [1, 5.09],
    [29, 147.61],
    [50, 254.5],
    [100, 509],
    [150, 763.5],
  ]);
  for (const [grams, kcal] of matrix) {
    const result = calculatePortion(waferPer100g, grams);
    assert.equal(result.nutrients.energyKcal, kcal);
    for (const value of Object.values(result.nutrients)) {
      assert.equal(value === null || Number.isFinite(value), true);
    }
  }
});

test("preserves missing nutrients instead of inventing values", () => {
  const result = calculatePortion({ ...base, fiberG: null }, 150);
  assert.equal(result.nutrients.fiberG, null);
});

test("rejects zero, non-finite and extreme servings", () => {
  assert.throws(() => calculatePortion(base, 0), RangeError);
  assert.throws(() => calculatePortion(base, Number.NaN), RangeError);
  assert.throws(() => calculatePortion(base, Number.POSITIVE_INFINITY), RangeError);
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
