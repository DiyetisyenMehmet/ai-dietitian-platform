import assert from "node:assert/strict";
import { test } from "node:test";

import { buildProductCatalog } from "./product-catalog";
import { buildProductLifecycle, withExplicitProductLifecycleEvidence } from "./product-lifecycle";
import type { CanonicalFood, ProductLifecycleStatus } from "./nutrition-data.types";

function variant(barcode: string, quantity: string, energyKcal: number): CanonicalFood {
  const food: CanonicalFood = {
    externalId: "provider-stable-id",
    provider: "OPEN_FOOD_FACTS",
    name: `Çaykur Tomurcuk ${quantity}`,
    displayNameTr: `Çaykur Tomurcuk ${quantity}`,
    brand: "Çaykur",
    barcode,
    imageUrl: null,
    quantity,
    serving: null,
    nutrientsPer100g: {
      energyKcal, proteinG: 0, carbohydratesG: 0, fatG: 0,
      saturatedFatG: null, sugarsG: null, fiberG: null, sodiumMg: null, saltG: null,
    },
    ingredients: ["black tea"],
    allergens: [], additives: [], labels: [],
    vegan: null, vegetarian: null, glutenFree: null, nutriScore: null, novaGroup: null,
    productUsage: { type: "BREWING", basis: "SOURCE_CATEGORY", evidence: ["black teas"] },
    provenance: {
      provider: "OPEN_FOOD_FACTS",
      externalId: "provider-stable-id",
      retrievedAt: "2026-10-01T00:00:00.000Z",
      dataBasis: "PER_100_G",
      confidence: 0.9,
      sourceCategories: ["black teas"],
    },
  };
  food.productCatalog = buildProductCatalog(food, "STRONG");
  return food;
}

function withStatus(
  food: CanonicalFood,
  status: Exclude<ProductLifecycleStatus, "UNKNOWN">,
  extra: { replacedByBarcode?: string; effectiveAt?: string } = {},
): CanonicalFood {
  return withExplicitProductLifecycleEvidence(food, {
    status,
    sourceReference: "https://example.test/manufacturer/product",
    ...extra,
  });
}

test("no lifecycle evidence stays UNKNOWN", () => {
  assert.equal(buildProductLifecycle(variant("8690101000125", "125 g", 1)).status, "UNKNOWN");
});

test("stale cache state never becomes DISCONTINUED", () => {
  const food = variant("8690101000125", "125 g", 1);
  food.provenance.stale = true;
  assert.equal(buildProductLifecycle(food).status, "UNKNOWN");
});

test("same family retains old and active variants with independent nutrition", () => {
  const oldVariant = withStatus(variant("8690101000125", "125 g", 1), "OLD_VERSION");
  const activeVariant = withStatus(variant("8690101000200", "200 g", 3), "ACTIVE");
  assert.equal(oldVariant.productCatalog?.family?.key, activeVariant.productCatalog?.family?.key);
  assert.notEqual(oldVariant.productCatalog?.variant?.key, activeVariant.productCatalog?.variant?.key);
  assert.equal(oldVariant.productLifecycle?.status, "OLD_VERSION");
  assert.equal(activeVariant.productLifecycle?.status, "ACTIVE");
  assert.equal(oldVariant.nutrientsPer100g.energyKcal, 1);
  assert.equal(activeVariant.nutrientsPer100g.energyKcal, 3);
});

test("DISCONTINUED preserves old variant facts", () => {
  const oldVariant = withStatus(
    variant("8690101000125", "125 g", 1),
    "DISCONTINUED",
    { effectiveAt: "2026-01-15T00:00:00.000Z" },
  );
  assert.equal(oldVariant.productLifecycle?.status, "DISCONTINUED");
  assert.equal(oldVariant.barcode, "8690101000125");
  assert.equal(oldVariant.nutrientsPer100g.energyKcal, 1);
});

test("REPLACED links to a newer variant in the same family", () => {
  const oldVariant = withStatus(
    variant("8690101000125", "125 g", 1),
    "REPLACED",
    { replacedByBarcode: "8690101000200" },
  );
  assert.equal(oldVariant.productLifecycle?.status, "REPLACED");
  assert.equal(oldVariant.productLifecycle?.replacedBy?.barcode, "8690101000200");
  assert.equal(
    oldVariant.productLifecycle?.replacedBy?.variantKey,
    `${oldVariant.productCatalog?.family?.key}::gtin:8690101000200`,
  );
});

test("REPLACED without a trusted replacement barcode falls back to UNKNOWN", () => {
  const food = variant("8690101000125", "125 g", 1);
  food.provenance.lifecycleEvidence = {
    status: "REPLACED",
    sourceReference: "https://example.test/manufacturer/product",
  };
  assert.equal(buildProductLifecycle(food).status, "UNKNOWN");
});

test("package-size differences alone do not infer lifecycle", () => {
  assert.equal(buildProductLifecycle(variant("8690101000125", "125 g", 1)).status, "UNKNOWN");
  assert.equal(buildProductLifecycle(variant("8690101000200", "200 g", 3)).status, "UNKNOWN");
});
