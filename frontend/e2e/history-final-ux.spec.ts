import { expect, test } from "@playwright/test";

import {
  DAILY_HISTORY_METRIC_ROUTES,
  dailyHistoryMetricRoute,
  type DailyHistoryMetric,
} from "../src/application/history/history-navigation";
import {
  hasDailyHistoryShareData,
  hasPeriodHistoryShareData,
} from "../src/application/history/history-share";
import type { DailyHistoryResponse, HistoryComparisonResponse } from "../src/domain/history/types";

function dailyWithEveryMetric(): DailyHistoryResponse {
  return {
    nutrition: {
      totals: {
        calories: { state: "KNOWN_VALUE", value: 1840 },
        proteinG: { state: "KNOWN_VALUE", value: 112 },
      },
    },
    water: { totalMl: { state: "KNOWN_VALUE", value: 2100 } },
    activity: { totalActiveMinutes: { state: "KNOWN_VALUE", value: 42 } },
    sleep: { totalDurationMinutes: { state: "KNOWN_VALUE", value: 448 } },
    weight: { measurement: { id: "weight-1", weightKg: 82, loggedAt: "2026-09-21T08:00:00Z" } },
    timeline: [
      {
        id: "water-1",
        type: "WATER",
        timestamp: "2026-09-21T08:00:00Z",
        sourceId: "water-1",
        payload: { amountMl: 250 },
      },
    ],
  } as unknown as DailyHistoryResponse;
}

test("daily metric navigation uses only existing source routes when records exist", () => {
  const history = dailyWithEveryMetric();
  const metrics = Object.keys(DAILY_HISTORY_METRIC_ROUTES) as DailyHistoryMetric[];

  for (const metric of metrics) {
    expect(dailyHistoryMetricRoute(history, metric)).toBe(DAILY_HISTORY_METRIC_ROUTES[metric]);
  }
});

test("missing daily metrics expose neither a route nor a fake drill-down", () => {
  const history = dailyWithEveryMetric();
  history.nutrition.totals.proteinG = { state: "UNKNOWN", value: null };
  history.water.totalMl = { state: "NO_RECORD", value: null };
  history.activity.totalActiveMinutes = { state: "UNAVAILABLE", value: null };
  history.sleep.totalDurationMinutes = { state: "NO_RECORD", value: null };
  history.weight.measurement = null;

  expect(dailyHistoryMetricRoute(history, "calories")).toBe("/meals");
  for (const metric of ["protein", "water", "activity", "sleep", "weight"] as const) {
    expect(dailyHistoryMetricRoute(history, metric)).toBeNull();
  }
});

test("share availability requires real records and never counts AI text alone", () => {
  const daily = dailyWithEveryMetric();
  expect(hasDailyHistoryShareData(daily)).toBe(true);
  daily.timeline = [];
  expect(hasDailyHistoryShareData(daily)).toBe(false);

  const comparison = {
    completeness: {
      current: {
        nutrition: { recordedDays: 0 },
        water: { recordedDays: 0 },
        activity: { recordedDays: 0 },
        sleep: { recordedDays: 0 },
        weight: { measurementCount: 0 },
      },
      previous: {
        nutrition: { recordedDays: 1 },
        water: { recordedDays: 0 },
        activity: { recordedDays: 0 },
        sleep: { recordedDays: 0 },
        weight: { measurementCount: 0 },
      },
    },
  } as HistoryComparisonResponse;

  expect(hasPeriodHistoryShareData(comparison)).toBe(false);
  expect(hasPeriodHistoryShareData(comparison, true)).toBe(true);
});
