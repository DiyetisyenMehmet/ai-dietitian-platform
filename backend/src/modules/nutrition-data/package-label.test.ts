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
  assert.equal(food.nutrientsPer100g.sodiumMg, null);
  assert.equal(food.quantity, "50 g");
  assert.equal(food.serving?.gramWeight, 50);
  assert.equal(food.provenance.dataBasis, "PER_SERVING");
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


test("pure salt accepts real zero macros when salt or sodium is declared", () => {
  const food = buildUserConfirmedPackageLabelFood("4006381333931", {
    productName: "Saf Deniz Tuzu",
    brand: "Test",
    quantity: "500 g",
    productTypeText: "deniz tuzu",
    referenceState: "AS_SOLD",
    basis: "PER_100_G",
    servingGrams: null,
    energyKj: null,
    nutrients: {
      energyKcal: null,
      proteinG: 0,
      carbohydratesG: 0,
      fatG: 0,
      saturatedFatG: null,
      sugarsG: null,
      fiberG: null,
      sodiumMg: null,
      saltG: 100,
    },
    ingredients: ["tuz"],
    allergens: [],
    confidence: 0.9,
    warnings: [],
  });
  assert.equal(food.nutrientsPer100g.proteinG, 0);
  assert.equal(food.nutrientsPer100g.carbohydratesG, 0);
  assert.equal(food.nutrientsPer100g.fatG, 0);
  assert.equal(food.nutrientsPer100g.saltG, 100);
  assert.equal(food.nutrientsPer100g.sodiumMg, null);
});

test("oil accepts zero protein and carbohydrate when energy and fat are declared", () => {
  const food = buildUserConfirmedPackageLabelFood("4006381333931", {
    productName: "Test Zeytinyağı",
    brand: "Test",
    quantity: "500 ml",
    productTypeText: "zeytinyağı",
    basis: "PER_100_G",
    servingGrams: null,
    energyKj: null,
    nutrients: {
      energyKcal: 884,
      proteinG: 0,
      carbohydratesG: 0,
      fatG: 100,
      saturatedFatG: 14,
      sugarsG: 0,
      fiberG: 0,
      sodiumMg: 0,
      saltG: 0,
    },
    ingredients: ["zeytinyağı"],
    allergens: [],
    confidence: 0.9,
    warnings: [],
  });
  assert.equal(food.productCatalog?.category?.key, "oils");
  assert.equal(food.nutrientsPer100g.proteinG, 0);
  assert.equal(food.nutrientsPer100g.carbohydratesG, 0);
});

test("sugar and sweetener profile uses energy and carbohydrate without requiring protein or fat", () => {
  const food = buildUserConfirmedPackageLabelFood("4006381333931", {
    productName: "Toz Şeker",
    brand: "Test",
    quantity: "1 kg",
    productTypeText: "şeker",
    basis: "PER_100_G",
    servingGrams: null,
    energyKj: null,
    nutrients: {
      energyKcal: 400,
      proteinG: 0,
      carbohydratesG: 100,
      fatG: 0,
      saturatedFatG: 0,
      sugarsG: 100,
      fiberG: 0,
      sodiumMg: 0,
      saltG: 0,
    },
    ingredients: ["şeker"],
    allergens: [],
    confidence: 0.9,
    warnings: [],
  });
  assert.equal(food.productUsage?.type, "SWEETENER");
  assert.equal(food.nutrientsPer100g.proteinG, 0);
});

test("dry tea reference stays separate from an explicit prepared beverage reference", () => {
  const food = buildUserConfirmedPackageLabelFood("4006381333931", {
    productName: "Siyah Çay",
    brand: "Test",
    quantity: "125 g",
    productTypeText: "siyah çay",
    preparationInstructions: "Demleyiniz.",
    referenceState: "AS_SOLD",
    basis: "PER_100_G",
    servingGrams: null,
    energyKj: null,
    nutrients: {
      energyKcal: 250,
      proteinG: 20,
      carbohydratesG: 30,
      fatG: 5,
      saturatedFatG: null,
      sugarsG: null,
      fiberG: null,
      sodiumMg: null,
      saltG: null,
    },
    preparedReference: {
      basis: "PER_100_G",
      servingGrams: null,
      energyKj: null,
      nutrients: {
        energyKcal: 1,
        proteinG: 0,
        carbohydratesG: 0,
        fatG: 0,
        saturatedFatG: 0,
        sugarsG: 0,
        fiberG: 0,
        sodiumMg: 0,
        saltG: 0,
      },
    },
    ingredients: ["siyah çay"],
    allergens: [],
    confidence: 0.9,
    warnings: [],
  });
  assert.equal(food.productUsage?.type, "BREWING");
  assert.equal(food.provenance.preparationState, "AS_SOLD");
  assert.equal(food.nutrientsPer100g.energyKcal, 250);
  assert.equal(food.additionalNutritionReferences?.[0]?.preparationState, "PREPARED");
  assert.equal(food.additionalNutritionReferences?.[0]?.nutrients.energyKcal, 1);
});

test("spice package quantity remains package metadata and never becomes consumption", () => {
  const food = buildUserConfirmedPackageLabelFood("4006381333931", {
    productName: "Karabiber",
    brand: "Test",
    quantity: "50 g",
    productTypeText: "baharat",
    basis: "PER_100_G",
    servingGrams: null,
    energyKj: null,
    nutrients: {
      energyKcal: 250,
      proteinG: null,
      carbohydratesG: null,
      fatG: null,
      saturatedFatG: null,
      sugarsG: null,
      fiberG: null,
      sodiumMg: null,
      saltG: null,
    },
    ingredients: ["karabiber"],
    allergens: [],
    confidence: 0.9,
    warnings: [],
  });
  assert.equal(food.productUsage?.type, "SPICE");
  assert.equal(food.quantity, "50 g");
  assert.equal(food.serving, null);
  assert.equal("consumedAmount" in food, false);
});

test("preparation base is not treated as direct consumption", () => {
  const food = buildUserConfirmedPackageLabelFood("4006381333931", {
    productName: "Kakao İçecek Tozu",
    brand: "Test",
    quantity: "250 g",
    productTypeText: "toz içecek",
    preparationInstructions: "Sütle karıştırarak hazırlayın.",
    basis: "PER_100_G",
    servingGrams: null,
    energyKj: null,
    nutrients: {
      energyKcal: 380,
      proteinG: null,
      carbohydratesG: 80,
      fatG: null,
      saturatedFatG: null,
      sugarsG: 70,
      fiberG: null,
      sodiumMg: null,
      saltG: null,
    },
    ingredients: ["kakao", "şeker"],
    allergens: [],
    confidence: 0.9,
    warnings: [],
  });
  assert.equal(food.productUsage?.type, "PREPARATION_BASE");
  assert.equal(food.provenance.preparationState, "LABEL_REFERENCE_UNSPECIFIED");
});

test("unknown type keeps conservative energy plus two macro fallback", () => {
  assert.throws(() => buildUserConfirmedPackageLabelFood("4006381333931", {
    productName: "Belirsiz Ürün",
    brand: null,
    quantity: null,
    basis: "PER_100_G",
    servingGrams: null,
    energyKj: null,
    nutrients: {
      energyKcal: 50,
      proteinG: 0,
      carbohydratesG: null,
      fatG: null,
      saturatedFatG: null,
      sugarsG: null,
      fiberG: null,
      sodiumMg: null,
      saltG: null,
    },
    ingredients: [],
    allergens: [],
    confidence: 0.9,
    warnings: [],
  }), /en az iki temel makro/);
});


test("salt and sodium declarations that disagree materially are rejected", () => {
  assert.throws(() => buildUserConfirmedPackageLabelFood("4006381333931", {
    productName: "Saf Tuz",
    brand: "Test",
    quantity: "500 g",
    productTypeText: "tuz",
    basis: "PER_100_G",
    servingGrams: null,
    energyKj: null,
    nutrients: {
      energyKcal: null,
      proteinG: 0,
      carbohydratesG: 0,
      fatG: 0,
      saturatedFatG: null,
      sugarsG: null,
      fiberG: null,
      sodiumMg: 100,
      saltG: 100,
    },
    ingredients: ["tuz"],
    allergens: [],
    confidence: 0.9,
    warnings: [],
  }), /Tuz ve sodyum değerleri/);
});

test("direct-consumption product keeps the conservative normal packaged-food rule", () => {
  assert.throws(() => buildUserConfirmedPackageLabelFood("4006381333931", {
    productName: "Test Yoğurt",
    brand: "Test",
    quantity: "150 g",
    productTypeText: "yoğurt",
    basis: "PER_100_G",
    servingGrams: null,
    energyKj: null,
    nutrients: {
      energyKcal: 70,
      proteinG: 4,
      carbohydratesG: null,
      fatG: null,
      saturatedFatG: null,
      sugarsG: null,
      fiberG: null,
      sodiumMg: null,
      saltG: null,
    },
    ingredients: ["süt"],
    allergens: ["süt"],
    confidence: 0.9,
    warnings: [],
  }), /en az iki temel makro/);
});
