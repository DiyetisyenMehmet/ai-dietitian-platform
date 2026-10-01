import assert from "node:assert/strict";
import { test } from "node:test";

import { buildProductCatalog } from "./product-catalog";
import { resolveStoredScanProductIdentity } from "./scan-history-identity";
import type { CanonicalFood } from "./nutrition-data.types";

function storedProduct(overrides: Partial<CanonicalFood> = {}): CanonicalFood {
  const food: CanonicalFood = {
    externalId: "off-1",
    provider: "OPEN_FOOD_FACTS",
    name: "Kristal Kaya Tuzu",
    displayNameTr: "Kristal Kaya Tuzu",
    brand: "Kristal",
    barcode: "4006381333931",
    imageUrl: null,
    quantity: "500 g",
    serving: null,
    nutrientsPer100g: {
      energyKcal: 0,
      proteinG: 0,
      carbohydratesG: 0,
      fatG: 0,
      saturatedFatG: 0,
      sugarsG: 0,
      fiberG: 0,
      sodiumMg: 39300,
      saltG: 98.25,
    },
    ingredients: ["kaya tuzu"],
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
      externalId: "off-1",
      retrievedAt: "2026-10-01T00:00:00.000Z",
      dataBasis: "PER_100_G",
      confidence: 0.9,
      sourceReference: "https://example.test/product/4006381333931",
      sourceCategories: ["salt"],
    },
    ...overrides,
  };
  food.productCatalog = buildProductCatalog(food, "STRONG");
  return food;
}

test("exact trusted barcode variant resolves current product identity", () => {
  const food = storedProduct({
    productLifecycle: {
      status: "OLD_VERSION",
      replacedBy: { barcode: "8690101000200", variantKey: "replacement" },
      source: null,
    },
  });
  const resolved = resolveStoredScanProductIdentity("4006381333931", food);
  assert.equal(resolved?.displayNameTr, "Kristal Kaya Tuzu");
  assert.equal(resolved?.brand, "Kristal");
  assert.equal(resolved?.lifecycleStatus, "OLD_VERSION");
  assert.equal(resolved?.replacedByBarcode, "8690101000200");
});

test("barcode mismatch never links a historical scan to another product", () => {
  assert.equal(resolveStoredScanProductIdentity("8690101000125", storedProduct()), null);
});

test("missing catalog variant never resolves by name or brand alone", () => {
  const food = storedProduct();
  food.productCatalog = undefined;
  assert.equal(resolveStoredScanProductIdentity("4006381333931", food), null);
});

test("weak stored product is not exposed as a resolved history identity", () => {
  const weak = storedProduct({
    displayNameTr: "Unknown product",
    name: "Unknown product",
    brand: null,
    quantity: null,
    nutrientsPer100g: {
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
  });
  weak.productCatalog = {
    category: null,
    subcategory: null,
    brand: null,
    family: { key: "unsafe-family", name: "Unsafe" },
    variant: {
      key: "unsafe-family::gtin:4006381333931",
      name: "Unsafe",
      barcode: "4006381333931",
      packageQuantity: null,
    },
    barcode: "4006381333931",
    derivation: {
      categoryBasis: "UNRESOLVED",
      familyBasis: "BRAND_PRODUCT_NAME",
      variantBasis: "BARCODE",
      evidence: [],
    },
  };
  assert.equal(resolveStoredScanProductIdentity("4006381333931", weak), null);
});
