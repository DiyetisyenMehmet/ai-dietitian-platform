import assert from "node:assert/strict";
import test from "node:test";

import { toBarcodeScanResult, toPhotoScanResult } from "./nutrition-scan-result";
import type { CanonicalFood } from "./nutrition-data.types";

const food: CanonicalFood = {
  externalId: "123",
  provider: "OPEN_FOOD_FACTS",
  name: "Bar",
  displayNameTr: "Protein bar",
  brand: "Diewish Test",
  barcode: "4006381333931",
  imageUrl: null,
  quantity: "50 g",
  serving: { amount: 25, unit: "g", gramWeight: 25, description: "1/2 paket" },
  nutrientsPer100g: {
    energyKcal: 520,
    proteinG: 20,
    carbohydratesG: 40,
    fatG: 25,
    saturatedFatG: 5,
    sugarsG: 10,
    fiberG: 8,
    sodiumMg: 200,
    saltG: 0.5,
  },
  ingredients: ["yulaf"],
  allergens: [],
  additives: [],
  labels: [],
  vegan: null,
  vegetarian: null,
  glutenFree: null,
  nutriScore: null,
  novaGroup: null,
  provenance: {
    provider: "OPEN_FOOD_FACTS",
    externalId: "123",
    retrievedAt: "2026-09-08T00:00:00.000Z",
    dataBasis: "PER_100_G",
    confidence: 0.75,
  },
};

test("barcode normalized scan derives serving values from per-100g data when provider serving values are absent", () => {
  const scan = toBarcodeScanResult(food);
  assert.equal(scan.scanType, "BARCODE");
  assert.equal(scan.serving.grams, 25);
  assert.equal(scan.nutrients.per100g?.energyKcal, 520);
  assert.equal(scan.nutrients.perServing.energyKcal, 130);
  assert.equal(scan.nutrients.estimated, false);
});

test("barcode normalized scan prefers provider-declared serving nutrients when available", () => {
  const scan = toBarcodeScanResult({
    ...food,
    nutrientsPerServing: {
      energyKcal: 128,
      proteinG: 4.8,
      carbohydratesG: 9.7,
      fatG: 6.1,
      saturatedFatG: 1.2,
      sugarsG: 2.4,
      fiberG: 1.9,
      sodiumMg: 48,
      saltG: 0.12,
    },
  });
  assert.equal(scan.serving.grams, 25);
  assert.equal(scan.nutrients.perServing.energyKcal, 128);
  assert.equal(scan.nutrients.perServing.proteinG, 4.8);
});

test("photo normalized scan keeps recognition estimation separate from nutrition source", () => {
  const scan = toPhotoScanResult({
    dishName: "Kuru fasulye",
    confidence: 90,
    estimatedPortion: "1 kase",
    estimatedGrams: 250,
    totals: { ...food.nutrientsPer100g, energyKcal: 340 },
    disclaimer: "Tahminidir.",
    ingredients: [{
      name: "kuru fasulye",
      estimatedGrams: 180,
      included: true,
      confidence: 95,
      optional: false,
      matchedFood: { provider: "USDA", externalId: "999", confidence: 0.95 },
    }],
  });
  assert.equal(scan.scanType, "PHOTO");
  assert.equal(scan.provenance.recognition, "AI_ESTIMATED");
  assert.equal(scan.provenance.nutrition[0]?.provider, "USDA");
  assert.equal(scan.nutrients.per100g, null);
  assert.equal(scan.nutrients.perServing.energyKcal, 340);
});
