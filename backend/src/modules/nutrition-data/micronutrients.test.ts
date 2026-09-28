import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MICRONUTRIENT_DEFINITIONS,
  MICRONUTRIENT_REFERENCE_SOURCE,
  MICRONUTRIENT_REFERENCE_VERSION,
  adultReferenceMicronutrients,
  normalizeMicronutrientAmount,
  normalizeMicronutrientSnapshot,
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
