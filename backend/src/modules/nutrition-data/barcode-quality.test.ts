import assert from "node:assert/strict";
import test from "node:test";

import { assessBarcodeFoodQuality, selectBestBarcodeFood } from "./barcode-quality";
import type { CanonicalFood } from "./nutrition-data.types";

function food(overrides: Partial<CanonicalFood> = {}): CanonicalFood {
  return {
    externalId: "product-1",
    provider: "OPEN_FOOD_FACTS",
    name: "Complete Product",
    displayNameTr: "Tam Ürün",
    brand: "Test Brand",
    barcode: "4006381333931",
    imageUrl: null,
    quantity: "500 g",
    serving: { amount: 50, unit: "g", gramWeight: 50, description: "50 g" },
    nutrientsPer100g: {
      energyKcal: 250,
      proteinG: 10,
      carbohydratesG: 30,
      fatG: 8,
      saturatedFatG: 2,
      sugarsG: 5,
      fiberG: 4,
      sodiumMg: 200,
      saltG: 0.5,
    },
    ingredients: ["ingredient"],
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
      externalId: "product-1",
      retrievedAt: new Date().toISOString(),
      dataBasis: "PER_100_G",
      sourceReference: "https://example.test/product/4006381333931",
      providerUpdatedAt: new Date().toISOString(),
    },
    ...overrides,
  };
}

test("complete consistent product can reach HIGH data trust", () => {
  const result = assessBarcodeFoodQuality(food(), "4006381333931");
  assert.equal(result.tier, "STRONG");
  assert.equal(result.trustLevel, "HIGH");
});

test("incomplete product never becomes HIGH merely because its source used a high legacy confidence", () => {
  const sparse = food({
    brand: null,
    quantity: null,
    serving: null,
    nutrientsPer100g: {
      energyKcal: 120,
      proteinG: null,
      carbohydratesG: null,
      fatG: null,
      saturatedFatG: null,
      sugarsG: null,
      fiberG: null,
      sodiumMg: null,
      saltG: null,
    },
    provenance: {
      ...food().provenance,
      confidence: 0.99,
    },
  });
  assert.notEqual(assessBarcodeFoodQuality(sparse, sparse.barcode!).trustLevel, "HIGH");
});

test("legacy provenance confidence no longer changes product data quality score", () => {
  const low = food({ provenance: { ...food().provenance, confidence: 0.1 } });
  const high = food({ provenance: { ...food().provenance, confidence: 0.99 } });
  assert.equal(
    assessBarcodeFoodQuality(low, low.barcode!).score,
    assessBarcodeFoodQuality(high, high.barcode!).score,
  );
});

test("barcode mismatch is REJECT and can never be HIGH", () => {
  const result = assessBarcodeFoodQuality(food(), "5901234123457");
  assert.equal(result.tier, "REJECT");
  assert.equal(result.trustLevel, "LOW");
});

test("stale verified data is reduced but not zeroed or treated as lifecycle", () => {
  const stale = food({
    productLifecycle: { status: "DISCONTINUED", replacedBy: null, source: null },
    provenance: { ...food().provenance, stale: true },
  });
  const result = assessBarcodeFoodQuality(stale, stale.barcode!);
  assert.ok(result.score > 0);
  assert.ok(result.issues.includes("STALE_DATA"));
  assert.notEqual(result.tier, "REJECT");
});

test("real zero macros in salt are known values, not missing fields", () => {
  const salt = food({
    name: "Rock Salt",
    displayNameTr: "Kaya Tuzu",
    nutrientsPer100g: {
      energyKcal: 0,
      proteinG: 0,
      carbohydratesG: 0,
      fatG: 0,
      saturatedFatG: 0,
      sugarsG: 0,
      fiberG: 0,
      sodiumMg: 40000,
      saltG: 100,
    },
  });
  const result = assessBarcodeFoodQuality(salt, salt.barcode!);
  assert.equal(result.issues.includes("NO_NUTRITION"), false);
  assert.equal(result.trustLevel, "HIGH");
});

test("lifecycle status does not change the data trust score", () => {
  const active = food({
    productLifecycle: { status: "ACTIVE", replacedBy: null, source: null },
  });
  const discontinued = food({
    productLifecycle: { status: "DISCONTINUED", replacedBy: null, source: null },
  });
  assert.equal(
    assessBarcodeFoodQuality(active, active.barcode!).score,
    assessBarcodeFoodQuality(discontinued, discontinued.barcode!).score,
  );
});

test("independent agreeing sources can increase trust while conflicts reduce it", () => {
  const off = food();
  const usda = food({
    externalId: "usda-1",
    provider: "USDA",
    provenance: {
      provider: "USDA",
      externalId: "usda-1",
      retrievedAt: new Date().toISOString(),
      dataBasis: "PER_100_G",
      sourceReference: "https://example.test/usda/1",
      providerUpdatedAt: new Date().toISOString(),
    },
  });
  const agreed = selectBestBarcodeFood([off, usda], off.barcode!);
  assert.ok(agreed);
  assert.equal(agreed.assessment.trustLevel, "HIGH");

  const conflict = food({
    externalId: "usda-conflict",
    provider: "USDA",
    brand: "Different Brand",
    nutrientsPer100g: {
      ...food().nutrientsPer100g,
      energyKcal: 700,
      proteinG: 1,
      carbohydratesG: 2,
      fatG: 60,
    },
    provenance: {
      provider: "USDA",
      externalId: "usda-conflict",
      retrievedAt: new Date().toISOString(),
      dataBasis: "PER_100_G",
      sourceReference: "https://example.test/usda/conflict",
    },
  });
  const conflicted = selectBestBarcodeFood([off, conflict], off.barcode!);
  assert.ok(conflicted);
  assert.ok(conflicted.assessment.issues.includes("CROSS_SOURCE_DISAGREEMENT"));
  assert.notEqual(conflicted.assessment.trustLevel, "HIGH");
});
