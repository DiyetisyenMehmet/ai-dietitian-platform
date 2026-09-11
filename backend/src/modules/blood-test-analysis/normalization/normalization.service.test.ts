import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizationService,
  type ReferenceRangeMap,
} from "./normalization.service";

function fallbackRanges(): ReferenceRangeMap {
  return new Map([
    [
      "RBC",
      {
        unit: "10^12/L",
        minValue: 4.2,
        maxValue: 5.8,
        optimalMin: null,
        optimalMax: null,
        source: "DIEWISH_REFERENCE",
      },
    ],
  ]) as unknown as ReferenceRangeMap;
}

test("laboratory report range is authoritative for normal classification", () => {
  const [value] = normalizationService.normalize(
    [
      {
        name: "RBC",
        rawValue: "4.94",
        unit: "10^12/L",
        referenceRange: "4.2 - 5.8",
      },
    ],
    new Map(),
  );

  assert.equal(value.status, "NORMAL");
  assert.equal(value.referenceRange?.source, "LAB_REPORT");
  assert.equal(value.rawValue, "4.94");
  assert.equal(value.extractedUnit, "10^12/L");
});

test("database fallback remains informational and cannot classify a missing report range", () => {
  const [value] = normalizationService.normalize(
    [{ name: "RBC", rawValue: "4.94", unit: "10^12/L" }],
    fallbackRanges(),
  );

  assert.equal(value.status, "UNKNOWN");
  assert.equal(value.referenceRange?.source, "DIEWISH_REFERENCE");
  assert.equal(value.referenceRange?.minValue, 4.2);
  assert.equal(value.referenceRange?.maxValue, 5.8);
});

test("out-of-range report values are high or low without invented critical thresholds", () => {
  const [high] = normalizationService.normalize(
    [
      {
        name: "RBC",
        rawValue: "20",
        unit: "10^12/L",
        referenceRange: "4.2 - 5.8",
      },
    ],
    new Map(),
  );
  const [low] = normalizationService.normalize(
    [
      {
        name: "RBC",
        rawValue: "1",
        unit: "10^12/L",
        referenceRange: "4.2 - 5.8",
      },
    ],
    new Map(),
  );

  assert.equal(high.status, "HIGH");
  assert.equal(low.status, "LOW");
  assert.notEqual(high.status, "CRITICALLY_HIGH");
  assert.notEqual(low.status, "CRITICALLY_LOW");
});