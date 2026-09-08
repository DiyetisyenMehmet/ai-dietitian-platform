import assert from "node:assert/strict";
import { test } from "node:test";

import { FoodScanService, type NutritionLookupPort } from "./food-scan.service";
import type { CanonicalFood } from "../nutrition-data/nutrition-data.types";

function food(name: string, kcal: number, protein: number, carbs: number, fat: number): CanonicalFood {
  return {
    externalId: name,
    provider: "USDA",
    name,
    displayNameTr: name,
    brand: null,
    barcode: null,
    imageUrl: null,
    quantity: null,
    serving: null,
    nutrientsPer100g: {
      energyKcal: kcal,
      proteinG: protein,
      carbohydratesG: carbs,
      fatG: fat,
      saturatedFatG: null,
      sugarsG: null,
      fiberG: null,
      sodiumMg: null,
      saltG: null,
    },
    ingredients: [], allergens: [], additives: [], labels: [], vegan: null, vegetarian: null, glutenFree: null,
    nutriScore: null, novaGroup: null,
    provenance: { provider: "USDA", externalId: name, retrievedAt: new Date(0).toISOString(), dataBasis: "PER_100_G", confidence: 0.95 },
  };
}

const lookup: NutritionLookupPort = {
  async search(query) {
    if (query === "fasulye") return [food("fasulye", 120, 8, 20, 1)];
    if (query === "yağ") return [food("yağ", 900, 0, 0, 100)];
    return [];
  },
};

test("ingredient corrections are recalculated deterministically from provider facts", async () => {
  const service = new FoodScanService(lookup);
  const result = await service.recalculate([
    { name: "fasulye", grams: 200, included: true },
    { name: "yağ", grams: 10, included: true },
  ]);
  assert.equal(result.totals.energyKcal, 330);
  assert.equal(result.totals.proteinG, 16);
  assert.equal(result.totals.carbohydratesG, 40);
  assert.equal(result.totals.fatG, 12);
});

test("excluded uncertain ingredients do not contribute to totals", async () => {
  const service = new FoodScanService(lookup);
  const result = await service.recalculate([
    { name: "fasulye", grams: 200, included: true },
    { name: "yağ", grams: 10, included: false },
  ]);
  assert.equal(result.totals.energyKcal, 240);
  assert.equal(result.ingredients[1]?.nutrients, null);
});

test("unmatched ingredient never receives invented nutrient numbers", async () => {
  const service = new FoodScanService(lookup);
  const result = await service.recalculate([{ name: "bilinmeyen", grams: 100, included: true }]);
  assert.equal(result.ingredients[0]?.matchedFood, null);
  assert.equal(result.ingredients[0]?.nutrients, null);
  assert.equal(result.totals.energyKcal, null);
});

test("zero and extreme serving corrections are rejected", async () => {
  const service = new FoodScanService(lookup);
  await assert.rejects(service.recalculate([{ name: "fasulye", grams: 0, included: true }]));
  await assert.rejects(service.recalculate([{ name: "fasulye", grams: 5001, included: true }]));
});
