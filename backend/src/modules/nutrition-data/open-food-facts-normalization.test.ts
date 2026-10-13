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

test("Open Food Facts preserves provider category and preparation evidence for product usage", () => {
  const result = normalizeOpenFoodFactsProduct({
    product: {
      code: "8690000000125",
      product_name: "Tomurcuk Black Tea",
      categories_tags: ["en:teas", "en:black-teas"],
      categories: "Teas, Black teas",
      preparation: "Brew with hot water.",
      nutriments: {
        "energy-kcal_100g": 1,
        "proteins_100g": 0,
        "carbohydrates_100g": 0,
        "fat_100g": 0,
      },
    },
  });
  assert.ok(result);
  assert.ok(result.provenance.sourceCategories?.some((value) => /black teas/i.test(value)));
  assert.equal(result.provenance.preparationInstructions, "Brew with hot water.");
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


test("Open Food Facts normalization preserves allergen evidence and trace warnings", () => {
  const food = normalizeOpenFoodFactsProduct({
    code: "8690000000000",
    product_name: "Test bar",
    ingredients_text: "rice, cocoa",
    allergens: "milk",
    allergens_tags: ["en:milk"],
    traces: "May contain peanut",
    traces_tags: ["en:peanuts"],
    nutriments: { "energy-kcal_100g": 100 },
  });
  assert.ok(food);
  assert.equal(food.allergenEvidence?.ingredientList, "DECLARED");
  assert.equal(food.allergenEvidence?.allergenDeclaration, "DECLARED");
  assert.ok(food.allergenEvidence?.crossContaminationWarnings.some((item) => /peanut/i.test(item)));
});

test("Open Food Facts missing allergen/ingredient fields remain explicitly incomplete", () => {
  const food = normalizeOpenFoodFactsProduct({
    code: "8690000000001",
    product_name: "Sparse product",
    nutriments: { "energy-kcal_100g": 100 },
  });
  assert.ok(food);
  assert.equal(food.allergenEvidence?.ingredientList, "MISSING");
  assert.equal(food.allergenEvidence?.allergenDeclaration, "MISSING");
});


test("Open Food Facts keeps a millilitre source serving as volume, not gram weight", () => {
  const result = normalizeOpenFoodFactsProduct({
    product: {
      code: "8690000000200",
      product_name: "Prepared drink",
      quantity: "1 L",
      serving_quantity: 200,
      serving_size: "200 ml",
      nutriments: {
        "energy-kcal_100g": 40,
        "energy-kcal_serving": 80,
      },
    },
  });

  assert.ok(result);
  assert.equal(result.quantity, "1 L");
  assert.equal(result.serving?.amount, 200);
  assert.equal(result.serving?.unit, "ml");
  assert.equal(result.serving?.gramWeight, null);
  assert.equal(result.serving?.description, "200 ml");
});


test("Open Food Facts explicit obsolete flag becomes lifecycle evidence without age guessing", () => {
  const discontinued = normalizeOpenFoodFactsProduct({
    product: {
      code: "8690000000999",
      product_name: "Eski Paket",
      obsolete: "on",
      obsolete_since_date: "2025-05-01",
      nutriments: {
        "energy-kcal_100g": 100,
        "proteins_100g": 1,
        "carbohydrates_100g": 10,
        "fat_100g": 5,
      },
    },
  });
  assert.equal(discontinued?.provenance.lifecycleEvidence?.status, "DISCONTINUED");
  assert.equal(discontinued?.provenance.lifecycleEvidence?.effectiveAt, "2025-05-01T00:00:00.000Z");

  const noEvidence = normalizeOpenFoodFactsProduct({
    product: {
      code: "8690000001002",
      product_name: "Normal Paket",
      obsolete: false,
      last_modified_t: 946684800,
      nutriments: {
        "energy-kcal_100g": 100,
        "proteins_100g": 1,
        "carbohydrates_100g": 10,
        "fat_100g": 5,
      },
    },
  });
  assert.equal(noEvidence?.provenance.lifecycleEvidence, null);
});


test("200 ml Beypazarı-style volume serving converts explicitly labeled mg/L mineral concentrations", () => {
  const drink = normalizeOpenFoodFactsProduct({
    product: {
      code: "8690000000201",
      product_name: "Doğal Maden Suyu",
      quantity: "200 ml",
      serving_quantity: 200,
      serving_size: "200 ml",
      nutriments: {
        "calcium_100g": 400,
        "calcium_unit": "mg/L",
        "magnesium_100g": 100,
        "magnesium_unit": "mg/L",
        "iron_100g": 5,
        "iron_unit": "mg/L",
      },
    },
  });
  assert.ok(drink);
  assert.equal(drink.serving?.unit, "ml");
  assert.equal(drink.serving?.gramWeight, null);
  assert.equal(drink.nutrientsPer100g.micronutrients?.calcium ?? null, null);
  assert.equal(drink.nutrientsPerServing?.micronutrients?.calcium, 80);
  assert.equal(drink.nutrientsPerServing?.micronutrients?.magnesium, 20);
  assert.equal(drink.nutrientsPerServing?.micronutrients?.iron, 1);
  assert.equal(drink.nutrientsPerServing?.micronutrients?.potassium, null);
});

test("mg/L without explicit volume serving is never converted to per-serving values", () => {
  const drink = normalizeOpenFoodFactsProduct({
    product: {
      code: "8690000000202",
      product_name: "Doğal Maden Suyu",
      quantity: "200 ml",
      nutriments: { "calcium_100g": 400, "calcium_unit": "mg/L" },
    },
  });
  assert.ok(drink);
  assert.equal(drink.nutrientsPerServing, null);
  assert.equal(drink.nutrientsPer100g.micronutrients?.calcium ?? null, null);
});


test("volume mg/L sodium uses real volume and never incorrectly multiplies as g per 100g", () => {
  const food = normalizeOpenFoodFactsProduct({
    product: {
      code: "8691381000486",
      product_name: "Beypazarı Doğal Maden Suyu",
      quantity: "200 ml",
      serving_quantity: 200,
      serving_size: "200 ml",
      nutriments: {
        "sodium_100g": 138.18,
        "sodium_unit": "mg/L",
        "calcium_100g": 205.86,
        "calcium_unit": "mg/L",
      },
    },
  });
  assert.ok(food);
  assert.equal(food.nutrientsPer100g.sodiumMg, null);
  assert.equal(food.nutrientsPerServing?.sodiumMg, 27.636);
  assert.equal(food.nutrientsPerServing?.micronutrients?.calcium, 41.172);
  // These fixture concentrations are an example only, not values embedded in product code.
});


test("compact 200ml and 20cl source servings resolve to equal real volume", () => {
  for (const servingSize of ["200ml", "20 cl", "0,2l"]) {
    const drink = normalizeOpenFoodFactsProduct({
      product: {
        code: "8691381000486", product_name: "200 ml Doğal Maden Suyu",
        quantity: "200 ml", serving_quantity: servingSize === "20 cl" ? 20 : 200,
        serving_size: servingSize,
        nutriments: { "calcium_100g": 100, "calcium_unit": "mg/L" },
      },
    });
    assert.equal(drink?.serving?.unit, "ml");
    assert.equal(drink?.serving?.amount, 200);
    assert.equal(drink?.serving?.gramWeight, null);
    assert.equal(drink?.nutrientsPerServing?.micronutrients?.calcium, 20);
  }
});
