import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "../../utils/api-error";
import { activityRepository } from "../activity/activity.repository";
import { sleepRepository } from "../sleep/sleep.repository";
import { trackingRepository } from "../tracking/tracking.repository";
import {
  compareObserved,
  historyComparisonService,
  resolveCustomHistoryComparisonPeriods,
  resolveHistoryComparisonPeriods,
} from "./history-comparison";

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


function expectApiCode(run: () => unknown, code: string): void {
  assert.throws(run, (error: unknown) => error instanceof ApiError && error.code === code);
}

test("custom comparison supports single-day ranges as equal one-day periods", () => {
  const periods = resolveCustomHistoryComparisonPeriods(
    {
      period1Start: "2026-09-05",
      period1End: "2026-09-05",
      period2Start: "2026-09-19",
      period2End: "2026-09-19",
    },
    "Europe/Istanbul",
    new Date("2026-09-22T12:00:00.000Z"),
  );

  assert.equal(periods.periodType, "CUSTOM");
  assert.equal(periods.comparisonMode, "CUSTOM_EQUAL_RANGES");
  assert.equal(periods.currentPeriod.days, 1);
  assert.equal(periods.previousPeriod.days, 1);
  assert.equal(periods.currentPeriod.localEndDateInclusive, "2026-09-05");
  assert.equal(periods.previousPeriod.localEndDateInclusive, "2026-09-19");
});

test("custom comparison accepts equal seven-day ranges across month and year boundaries", () => {
  const crossMonth = resolveCustomHistoryComparisonPeriods(
    {
      period1Start: "2026-08-29",
      period1End: "2026-09-04",
      period2Start: "2026-09-10",
      period2End: "2026-09-16",
    },
    "Europe/Istanbul",
    new Date("2026-09-22T12:00:00.000Z"),
  );
  assert.equal(crossMonth.currentPeriod.days, 7);
  assert.equal(crossMonth.previousPeriod.days, 7);

  const crossYear = resolveCustomHistoryComparisonPeriods(
    {
      period1Start: "2025-12-29",
      period1End: "2026-01-04",
      period2Start: "2026-01-05",
      period2End: "2026-01-11",
    },
    "UTC",
    new Date("2026-09-22T12:00:00.000Z"),
  );
  assert.equal(crossYear.currentPeriod.days, 7);
  assert.equal(crossYear.previousPeriod.days, 7);
});

test("custom comparison rejects unequal, reversed, too-long and invalid ranges", () => {
  const now = new Date("2026-09-22T12:00:00.000Z");
  expectApiCode(
    () =>
      resolveCustomHistoryComparisonPeriods(
        {
          period1Start: "2026-08-01",
          period1End: "2026-08-07",
          period2Start: "2026-09-01",
          period2End: "2026-09-10",
        },
        "Europe/Istanbul",
        now,
      ),
    "HISTORY_CUSTOM_RANGE_LENGTH_MISMATCH",
  );
  expectApiCode(
    () =>
      resolveCustomHistoryComparisonPeriods(
        {
          period1Start: "2026-08-07",
          period1End: "2026-08-01",
          period2Start: "2026-09-01",
          period2End: "2026-09-07",
        },
        "Europe/Istanbul",
        now,
      ),
    "HISTORY_CUSTOM_RANGE_ORDER",
  );
  expectApiCode(
    () =>
      resolveCustomHistoryComparisonPeriods(
        {
          period1Start: "2026-07-01",
          period1End: "2026-08-01",
          period2Start: "2026-08-02",
          period2End: "2026-09-02",
        },
        "Europe/Istanbul",
        now,
      ),
    "HISTORY_CUSTOM_RANGE_TOO_LONG",
  );
  expectApiCode(
    () =>
      resolveCustomHistoryComparisonPeriods(
        {
          period1Start: "2026-02-30",
          period1End: "2026-03-01",
          period2Start: "2026-03-02",
          period2End: "2026-03-03",
        },
        "Europe/Istanbul",
        now,
      ),
    "INVALID_HISTORY_DATE",
  );
  expectApiCode(
    () =>
      resolveCustomHistoryComparisonPeriods(
        {
          period1Start: "2026-08-01",
          period1End: "2026-08-07",
          period2Start: "2026-09-01",
          period2End: "2026-09-07",
        },
        "Not/A_Zone",
        now,
      ),
    "INVALID_TIMEZONE",
  );
});

test("custom comparison resolves DST boundaries by local calendar day rather than fixed milliseconds", () => {
  const periods = resolveCustomHistoryComparisonPeriods(
    {
      period1Start: "2026-03-29",
      period1End: "2026-03-29",
      period2Start: "2026-03-30",
      period2End: "2026-03-30",
    },
    "Europe/Berlin",
    new Date("2026-09-22T12:00:00.000Z"),
  );

  assert.equal(periods.currentPeriod.days, 1);
  assert.equal(periods.previousPeriod.days, 1);
  assert.equal(periods.currentPeriod.fromUtc, "2026-03-28T23:00:00.000Z");
  assert.equal(periods.currentPeriod.toUtcExclusive, "2026-03-29T22:00:00.000Z");
  assert.equal(periods.previousPeriod.fromUtc, "2026-03-29T22:00:00.000Z");
  assert.equal(periods.previousPeriod.toUtcExclusive, "2026-03-30T22:00:00.000Z");
});

test("custom comparison queries each bounded owner range independently", async (t) => {
  const original = {
    meals: trackingRepository.listMealLogsRange,
    water: trackingRepository.listWaterLogsRange,
    activity: activityRepository.listActivitiesRange,
    sleep: sleepRepository.listRange,
    weights: trackingRepository.listWeightLogsRange,
  };
  t.after(() => {
    trackingRepository.listMealLogsRange = original.meals;
    trackingRepository.listWaterLogsRange = original.water;
    activityRepository.listActivitiesRange = original.activity;
    sleepRepository.listRange = original.sleep;
    trackingRepository.listWeightLogsRange = original.weights;
  });

  const calls: Array<{ source: string; userId: string; from: Date; to: Date }> = [];
  const remember = <T>(source: string, value: T[]) =>
    async (userId: string, from: Date, to: Date): Promise<T[]> => {
      calls.push({ source, userId, from, to });
      return value;
    };

  trackingRepository.listMealLogsRange = remember("meal", []);
  trackingRepository.listWaterLogsRange = remember("water", []);
  activityRepository.listActivitiesRange = remember("activity", []);
  sleepRepository.listRange = remember("sleep", []);
  trackingRepository.listWeightLogsRange = remember("weight", []);

  const comparison = await historyComparisonService.getCustomComparison(
    "owner-a",
    {
      period1Start: "2026-08-01",
      period1End: "2026-08-07",
      period2Start: "2026-09-01",
      period2End: "2026-09-07",
    },
    "UTC",
    new Date("2026-09-22T12:00:00.000Z"),
  );

  assert.equal(calls.length, 10);
  assert.equal(calls.every((call) => call.userId === "owner-a"), true);
  assert.deepEqual(
    [...new Set(calls.map((call) => `${call.from.toISOString()}|${call.to.toISOString()}`))],
    [
      "2026-08-01T00:00:00.000Z|2026-08-08T00:00:00.000Z",
      "2026-09-01T00:00:00.000Z|2026-09-08T00:00:00.000Z",
    ],
  );
  assert.equal(comparison.completeness.current.nutrition.expectedDays, 7);
  assert.equal(comparison.completeness.previous.nutrition.expectedDays, 7);
  assert.equal(comparison.metrics.water.totalMl.current.state, "NO_RECORD");
  assert.equal(comparison.metrics.water.totalMl.previous.state, "NO_RECORD");
  assert.equal(comparison.metrics.weight.netChangeKg.current.state, "NO_RECORD");
  assert.equal(comparison.metrics.weight.netChangeKg.previous.state, "NO_RECORD");
});

test("unavailable observations remain unavailable and never become zero", () => {
  const result = compareObserved(
    { state: "UNAVAILABLE", value: null },
    { state: "KNOWN_ZERO", value: 0 },
    null,
    null,
  );
  assert.equal(result.current.state, "UNAVAILABLE");
  assert.equal(result.previous.state, "KNOWN_ZERO");
  assert.equal(result.comparisonAvailable, false);
  assert.equal(result.absoluteChange, null);
});


test("historical completed month remains full-calendar and crosses year boundary correctly", () => {
  const periods = resolveHistoryComparisonPeriods(
    "MONTH",
    "2026-01-15",
    "Europe/Istanbul",
    new Date("2026-09-22T12:00:00.000Z"),
  );

  assert.equal(periods.comparisonMode, "FULL_CALENDAR_MONTHS");
  assert.equal(periods.currentPeriod.localStartDate, "2026-01-01");
  assert.equal(periods.currentPeriod.localEndDateInclusive, "2026-01-31");
  assert.equal(periods.currentPeriod.days, 31);
  assert.equal(periods.previousPeriod.localStartDate, "2025-12-01");
  assert.equal(periods.previousPeriod.localEndDateInclusive, "2025-12-31");
  assert.equal(periods.previousPeriod.days, 31);
});
