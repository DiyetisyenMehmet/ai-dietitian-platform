import assert from "node:assert/strict";
import { test } from "node:test";

import { NutritionTtlCache } from "./nutrition-cache";
import { normalizeOpenFoodFactsProduct } from "./providers/open-food-facts.provider";
import { normalizeUsdaFood } from "./providers/usda.provider";
import { selectPreferredFood } from "./source-policy";

test("normalizes USDA nutrients without changing provider numbers", () => {
  const food = normalizeUsdaFood({
    fdcId: 123,
    description: "Chicken breast, cooked, roasted",
    foodNutrients: [
      { nutrientId: 1008, value: 165 },
      { nutrientId: 1003, value: 31 },
      { nutrientId: 1093, value: 74 },
    ],
  });
  assert.ok(food);
  assert.equal(food.nutrientsPer100g.energyKcal, 165);
  assert.equal(food.nutrientsPer100g.proteinG, 31);
  assert.equal(food.nutrientsPer100g.sodiumMg, 74);
  assert.match(food.displayNameTr, /tavuk/i);
  assert.equal(food.provenance.provider, "USDA");
});

test("normalizes Open Food Facts package metadata and sodium units", () => {
  const food = normalizeOpenFoodFactsProduct({
    status: 1,
    code: "4006381333931",
    product: {
      code: "4006381333931",
      product_name_tr: "Test Ürün",
      brands: "Diewish Test",
      allergens_tags: ["en:milk"],
      labels_tags: ["en:vegetarian"],
      additives_tags: ["en:e330"],
      nutriscore_grade: "b",
      nova_group: 3,
      nutriments: {
        "energy-kcal_100g": 220,
        proteins_100g: 8,
        carbohydrates_100g: 30,
        fat_100g: 7,
        sodium_100g: 0.4,
      },
    },
  });
  assert.ok(food);
  assert.equal(food.nutrientsPer100g.energyKcal, 220);
  assert.equal(food.nutrientsPer100g.sodiumMg, 400);
  assert.deepEqual(food.allergens, ["milk"]);
  assert.equal(food.vegetarian, true);
  assert.equal(food.provenance.provider, "OPEN_FOOD_FACTS");
});

test("source precedence never averages conflicting foods", () => {
  const usda = normalizeUsdaFood({ fdcId: 1, description: "Rice", foodNutrients: [{ nutrientId: 1008, value: 130 }] });
  const off = normalizeOpenFoodFactsProduct({ code: "4006381333931", product_name: "Rice Pack", nutriments: { "energy-kcal_100g": 150 } }, "4006381333931");
  assert.ok(usda && off);
  assert.equal(selectPreferredFood([off, usda], "GENERAL")?.provider, "USDA");
  assert.equal(selectPreferredFood([usda, off], "BARCODE")?.provider, "OPEN_FOOD_FACTS");
});

test("TTL cache expires and remains bounded", () => {
  const cache = new NutritionTtlCache<number>(2);
  cache.set("a", 1, 100, 0);
  assert.equal(cache.get("a", 50), 1);
  assert.equal(cache.get("a", 101), null);
  cache.set("a", 1, 100, 0);
  cache.set("b", 2, 100, 0);
  cache.set("c", 3, 100, 0);
  assert.equal(cache.size, 2);
  assert.equal(cache.get("a", 1), null);
});
