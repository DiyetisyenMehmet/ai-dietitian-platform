import assert from "node:assert/strict";
import test from "node:test";

import { bloodTestAnalysisRepository } from "../blood-test-analysis.repository";
import type { BloodTestAnalysisComparisonRow } from "../blood-test-analysis.repository";
import type {
  BloodTestValueStatus,
  NormalizedBloodTestValue,
} from "../types";
import {
  buildComparison,
  longitudinalComparisonService,
  selectPreviousAnalysis,
} from "./longitudinal-comparison.service";

function value(
  code: string,
  numericValue: number | null,
  options: {
    unit?: string;
    name?: string;
    source?: string | null;
    status?: BloodTestValueStatus;
  } = {},
): NormalizedBloodTestValue {
  const unit = options.unit ?? "mg/dL";
  return {
    biomarkerCode: code,
    biomarkerName: options.name ?? code,
    rawValue: numericValue === null ? "" : String(numericValue),
    numericValue,
    unit,
    extractedUnit: unit,
    conversionFactor: 1,
    referenceRange:
      options.source === null
        ? null
        : {
            unit,
            minValue: 1,
            maxValue: 10,
            optimalMin: null,
            optimalMax: null,
            source: options.source ?? "LAB_REPORT",
          },
    status: options.status ?? "NORMAL",
  };
}

function row(
  id: string,
  createdAt: string,
  testDate: string | null,
  values: NormalizedBloodTestValue[] = [],
): BloodTestAnalysisComparisonRow {
  return {
    id,
    createdAt: new Date(createdAt),
    normalizedValues: values,
    bloodTest: { testDate: testDate ? new Date(`${testDate}T00:00:00.000Z`) : null },
  } as unknown as BloodTestAnalysisComparisonRow;
}

const previousMeta = {
  id: "previous",
  measuredAt: new Date("2026-08-01T00:00:00.000Z"),
};
const currentMeta = {
  measuredAt: new Date("2026-09-01T00:00:00.000Z"),
};

test("1. no previous analysis selects null baseline", () => {
  assert.equal(
    selectPreviousAnalysis(
      [],
      "current",
      currentMeta.measuredAt,
      new Date("2026-09-02T00:00:00.000Z"),
    ),
    null,
  );
});

test("2. no common biomarker returns null comparison", () => {
  assert.equal(
    buildComparison([value("GLUCOSE", 90)], [value("HDL", 50)], previousMeta, currentMeta),
    null,
  );
});

test("3. one common biomarker produces the expected comparison", () => {
  const result = buildComparison(
    [value("GLUCOSE", 100)],
    [value("GLUCOSE", 80)],
    previousMeta,
    currentMeta,
  );
  assert.equal(result?.comparedCount, 1);
  assert.deepEqual(result?.comparisons[0], {
    biomarkerCode: "GLUCOSE",
    biomarkerName: "GLUCOSE",
    unit: "mg/dL",
    previousValue: 80,
    currentValue: 100,
    absoluteDifference: 20,
    percentageDifference: 25,
    direction: "increased",
    previousReferenceStatus: "NORMAL",
    currentReferenceStatus: "NORMAL",
  });
});

test("4. multiple matches preserve first-seen current order and correct count", () => {
  const result = buildComparison(
    [value("HDL", 60), value("GLUCOSE", 90)],
    [value("GLUCOSE", 80), value("HDL", 50)],
    previousMeta,
    currentMeta,
  );
  assert.equal(result?.comparedCount, 2);
  assert.deepEqual(result?.comparisons.map((item) => item.biomarkerCode), ["HDL", "GLUCOSE"]);
});

test("5. current greater than previous is increased", () => {
  assert.equal(
    buildComparison([value("A", 2)], [value("A", 1)], previousMeta, currentMeta)
      ?.comparisons[0].direction,
    "increased",
  );
});

test("6. current less than previous is decreased", () => {
  assert.equal(
    buildComparison([value("A", 1)], [value("A", 2)], previousMeta, currentMeta)
      ?.comparisons[0].direction,
    "decreased",
  );
});

test("7. equal numeric values are unchanged", () => {
  assert.equal(
    buildComparison([value("A", 2)], [value("A", 2)], previousMeta, currentMeta)
      ?.comparisons[0].direction,
    "unchanged",
  );
});

test("8. real previous zero is compared and percentage difference is null", () => {
  const comparison = buildComparison(
    [value("A", 4)],
    [value("A", 0)],
    previousMeta,
    currentMeta,
  )?.comparisons[0];
  assert.equal(comparison?.previousValue, 0);
  assert.equal(comparison?.percentageDifference, null);
});

test("9. missing numeric values are excluded rather than treated as zero", () => {
  assert.equal(
    buildComparison([value("A", null)], [value("A", 0)], previousMeta, currentMeta),
    null,
  );
  assert.equal(
    buildComparison([value("A", 0)], [value("A", null)], previousMeta, currentMeta),
    null,
  );
});

test("10. unmatched canonical biomarker codes are excluded without fuzzy matching", () => {
  assert.equal(
    buildComparison([value("GLUCOSE", 90)], [value("GLUCOSE_FASTING", 85)], previousMeta, currentMeta),
    null,
  );
});

test("11. canonical unit mismatch fails closed without conversion", () => {
  assert.equal(
    buildComparison(
      [value("GLUCOSE", 90, { unit: "mg/dL" })],
      [value("GLUCOSE", 5, { unit: "mmol/L" })],
      previousMeta,
      currentMeta,
    ),
    null,
  );
});

test("12. LAB_REPORT reference statuses are exposed exactly", () => {
  const comparison = buildComparison(
    [value("A", 5, { source: "LAB_REPORT", status: "NORMAL" })],
    [value("A", 12, { source: "LAB_REPORT", status: "HIGH" })],
    previousMeta,
    currentMeta,
  )?.comparisons[0];
  assert.equal(comparison?.previousReferenceStatus, "HIGH");
  assert.equal(comparison?.currentReferenceStatus, "NORMAL");
});

test("13. generic reference status is UNKNOWN even when normalized status is high", () => {
  const comparison = buildComparison(
    [value("A", 12, { source: "DIEWISH_REFERENCE", status: "HIGH" })],
    [value("A", 8, { source: "STANDARD", status: "NORMAL" })],
    previousMeta,
    currentMeta,
  )?.comparisons[0];
  assert.equal(comparison?.previousReferenceStatus, "UNKNOWN");
  assert.equal(comparison?.currentReferenceStatus, "UNKNOWN");
});

test("14. missing reference status is UNKNOWN", () => {
  const comparison = buildComparison(
    [value("A", 2, { source: null, status: "LOW" })],
    [value("A", 1, { source: null, status: "HIGH" })],
    previousMeta,
    currentMeta,
  )?.comparisons[0];
  assert.equal(comparison?.previousReferenceStatus, "UNKNOWN");
  assert.equal(comparison?.currentReferenceStatus, "UNKNOWN");
});

test("15. measuredAt fields come from laboratory test dates", () => {
  const result = buildComparison(
    [value("A", 2)],
    [value("A", 1)],
    previousMeta,
    currentMeta,
  );
  assert.equal(result?.previousMeasuredAt, "2026-08-01");
  assert.equal(result?.currentMeasuredAt, "2026-09-01");
});

test("16. missing test dates remain null and analysis timestamps are never exposed as measuredAt", () => {
  const result = buildComparison(
    [value("A", 2)],
    [value("A", 1)],
    { id: "previous", measuredAt: null },
    { measuredAt: null },
  );
  assert.equal(result?.previousMeasuredAt, null);
  assert.equal(result?.currentMeasuredAt, null);
});

test("17-18. baseline selection excludes future tests and remains deterministic on same-day records", () => {
  const currentCreatedAt = new Date("2026-09-10T12:00:00.000Z");
  const analyses = [
    row("future", "2026-09-01T00:00:00.000Z", "2026-10-01"),
    row("older-day", "2026-09-09T00:00:00.000Z", "2026-09-08"),
    row("same-day-newer-analysis", "2026-09-11T00:00:00.000Z", "2026-09-10"),
    row("same-day-older-analysis", "2026-09-10T10:00:00.000Z", "2026-09-10"),
  ];
  assert.equal(
    selectPreviousAnalysis(
      analyses,
      "current",
      new Date("2026-09-10T00:00:00.000Z"),
      currentCreatedAt,
    )?.id,
    "same-day-older-analysis",
  );
});

test("19. duplicate biomarker codes use the first persisted occurrence deterministically", () => {
  const result = buildComparison(
    [value("A", 10), value("A", 99)],
    [value("A", 5), value("A", 1)],
    previousMeta,
    currentMeta,
  );
  assert.equal(result?.comparisons[0].currentValue, 10);
  assert.equal(result?.comparisons[0].previousValue, 5);
  assert.equal(result?.comparedCount, 1);
});

test("20. advisory comparison repository failure returns null instead of failing analysis callers", async () => {
  const original = bloodTestAnalysisRepository.listCompletedForComparisonByUser;
  bloodTestAnalysisRepository.listCompletedForComparisonByUser = async () => {
    throw new Error("comparison-only failure");
  };
  try {
    const result = await longitudinalComparisonService.buildForUser(
      "user-1",
      "current",
      [value("A", 1)],
      currentMeta.measuredAt,
      new Date("2026-09-02T00:00:00.000Z"),
    );
    assert.equal(result, null);
  } finally {
    bloodTestAnalysisRepository.listCompletedForComparisonByUser = original;
  }
});
