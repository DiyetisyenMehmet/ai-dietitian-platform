import assert from "node:assert/strict";
import { test } from "node:test";

import { parseReferenceFoodLine } from "../../scripts/sync-reference-nutrition";

function row(provider: "CIQUAL" | "COFID" = "CIQUAL") {
  return {
    externalId: "123",
    provider,
    name: "Walnuts",
    displayNameTr: "Walnuts",
    brand: null,
    barcode: null,
    imageUrl: null,
    quantity: null,
    serving: null,
    nutrientsPer100g: {
      energyKcal: 654,
      proteinG: 15.2,
      carbohydratesG: 13.7,
      fatG: 65.2,
      saturatedFatG: 6.1,
      sugarsG: 2.6,
      fiberG: 6.7,
      sodiumMg: 2,
      saltG: null,
    },
    ingredients: [],
    allergens: [],
    additives: [],
    labels: ["reference-food"],
    vegan: null,
    vegetarian: null,
    glutenFree: null,
    nutriScore: null,
    novaGroup: null,
    provenance: {
      provider,
      externalId: "123",
      retrievedAt: "2026-09-27T00:00:00Z",
      dataBasis: "PER_100_G",
      confidence: 0.95,
      sourceReference: "official-source",
    },
  };
}

test("reference importer accepts a complete CIQUAL row", () => {
  const food = parseReferenceFoodLine(JSON.stringify(row()));
  assert.equal(food.provider, "CIQUAL");
  assert.equal(food.nutrientsPer100g.energyKcal, 654);
});

test("reference importer accepts CoFID rows", () => {
  assert.equal(parseReferenceFoodLine(JSON.stringify(row("COFID"))).provider, "COFID");
});

test("reference importer rejects unsupported shared-data providers", () => {
  const source = row();
  const invalid = {
    ...source,
    provider: "DIEWISH",
    provenance: { ...source.provenance, provider: "DIEWISH" },
  };
  assert.throws(() => parseReferenceFoodLine(JSON.stringify(invalid)), /Unsupported/);
});

test("reference importer rejects sparse nutrition rows", () => {
  const invalid = row();
  const sparse = {
    ...invalid,
    nutrientsPer100g: {
      ...invalid.nutrientsPer100g,
      proteinG: null,
      carbohydratesG: null,
    },
  };
  assert.throws(() => parseReferenceFoodLine(JSON.stringify(sparse)), /insufficient/);
});
