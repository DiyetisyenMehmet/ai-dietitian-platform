import assert from "node:assert/strict";
import { test } from "node:test";

import { buildProductCatalog, normalizeCatalogKey, productStorageExternalId } from "./product-catalog";
import type { CanonicalFood } from "./nutrition-data.types";

function food(overrides: Partial<CanonicalFood> = {}): CanonicalFood {
  return {
    externalId: "catalog-1",
    provider: "OPEN_FOOD_FACTS",
    name: "Çaykur Tomurcuk 125 g",
    displayNameTr: "Çaykur Tomurcuk 125 g",
    brand: "Çaykur",
    barcode: "8690101000125",
    imageUrl: null,
    quantity: "125 g",
    serving: null,
    nutrientsPer100g: {
      energyKcal: 1, proteinG: 0, carbohydratesG: 0, fatG: 0,
      saturatedFatG: null, sugarsG: null, fiberG: null, sodiumMg: null, saltG: null,
    },
    ingredients: ["black tea"],
    allergens: [],
    additives: [],
    labels: [],
    vegan: null,
    vegetarian: null,
    glutenFree: null,
    nutriScore: null,
    novaGroup: null,
    productUsage: { type: "BREWING", basis: "SOURCE_CATEGORY", evidence: ["black teas"] },
    provenance: {
      provider: "OPEN_FOOD_FACTS",
      externalId: "catalog-1",
      retrievedAt: "2026-10-01T00:00:00.000Z",
      dataBasis: "PER_100_G",
      confidence: 0.85,
      sourceCategories: ["black teas"],
    },
    ...overrides,
  };
}

test("same family with two package sizes shares family and keeps distinct barcode variants", () => {
  const small = food();
  const large = food({
    externalId: "catalog-2",
    name: "ÇAYKUR   Tomurcuk 200 g",
    displayNameTr: "ÇAYKUR   Tomurcuk 200 g",
    brand: " çaykur ",
    barcode: "8690101000200",
    quantity: "200 g",
    nutrientsPer100g: { ...food().nutrientsPer100g, energyKcal: 3 },
  });
  const a = buildProductCatalog(small, "STRONG");
  const b = buildProductCatalog(large, "STRONG");

  assert.equal(a.family?.key, b.family?.key);
  assert.equal(a.family?.name, "Tomurcuk");
  assert.notEqual(a.variant?.key, b.variant?.key);
  assert.equal(a.variant?.barcode, "8690101000125");
  assert.equal(b.variant?.barcode, "8690101000200");
  assert.equal(small.nutrientsPer100g.energyKcal, 1);
  assert.equal(large.nutrientsPer100g.energyKcal, 3);
});

test("category and usage type remain separate concepts", () => {
  const item = food();
  const catalog = buildProductCatalog(item, "STRONG");
  assert.equal(catalog.category?.name, "İçecek");
  assert.equal(catalog.subcategory?.name, "Çay");
  assert.equal(item.productUsage?.type, "BREWING");
});

test("brand normalization removes case whitespace and Turkish spelling noise from keys", () => {
  assert.equal(normalizeCatalogKey(" ÇAYKUR "), normalizeCatalogKey("çaykur"));
});

test("different product names under one brand do not merge into one family", () => {
  const first = buildProductCatalog(food(), "STRONG");
  const second = buildProductCatalog(food({
    displayNameTr: "Çaykur Rize Turist 125 g",
    name: "Çaykur Rize Turist 125 g",
    barcode: "8690101999999",
  }), "STRONG");
  assert.notEqual(first.family?.key, second.family?.key);
});

test("missing brand leaves family unresolved instead of forcing an unsafe merge", () => {
  const result = buildProductCatalog(food({ brand: null }), "STRONG");
  assert.equal(result.family, null);
  assert.equal(result.variant, null);
  assert.equal(result.barcode, "8690101000125");
});

test("weak barcode data does not create category family or variant relationships", () => {
  const result = buildProductCatalog(food(), "WEAK");
  assert.equal(result.category, null);
  assert.equal(result.family, null);
  assert.equal(result.variant, null);
});


test("storage identity preserves two barcodes when the provider reuses the same external id", () => {
  const oldVariant = food({
    externalId: "stable-source-id",
    barcode: "8690101000125",
    quantity: "125 g",
  });
  oldVariant.productCatalog = buildProductCatalog(oldVariant, "STRONG");

  const newVariant = food({
    externalId: "stable-source-id",
    barcode: "8690101000200",
    quantity: "200 g",
    name: "Çaykur Tomurcuk 200 g",
    displayNameTr: "Çaykur Tomurcuk 200 g",
  });
  newVariant.productCatalog = buildProductCatalog(newVariant, "STRONG");

  assert.notEqual(productStorageExternalId(oldVariant), productStorageExternalId(newVariant));
  assert.equal(oldVariant.externalId, newVariant.externalId);
});
