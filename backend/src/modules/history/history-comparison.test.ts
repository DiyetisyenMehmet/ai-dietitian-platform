import assert from "node:assert/strict";
import test from "node:test";

import { compareObserved, resolveHistoryComparisonPeriods } from "./history-comparison";

test("current week compares Monday-through-reference-date with equal previous weekdays", () => {
  const periods = resolveHistoryComparisonPeriods(
    "WEEK",
    "2026-09-16",
    "Europe/Istanbul",
    new Date("2026-09-16T12:00:00.000Z"),
  );
  assert.equal(periods.comparisonMode, "EQUAL_ELAPSED_DAYS");
  assert.equal(periods.currentPeriod.localStartDate, "2026-09-14");
  assert.equal(periods.currentPeriod.localEndDateInclusive, "2026-09-16");
  assert.equal(periods.currentPeriod.days, 3);
  assert.equal(periods.previousPeriod.localStartDate, "2026-09-07");
  assert.equal(periods.previousPeriod.localEndDateInclusive, "2026-09-09");
  assert.equal(periods.previousPeriod.days, 3);
});

test("historical completed week compares full Monday-Sunday periods", () => {
  const periods = resolveHistoryComparisonPeriods(
    "WEEK",
    "2026-09-09",
    "Europe/Istanbul",
    new Date("2026-09-16T12:00:00.000Z"),
  );
  assert.equal(periods.comparisonMode, "FULL_PERIODS");
  assert.equal(periods.currentPeriod.localStartDate, "2026-09-07");
  assert.equal(periods.currentPeriod.localEndDateInclusive, "2026-09-13");
  assert.equal(periods.previousPeriod.localStartDate, "2026-08-31");
  assert.equal(periods.previousPeriod.localEndDateInclusive, "2026-09-06");
});

test("current month compares equal elapsed days", () => {
  const periods = resolveHistoryComparisonPeriods(
    "MONTH",
    "2026-09-17",
    "Europe/Istanbul",
    new Date("2026-09-17T12:00:00.000Z"),
  );
  assert.equal(periods.comparisonMode, "EQUAL_ELAPSED_DAYS");
  assert.equal(periods.currentPeriod.localStartDate, "2026-09-01");
  assert.equal(periods.currentPeriod.localEndDateInclusive, "2026-09-17");
  assert.equal(periods.previousPeriod.localStartDate, "2026-08-01");
  assert.equal(periods.previousPeriod.localEndDateInclusive, "2026-08-17");
  assert.equal(periods.currentPeriod.days, 17);
  assert.equal(periods.previousPeriod.days, 17);
});

test("current 31-day month clamps to a shorter previous month", () => {
  const periods = resolveHistoryComparisonPeriods(
    "MONTH",
    "2026-03-31",
    "Europe/Istanbul",
    new Date("2026-03-31T12:00:00.000Z"),
  );
  assert.equal(periods.comparisonMode, "EQUAL_ELAPSED_DAYS_CLAMPED");
  assert.equal(periods.currentPeriod.localEndDateInclusive, "2026-03-28");
  assert.equal(periods.previousPeriod.localEndDateInclusive, "2026-02-28");
  assert.equal(periods.currentPeriod.days, 28);
  assert.equal(periods.previousPeriod.days, 28);
});

test("leap February provides 29 equal comparison days", () => {
  const periods = resolveHistoryComparisonPeriods(
    "MONTH",
    "2024-03-29",
    "America/New_York",
    new Date("2024-03-29T16:00:00.000Z"),
  );
  assert.equal(periods.comparisonMode, "EQUAL_ELAPSED_DAYS");
  assert.equal(periods.currentPeriod.localEndDateInclusive, "2024-03-29");
  assert.equal(periods.previousPeriod.localEndDateInclusive, "2024-02-29");
  assert.equal(periods.currentPeriod.days, 29);
  assert.equal(periods.previousPeriod.days, 29);
});

test("previous zero never produces Infinity or NaN percentage", () => {
  const result = compareObserved(
    { state: "KNOWN_VALUE", value: 10 },
    { state: "KNOWN_ZERO", value: 0 },
    null,
    null,
  );
  assert.equal(result.comparisonAvailable, true);
  assert.equal(result.absoluteChange, 10);
  assert.equal(result.percentageChange, null);
  assert.equal(result.direction, "UP");
});

test("missing values are not coerced to zero comparisons", () => {
  const result = compareObserved(
    { state: "NO_RECORD", value: null },
    { state: "KNOWN_VALUE", value: 10 },
    null,
    null,
  );
  assert.equal(result.comparisonAvailable, false);
  assert.equal(result.absoluteChange, null);
  assert.equal(result.percentageChange, null);
  assert.equal(result.direction, "UNAVAILABLE");
});
