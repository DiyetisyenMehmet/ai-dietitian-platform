import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FoodScanService,
  sanitizeVisionEdibleWeight,
  scaleCorrectionsToTarget,
  type NutritionLookupPort,
} from "./food-scan.service";
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
      externalId: name,
      retrievedAt: new Date(0).toISOString(),
      dataBasis: "PER_100_G",
      confidence: 0.95,
    },
  };
}

const lookup: NutritionLookupPort = {
  async search(query) {
    if (query === "fasulye") return [food("fasulye", 120, 8, 20, 1)];
    if (query === "yağ") return [food("yağ", 900, 0, 0, 100)];
    return [];
  },
};

test("explicit rind-inclusive vision weight is blocked before nutrition arithmetic", () => {
  const vision = sanitizeVisionEdibleWeight({
    isFood: true,
    confidence: 100,
    reason: "Karpuz dilimi",
    dishName: "Karpuz",
    estimatedPortion: "Yaklaşık 1 büyük dilim (kabuklu ağırlığı dahil)",
    estimatedGrams: 950,
    ingredients: [
      { name: "karpuz", estimatedGrams: 950, confidence: 100, optional: false },
    ],
    disclaimer: "Görsel tahminidir.",
  });

  assert.equal(vision.estimatedGrams, null);
  assert.equal(vision.ingredients[0]?.estimatedGrams, null);
  assert.equal(vision.estimatedPortion, "Yaklaşık porsiyon; yenilebilir gram miktarı ayrı belirlenemedi.");
});

test("explicit edible-only vision weight remains available for deterministic calculation", () => {
  const original = {
    isFood: true,
    confidence: 98,
    reason: "Karpuzun yenilebilir iç kısmı görülüyor",
    dishName: "Karpuz",
    estimatedPortion: "Yaklaşık 1 büyük dilim, yenilebilir iç kısım",
    estimatedGrams: 600,
    ingredients: [
      { name: "karpuz", estimatedGrams: 600, confidence: 98, optional: false },
    ],
    disclaimer: "Yenilebilir kısım tahminidir.",
  } as const;

  const vision = sanitizeVisionEdibleWeight(original);
  assert.equal(vision, original);
  assert.equal(vision.estimatedGrams, 600);
  assert.equal(vision.ingredients[0]?.estimatedGrams, 600);
});

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
  assert.equal(result.estimatedGrams, 210);
});

test("excluded uncertain ingredients do not contribute to totals", async () => {
  const service = new FoodScanService(lookup);
  const result = await service.recalculate([
    { name: "fasulye", grams: 200, included: true },
    { name: "yağ", grams: 10, included: false },
  ]);
  assert.equal(result.totals.energyKcal, 240);
  assert.equal(result.ingredients[1]?.nutrients, null);
  assert.equal(result.estimatedGrams, 200);
});

test("unmatched ingredient never receives invented nutrient numbers", async () => {
  const service = new FoodScanService(lookup);
  const result = await service.recalculate([{ name: "bilinmeyen", grams: 100, included: true }]);
  assert.equal(result.ingredients[0]?.matchedFood, null);
  assert.equal(result.ingredients[0]?.nutrients, null);
  assert.equal(result.totals.energyKcal, null);
});

test("irrelevant provider search noise is rejected before nutrition calculation", async () => {
  const noisyLookup: NutritionLookupPort = {
    async search() {
      return [food("VE WONG / FRIED GLUTEN", 390, 21, 40, 16)];
    },
  };
  const service = new FoodScanService(noisyLookup);
  const result = await service.recalculate([
    { name: "domates sosu ve salça", grams: 30, included: true },
  ]);
  assert.equal(result.ingredients[0]?.matchedFood, null);
  assert.equal(result.ingredients[0]?.nutrients, null);
  assert.equal(result.totals.energyKcal, null);
});

test("Turkish ingredient aliases can resolve a relevant USDA candidate", async () => {
  const aliasLookup: NutritionLookupPort = {
    async search() {
      return [food("Onions, cooked, boiled, drained, without salt", 44, 1.4, 10.2, 0.2)];
    },
  };
  const service = new FoodScanService(aliasLookup);
  const result = await service.recalculate([{ name: "soğan", grams: 50, included: true }]);
  assert.equal(result.ingredients[0]?.matchedFood?.provider, "USDA");
  assert.equal(result.totals.energyKcal, 22);
});

test("total plate weight scales included ingredient amounts deterministically", async () => {
  const service = new FoodScanService(lookup);
  const result = await service.recalculate(
    [
      { name: "fasulye", grams: 200, included: true },
      { name: "yağ", grams: 10, included: true },
    ],
    250,
  );
  assert.equal(result.estimatedGrams, 250);
  assert.equal(
    Math.round(result.ingredients.reduce((sum, item) => sum + (item.included ? item.estimatedGrams ?? 0 : 0), 0) * 10) / 10,
    250,
  );
  assert.equal(result.totals.energyKcal !== null && result.totals.energyKcal > 330, true);
});

test("excluded ingredients are not scaled into target plate weight", () => {
  const scaled = scaleCorrectionsToTarget(
    [
      { name: "fasulye", grams: 200, included: true },
      { name: "yağ", grams: 20, included: false },
    ],
    250,
  );
  assert.equal(scaled[0]?.grams, 250);
  assert.equal(scaled[1]?.grams, 20);
});

test("zero and extreme serving corrections are rejected", async () => {
  const service = new FoodScanService(lookup);
  await assert.rejects(service.recalculate([{ name: "fasulye", grams: 0, included: true }]));
  await assert.rejects(service.recalculate([{ name: "fasulye", grams: 5001, included: true }]));
  await assert.rejects(service.recalculate([{ name: "fasulye", grams: 100, included: true }], 0));
  await assert.rejects(service.recalculate([{ name: "fasulye", grams: 100, included: true }], 5001));
});
