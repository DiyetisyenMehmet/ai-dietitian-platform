import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeOpenFoodFactsProduct } from "./providers/open-food-facts.provider";

test("Open Food Facts keeps provider-declared per-serving nutrients separate from per-100g values", () => {
  const result = normalizeOpenFoodFactsProduct({
    status: 1,
    product: {
      code: "4006381333931",
      product_name: "Test Product",
      serving_quantity: 30,
      serving_size: "30 g",
      nutriments: {
        "energy-kcal_100g": 400,
        "proteins_100g": 20,
        "carbohydrates_100g": 50,
        "fat_100g": 10,
        "sodium_100g": 0.6,
        "energy-kcal_serving": 120,
        "proteins_serving": 6,
        "carbohydrates_serving": 15,
        "fat_serving": 3,
        "sodium_serving": 0.18,
      },
    },
  });

  assert.ok(result);
  assert.equal(result.serving?.gramWeight, 30);
  assert.equal(result.nutrientsPer100g.energyKcal, 400);
  assert.equal(result.nutrientsPer100g.sodiumMg, 600);
  assert.equal(result.nutrientsPerServing?.energyKcal, 120);
  assert.equal(result.nutrientsPerServing?.proteinG, 6);
  assert.equal(result.nutrientsPerServing?.sodiumMg, 180);
});

test("Open Food Facts leaves per-serving nutrients null when upstream does not provide them", () => {
  const result = normalizeOpenFoodFactsProduct({
    product: {
      code: "4006381333931",
      product_name: "Test Product",
      serving_quantity: 30,
      nutriments: {
        "energy-kcal_100g": 400,
      },
    },
  });

  assert.ok(result);
  assert.equal(result.nutrientsPerServing, null);
});
