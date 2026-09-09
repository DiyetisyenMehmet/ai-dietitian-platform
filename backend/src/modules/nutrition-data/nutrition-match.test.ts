import assert from "node:assert/strict";
import { test } from "node:test";

import type { CanonicalFood } from "./nutrition-data.types";
import { rankNutritionMatches, selectBestNutritionMatch } from "./nutrition-match";

function food(name: string, options: { brand?: string | null; confidence?: number } = {}): CanonicalFood {
  return {
    externalId: name,
    provider: "USDA",
    name,
    displayNameTr: name,
    brand: options.brand ?? null,
    barcode: null,
    imageUrl: null,
    quantity: null,
    serving: null,
    nutrientsPer100g: {
      energyKcal: 100,
      proteinG: 1,
      carbohydratesG: 1,
      fatG: 1,
      saturatedFatG: null,
      sugarsG: null,
      fiberG: null,
      sodiumMg: null,
      saltG: null,
    },
    ingredients: [],
    allergens: [],
    additives: [],
    labels: [],
    vegan: null,
    vegetarian: null,
    glutenFree: null,
    nutriScore: null,
    novaGroup: null,
    provenance: {
      provider: "USDA",
      externalId: name,
      retrievedAt: new Date(0).toISOString(),
      dataBasis: "PER_100_G",
      confidence: options.confidence ?? 0.95,
    },
  };
}

test("rejects unrelated USDA result instead of assigning wrong nutrients", () => {
  const match = selectBestNutritionMatch("domates sosu ve salça", [food("VE WONG / FRIED GLUTEN")]);
  assert.equal(match, null);
});

test("matches common Turkish ingredients through deterministic English aliases", () => {
  const cases: Array<[string, string]> = [
    ["yeşil kabak", "Squash, summer, zucchini, includes skin, cooked, boiled, drained, without salt"],
    ["soğan", "Onions, cooked, boiled, drained, without salt"],
    ["arpa şehriye", "Pasta, cooked, unenriched, without added salt"],
    ["zeytinyağı", "Oil, olive, salad or cooking"],
    ["tuz", "Salt, table"],
    ["baharatlar", "Spices, mixed"],
    ["karpuz", "Watermelon, raw"],
  ];

  for (const [query, candidate] of cases) {
    const match = selectBestNutritionMatch(query, [food(candidate)]);
    assert.ok(match, `${query} should match ${candidate}`);
    assert.ok(match.relevance >= 0.55);
  }
});

test("ranks semantically relevant tomato food ahead of unrelated search noise", () => {
  const ranked = rankNutritionMatches("domates sosu ve salça", [
    food("VE WONG / FRIED GLUTEN"),
    food("Tomato sauce, canned, no salt added"),
    food("Tomato paste, canned, without salt added"),
  ]);
  assert.ok(ranked.length >= 1);
  assert.match(ranked[0]!.food.name, /tomato/i);
  assert.equal(ranked.some((item) => /fried gluten/i.test(item.food.name)), false);
});

test("prefers an equally relevant generic record over a branded record", () => {
  const generic = food("Onions, raw");
  const branded = food("Onions, raw", { brand: "Example Brand" });
  const ranked = rankNutritionMatches("soğan", [branded, generic]);
  assert.equal(ranked[0]?.food.brand, null);
});
