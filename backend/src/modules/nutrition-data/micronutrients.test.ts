import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MICRONUTRIENT_DEFINITIONS,
  MICRONUTRIENT_REFERENCE_SOURCE,
  MICRONUTRIENT_REFERENCE_VERSION,
  adultReferenceMicronutrients,
  normalizeMicronutrientAmount,
  normalizeMicronutrientSnapshot,
  resolveMicronutrientReference,
} from "./micronutrients";

test("converts provider units centrally into canonical units", () => {
  assert.equal(normalizeMicronutrientAmount("calcium", 0.12, "g"), 120);
  assert.equal(normalizeMicronutrientAmount("vitaminD", 0.005, "mg"), 5);
  assert.equal(normalizeMicronutrientAmount("selenium", 55, "mcg"), 55);
  assert.equal(normalizeMicronutrientAmount("iron", 8, "IU"), null);
});

test("keeps missing micronutrients unavailable and preserves explicit zero", () => {
  const values = normalizeMicronutrientSnapshot({ vitaminD: 0, calcium: 200 });
  assert.ok(values);
  assert.equal(values.vitaminD, 0);
  assert.equal(values.calcium, 200);
  assert.equal(values.iron, null);
  assert.equal(normalizeMicronutrientSnapshot({ vitaminD: null }), null);
});

test("uses versioned EU adult nutrient reference values without upper-limit semantics", () => {
  const reference = adultReferenceMicronutrients();
  assert.equal(MICRONUTRIENT_REFERENCE_VERSION, "EU_1169_2011_ANNEX_XIII_ADULT_NRV");
  assert.match(MICRONUTRIENT_REFERENCE_SOURCE, /1169\/2011/);
  assert.equal(reference.calcium, 800);
  assert.equal(reference.iron, 14);
  assert.equal(reference.vitaminC, 80);
  assert.equal(reference.vitaminB12, 2.5);
  assert.equal(MICRONUTRIENT_DEFINITIONS.potassium.unit, "mg");
  assert.equal(MICRONUTRIENT_DEFINITIONS.selenium.unit, "µg");
});

test("adult references require a known adult profile age", () => {
  const asOf = new Date("2026-09-28T12:00:00.000Z");
  const adult = resolveMicronutrientReference(
    new Date("1990-05-20T00:00:00.000Z"),
    asOf,
  );
  assert.equal(adult.available, true);
  assert.equal(adult.reason, null);
  assert.equal(adult.values?.calcium, 800);

  const under18 = resolveMicronutrientReference(
    new Date("2010-10-01T00:00:00.000Z"),
    asOf,
  );
  assert.equal(under18.available, false);
  assert.equal(under18.reason, "UNDER_18");
  assert.equal(under18.values, null);

  const missing = resolveMicronutrientReference(null, asOf);
  assert.equal(missing.available, false);
  assert.equal(missing.reason, "PROFILE_REQUIRED");
  assert.equal(missing.values, null);
});
