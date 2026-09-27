import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPackageLabelConsensus } from "./nutrition-learning";
import type { CanonicalFood } from "./nutrition-data.types";

function labelFood(barcode: string, energy = 500, protein = 10): CanonicalFood {
  return {
    externalId: `user-label:${barcode}`,
    provider: "DIEWISH",
    name: "Test Bar",
    displayNameTr: "Test Bar",
    brand: "Diewish Test",
    barcode,
    imageUrl: null,
    quantity: "50 g",
    serving: null,
    nutrientsPer100g: {
      energyKcal: energy,
      proteinG: protein,
      carbohydratesG: 60,
      fatG: 24,
      saturatedFatG: 8,
      sugarsG: 30,
      fiberG: 5,
      sodiumMg: 100,
      saltG: 0.25,
    },
    ingredients: [],
    allergens: [],
    additives: [],
    labels: ["user-confirmed-package-label"],
    vegan: null,
    vegetarian: null,
    glutenFree: null,
    nutriScore: null,
    novaGroup: null,
    provenance: {
      provider: "DIEWISH",
      externalId: `user-label:${barcode}`,
      retrievedAt: new Date(0).toISOString(),
      dataBasis: "PER_100_G",
      confidence: 0.9,
      sourceReference: "USER_CONFIRMED_PACKAGE_LABEL",
    },
  };
}

test("one or two users cannot promote a package label into shared Diewish knowledge", () => {
  const food = labelFood("4006381333931");
  assert.equal(buildPackageLabelConsensus([
    { userId: "u1", food },
    { userId: "u2", food },
  ]), null);
});

test("three independent matching confirmations promote only nutrition facts, not user identity", () => {
  const food = labelFood("4006381333931");
  const promoted = buildPackageLabelConsensus([
    { userId: "u1", food },
    { userId: "u2", food },
    { userId: "u3", food },
  ]);

  assert.equal(promoted?.externalId, "package-consensus:4006381333931");
  assert.equal(promoted?.provenance.sourceReference, "DIEWISH_PACKAGE_LABEL_CONSENSUS");
  assert.equal(promoted?.provider, "DIEWISH");
  assert.equal(promoted?.nutrientsPer100g.energyKcal, 500);
  assert.match(JSON.stringify(promoted), /diewish-package-label-consensus/);
  assert.doesNotMatch(JSON.stringify(promoted), /u1|u2|u3/);
});

test("conflicting nutrition panels do not reach consensus", () => {
  const barcode = "4006381333931";
  assert.equal(buildPackageLabelConsensus([
    { userId: "u1", food: labelFood(barcode, 500, 10) },
    { userId: "u2", food: labelFood(barcode, 430, 8) },
    { userId: "u3", food: labelFood(barcode, 520, 12) },
  ]), null);
});

test("repeated submissions by the same user count only once", () => {
  const food = labelFood("4006381333931");
  assert.equal(buildPackageLabelConsensus([
    { userId: "u1", food },
    { userId: "u1", food },
    { userId: "u1", food },
  ]), null);
});
