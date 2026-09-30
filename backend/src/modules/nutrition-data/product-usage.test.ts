import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyProductUsage } from "./product-usage";
import type { CanonicalFood } from "./nutrition-data.types";

function product(sourceCategories: string[] = [], preparationInstructions: string | null = null): CanonicalFood {
  return {
    externalId: "usage-1", provider: "OPEN_FOOD_FACTS", name: "Example Product", displayNameTr: "Örnek Ürün",
    brand: "Test", barcode: "4006381333931", imageUrl: null, quantity: "125 g", serving: null,
    nutrientsPer100g: { energyKcal: 100, proteinG: 2, carbohydratesG: 15, fatG: 3, saturatedFatG: null, sugarsG: null, fiberG: null, sodiumMg: null, saltG: null },
    ingredients: [], allergens: [], additives: [], labels: [], vegan: null, vegetarian: null, glutenFree: null, nutriScore: null, novaGroup: null,
    provenance: { provider: "OPEN_FOOD_FACTS", externalId: "usage-1", retrievedAt: "2026-10-01T00:00:00.000Z", dataBasis: "PER_100_G", confidence: 0.8, sourceCategories, preparationInstructions },
  };
}

test("provider categories classify common product usage types", () => {
  const cases: Array<[string, ReturnType<typeof classifyProductUsage>["type"]]> = [
    ["black teas", "BREWING"], ["spices", "SPICE"], ["olive oils", "COOKING_INGREDIENT"],
    ["tomato sauces", "SAUCE"], ["honey", "SWEETENER"], ["powdered drinks", "PREPARATION_BASE"], ["yogurts", "DIRECT_CONSUMPTION"],
  ];
  for (const [category, expected] of cases) assert.equal(classifyProductUsage(product([category]), "STRONG").type, expected);
});

test("explicit aroma directions take precedence over tea category", () => {
  const result = classifyProductUsage(product(["black teas"], "Blend with black tea to add aroma."), "STRONG");
  assert.equal(result.type, "BLENDING_AROMA");
  assert.equal(result.basis, "SOURCE_PREPARATION");
});

test("preparation-base classification does not create consumption", () => {
  const item = product(["drink mixes"], "Mix with water before drinking.");
  assert.equal(classifyProductUsage(item, "STRONG").type, "PREPARATION_BASE");
  assert.equal(item.quantity, "125 g");
  assert.equal(item.serving, null);
  assert.equal("consumedAmount" in item, false);
});

test("name-only hints are insufficient", () => {
  const item = product(); item.name = "Black Tea"; item.displayNameTr = "Siyah Çay";
  assert.equal(classifyProductUsage(item, "STRONG").type, "UNKNOWN");
});

test("weak barcode data cannot produce a strong usage classification", () => {
  const result = classifyProductUsage(product(["spices"]), "WEAK");
  assert.equal(result.type, "UNKNOWN");
  assert.equal(result.basis, "INSUFFICIENT_DATA_QUALITY");
});

test("conflicting categories safely fall back to UNKNOWN", () => {
  const result = classifyProductUsage(product(["spices", "yogurts"]), "STRONG");
  assert.equal(result.type, "UNKNOWN");
  assert.equal(result.basis, "CONFLICTING_EVIDENCE");
});
