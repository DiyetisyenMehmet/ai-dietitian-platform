import assert from "node:assert/strict";
import { test } from "node:test";

import { buildUserConfirmedPackageLabelFood, normalizePackageLabelDraft } from "./package-label";

test("normalizes OCR label values without inventing missing fields", () => {
  const draft = normalizePackageLabelDraft({
    productName: "Test Yoğurt",
    basis: "PER_100_G",
    confidence: 0.87,
    nutrients: { energyKcal: 70, proteinG: 4, carbohydratesG: 5, fatG: 3 },
  });
  assert.equal(draft.productName, "Test Yoğurt");
  assert.equal(draft.nutrients.sugarsG, null);
  assert.equal(draft.confidence, 0.87);
});

test("confirmed per-serving label is converted deterministically to per 100 g", () => {
  const food = buildUserConfirmedPackageLabelFood("4006381333931", {
    productName: "Test Bar",
    brand: "Diewish Test",
    quantity: "50 g",
    basis: "PER_SERVING",
    servingGrams: 50,
    energyKj: null,
    nutrients: {
      energyKcal: 100,
      proteinG: 5,
      carbohydratesG: 12,
      fatG: 4,
      saturatedFatG: 1,
      sugarsG: 6,
      fiberG: 2,
      sodiumMg: null,
      saltG: 0.2,
    },
    ingredients: ["yulaf", "kakao"],
    allergens: ["süt"],
    confidence: 0.8,
    warnings: [],
  });
  assert.equal(food.provider, "DIEWISH");
  assert.equal(food.nutrientsPer100g.energyKcal, 200);
  assert.equal(food.nutrientsPer100g.proteinG, 10);
  assert.equal(food.nutrientsPer100g.sodiumMg, 160);
  assert.equal(food.provenance.sourceReference, "USER_CONFIRMED_PACKAGE_LABEL");
});

test("confirmed label rejects impossible sugar/carbohydrate relationship", () => {
  assert.throws(() => buildUserConfirmedPackageLabelFood("4006381333931", {
    productName: "Invalid",
    brand: null,
    quantity: null,
    basis: "PER_100_G",
    servingGrams: null,
    energyKj: null,
    nutrients: {
      energyKcal: 100,
      proteinG: 2,
      carbohydratesG: 10,
      fatG: 2,
      saturatedFatG: 1,
      sugarsG: 20,
      fiberG: null,
      sodiumMg: null,
      saltG: null,
    },
    ingredients: [],
    allergens: [],
    confidence: 0.9,
    warnings: [],
  }));
});
