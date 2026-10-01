import assert from "node:assert/strict";
import test from "node:test";

import { toBarcodeScanResult, toNutritionLabelScanResult, toPhotoScanResult } from "./nutrition-scan-result";
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
  assert.equal(scan.nutritionReference.basis, "PER_100_G");
  assert.equal(scan.nutritionReference.grams, 100);
  assert.equal(scan.product?.quantity, "50 g");
  assert.equal("consumedAmount" in scan, false);
  assert.equal("consumedAmount" in (scan.product ?? {}), false);
  assert.equal(scan.nutrients.reference.energyKcal, 520);
  assert.equal(scan.nutrients.per100g?.energyKcal, 520);
  assert.equal(scan.nutrients.perServing.energyKcal, 130);
  assert.equal(scan.nutrients.estimated, false);
  assert.equal(scan.dataQuality?.status, "QUALITY_ACCEPTED");
});

test("barcode normalized scan marks incomplete but usable nutrition as partial without exposing its enum as copy", () => {
  const scan = toBarcodeScanResult({
    ...food,
    brand: null,
    quantity: null,
    serving: null,
    nutrientsPer100g: {
      ...food.nutrientsPer100g,
      carbohydratesG: null,
      fatG: null,
      saturatedFatG: null,
      sugarsG: null,
      fiberG: null,
      sodiumMg: null,
      saltG: null,
    },
  });
  assert.equal(scan.dataQuality?.status, "QUALITY_PARTIAL");
  assert.equal(scan.disclaimer, null);
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
  assert.equal(scan.nutrients.reference.energyKcal, 520);
});

test("barcode scan does not invent a source serving when only the 100 g reference exists", () => {
  const scan = toBarcodeScanResult({ ...food, serving: null, nutrientsPerServing: null });
  assert.equal(scan.serving.grams, null);
  assert.equal(scan.serving.description, null);
  assert.equal(scan.nutritionReference.basis, "PER_100_G");
  assert.equal(scan.nutritionReference.grams, 100);
  assert.equal(scan.nutrients.reference.energyKcal, 520);
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
  assert.equal(scan.nutritionReference.basis, "PER_SERVING");
  assert.equal(scan.nutritionReference.grams, 250);
  assert.equal(scan.nutrients.reference.energyKcal, 340);
  assert.equal(scan.nutrients.perServing.energyKcal, 340);
});


test("nutrition-label scan keeps dry and prepared references separate", () => {
  const scan = toNutritionLabelScanResult({
    ...food,
    provider: "DIEWISH",
    productUsage: { type: "BREWING", basis: "SOURCE_CATEGORY", evidence: ["black tea"] },
    provenance: {
      ...food.provenance,
      provider: "DIEWISH",
      sourceReference: "USER_CONFIRMED_PACKAGE_LABEL",
      preparationState: "AS_SOLD",
    },
    additionalNutritionReferences: [{
      basis: "PER_100_G",
      description: "100 g hazırlanmış ürün",
      grams: 100,
      preparationState: "PREPARED",
      nutrients: { ...food.nutrientsPer100g, energyKcal: 1, proteinG: 0, carbohydratesG: 0, fatG: 0 },
    }],
  });
  assert.equal(scan.nutritionReference.description, "100 g hazırlanma öncesi ürün");
  assert.equal(scan.additionalNutritionReferences.length, 1);
  assert.equal(scan.additionalNutritionReferences[0]?.nutrients.energyKcal, 1);
  assert.equal("consumedAmount" in scan.additionalNutritionReferences[0]!, false);
});
