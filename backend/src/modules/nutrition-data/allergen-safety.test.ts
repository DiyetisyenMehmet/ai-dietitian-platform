import assert from "node:assert/strict";
import test from "node:test";

import type { CanonicalFood } from "./nutrition-data.types";
import {
  assessFoodAllergenSafety,
  assessPhotoIngredientAllergenSafety,
  assessPlannedFoodAllergenSafety,
} from "./allergen-safety";

function food(overrides: Partial<CanonicalFood> = {}): CanonicalFood {
  return {
    externalId: "test",
    provider: "OPEN_FOOD_FACTS",
    name: "Test product",
    displayNameTr: "Test ürün",
    brand: null,
    barcode: "12345678",
    imageUrl: null,
    quantity: null,
    serving: null,
    nutrientsPer100g: {
      energyKcal: 100, proteinG: 3, carbohydratesG: 10, fatG: 4,
      saturatedFatG: 1, sugarsG: 2, fiberG: 1, sodiumMg: 50, saltG: 0.1,
    },
    ingredients: ["rice", "olive oil"],
    allergens: [],
    allergenEvidence: {
      ingredientList: "DECLARED",
      allergenDeclaration: "DECLARED",
      crossContaminationWarnings: [],
    },
    additives: [],
    labels: [],
    vegan: null,
    vegetarian: null,
    glutenFree: null,
    nutriScore: null,
    novaGroup: null,
    provenance: {
      provider: "OPEN_FOOD_FACTS",
      externalId: "test",
      retrievedAt: new Date().toISOString(),
      dataBasis: "PER_100_G",
      confidence: 0.9,
      stale: false,
    },
    ...overrides,
  };
}

test("explicit registered allergen match is KNOWN_RISK", () => {
  const result = assessFoodAllergenSafety(food({ allergens: ["milk"] }), ["milk"]);
  assert.equal(result.status, "KNOWN_RISK");
  assert.deepEqual(result.matchedAllergens, ["milk"]);
});

test("complete reliable data with no registered-allergen match is KNOWN_SAFE", () => {
  const completeFood = food();
  const result = assessFoodAllergenSafety(
    food({
      provenance: {
        ...completeFood.provenance,
        sourceReference: "https://world.openfoodfacts.org/product/test",
      },
    }),
    ["peanut"],
  );
  assert.equal(result.status, "KNOWN_SAFE");
  assert.equal(result.dataComplete, true);
});

test("missing ingredient or allergen evidence is UNKNOWN, not safe", () => {
  const result = assessFoodAllergenSafety(
    food({
      ingredients: [],
      allergens: [],
      allergenEvidence: {
        ingredientList: "MISSING",
        allergenDeclaration: "MISSING",
        crossContaminationWarnings: [],
      },
    }),
    ["peanut"],
  );
  assert.equal(result.status, "UNKNOWN");
  assert.match(result.message ?? "", /Alerjen bilgisi yeterli değil/);
});

test("source-declared may-contain warning can make a product KNOWN_RISK", () => {
  const result = assessFoodAllergenSafety(
    food({
      allergenEvidence: {
        ingredientList: "DECLARED",
        allergenDeclaration: "DECLARED",
        crossContaminationWarnings: ["May contain peanut"],
      },
    }),
    ["peanut"],
  );
  assert.equal(result.status, "KNOWN_RISK");
  assert.deepEqual(result.crossContaminationMatches, ["peanut"]);
});

test("generated plan food is UNKNOWN when allergy user has no ingredient list", () => {
  assert.equal(
    assessPlannedFoodAllergenSafety({ name: "Granola bar" }, ["peanut"]).status,
    "UNKNOWN",
  );
  assert.equal(
    assessPlannedFoodAllergenSafety(
      { name: "Rice bowl", ingredients: ["rice", "olive oil"] },
      ["peanut"],
    ).status,
    "KNOWN_SAFE",
  );
  assert.equal(
    assessPlannedFoodAllergenSafety(
      { name: "Rice bowl", ingredients: ["rice", "peanut sauce"] },
      ["peanut"],
    ).status,
    "KNOWN_RISK",
  );
});

test("photo scan without an explicit match remains UNKNOWN", () => {
  assert.equal(
    assessPhotoIngredientAllergenSafety([{ name: "rice", included: true }], ["peanut"]).status,
    "UNKNOWN",
  );
  assert.equal(
    assessPhotoIngredientAllergenSafety([{ name: "peanut sauce", included: true }], ["peanut"]).status,
    "KNOWN_RISK",
  );
});
