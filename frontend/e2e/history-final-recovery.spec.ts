import { expect, test } from "@playwright/test";

import { formatComparisonPeriodDateRange } from "../src/application/history/history-comparison-format";
import {
  DEFAULT_HISTORY_SHARE_OPTIONS,
  HISTORY_MOTIVATION_MAX_CHARACTERS,
  HISTORY_VISUAL_SHARE_CAPTION,
  buildComparisonHistorySharePayload,
  buildPeriodHistoryMotivation,
} from "../src/application/history/history-share";
import type {
  HistoryComparisonResponse,
  MetricComparison,
  ObservedNumber,
  PeriodCategoryCompleteness,
} from "../src/domain/history/types";
import {
  buildHistoryWebShareData,
  historyPayloadText,
  normalizeHistoryVisualCaption,
} from "../src/presentation/components/history/history-share-card";
import { historyShareDomModel } from "../src/presentation/components/history/history-share-dom-model";
import { buildHistoryShareScene } from "../src/presentation/components/history/history-share-scene";

function observed(value: number): ObservedNumber {
  return { state: value === 0 ? "KNOWN_ZERO" : "KNOWN_VALUE", value };
}

function metric(current: number, previous: number): MetricComparison {
  const absoluteChange = current - previous;
  return {
    current: observed(current),
    previous: observed(previous),
    absoluteChange,
    percentageChange: previous === 0 ? null : (absoluteChange / Math.abs(previous)) * 100,
    direction: absoluteChange === 0 ? "UNCHANGED" : absoluteChange > 0 ? "UP" : "DOWN",
    comparisonAvailable: true,
    quality: "FULL",
  };
}

function coverage(recordedDays: number, expectedDays = 7): PeriodCategoryCompleteness {
  return {
    recordedDays,
    quantifiedDays: recordedDays,
    expectedDays,
    coverageRatio: recordedDays / expectedDays,
    status: recordedDays === 0 ? "NONE" : recordedDays === expectedDays ? "COMPLETE" : "PARTIAL",
  };
}

function comparison(periodType: "WEEK" | "MONTH" = "WEEK"): HistoryComparisonResponse {
  const week = periodType === "WEEK";
  const expectedDays = week ? 7 : 22;
  return {
    periodType,
    timezone: "Europe/Istanbul",
    comparisonMode: "EQUAL_ELAPSED_DAYS",
    currentPeriod: {
      localStartDate: week ? "2026-09-14" : "2026-09-01",
      localEndDateInclusive: week ? "2026-09-20" : "2026-09-22",
      localEndDateExclusive: week ? "2026-09-21" : "2026-09-23",
      fromUtc: "2026-09-01T00:00:00.000Z",
      toUtcExclusive: "2026-09-23T00:00:00.000Z",
      days: expectedDays,
    },
    previousPeriod: {
      localStartDate: week ? "2026-09-07" : "2026-08-01",
      localEndDateInclusive: week ? "2026-09-13" : "2026-08-22",
      localEndDateExclusive: week ? "2026-09-14" : "2026-08-23",
      fromUtc: "2026-08-01T00:00:00.000Z",
      toUtcExclusive: "2026-09-01T00:00:00.000Z",
      days: expectedDays,
    },
    metrics: {
      nutrition: {
        averageCaloriesPerQuantifiedDay: metric(1840, 1740),
        averageProteinGPerQuantifiedDay: metric(112, 100),
        averageCarbsGPerQuantifiedDay: metric(200, 190),
        averageFatGPerQuantifiedDay: metric(60, 58),
        mealOccurrenceCount: metric(12, 11),
      },
      water: {
        totalMl: metric(6300, 5700),
        averageMlPerRecordedDay: metric(2100, 1900),
        recordedDays: metric(5, 4),
      },
      activity: {
        totalActiveMinutes: metric(240, 210),
        averageActiveMinutesPerRecordedDay: metric(48, 42),
        activityCount: metric(5, 4),
        totalDistanceKm: metric(12, 10),
        totalCaloriesBurned: metric(600, 500),
      },
      sleep: {
        recordedNights: metric(5, 4),
        totalDurationMinutes: metric(2250, 1680),
        averageDurationPerRecordedNight: metric(450, 420),
        averageQuality: metric(4, 3.5),
      },
      weight: {
        measurementCount: metric(2, 2),
        firstMeasurementKg: metric(82, 83),
        lastMeasurementKg: metric(81, 82),
        netChangeKg: metric(-1, -1),
      },
    },
    completeness: {
      current: {
        nutrition: coverage(5, expectedDays),
        water: coverage(5, expectedDays),
        activity: coverage(5, expectedDays),
        sleep: coverage(5, expectedDays),
        weight: { sourceStatus: "OK", measurementCount: 2 },
      },
      previous: {
        nutrition: coverage(4, expectedDays),
        water: coverage(4, expectedDays),
        activity: coverage(4, expectedDays),
        sleep: coverage(4, expectedDays),
        weight: { sourceStatus: "OK", measurementCount: 2 },
      },
    },
    meta: {
      partialResponse: false,
      unavailableSources: [],
      generatedAt: "2026-09-22T12:00:00.000Z",
    },
  };
}

function setCurrentCoverage(
  source: HistoryComparisonResponse,
  nutrition: number,
  water: number,
  activity: number,
  sleep: number,
) {
  const expected = source.currentPeriod.days;
  source.completeness.current.nutrition = coverage(nutrition, expected);
  source.completeness.current.water = coverage(water, expected);
  source.completeness.current.activity = coverage(activity, expected);
  source.completeness.current.sleep = coverage(sleep, expected);
}

test("visual caption is short, generic and absent from Web Share when disabled", () => {
  const payload = buildComparisonHistorySharePayload(
    comparison(),
    DEFAULT_HISTORY_SHARE_OPTIONS,
    null,
  );
  const file = {} as File;
  const off = buildHistoryWebShareData(payload, file, null);
  const on = buildHistoryWebShareData(payload, file, HISTORY_VISUAL_SHARE_CAPTION);

  expect(Object.prototype.hasOwnProperty.call(off, "text")).toBe(false);
  expect(on.text).toBe(HISTORY_VISUAL_SHARE_CAPTION);
  expect(Array.from(HISTORY_VISUAL_SHARE_CAPTION).length).toBeLessThanOrEqual(140);
  expect(normalizeHistoryVisualCaption("x".repeat(200))).toHaveLength(140);
  expect(HISTORY_VISUAL_SHARE_CAPTION).not.toMatch(/kg|kcal|uyku|öğün/i);
});

test("motivation covers insufficient, weak, mixed, positive and steady recording rhythms", () => {
  const source = comparison();

  setCurrentCoverage(source, 0, 0, 0, 0);
  expect(buildPeriodHistoryMotivation(source, DEFAULT_HISTORY_SHARE_OPTIONS)).toContain(
    "kayıtların biraz az",
  );

  setCurrentCoverage(source, 1, 1, 1, 1);
  expect(buildPeriodHistoryMotivation(source, DEFAULT_HISTORY_SHARE_OPTIONS)).toContain(
    "ritmi yakalayamamış",
  );

  setCurrentCoverage(source, 7, 1, 6, 1);
  expect(buildPeriodHistoryMotivation(source, DEFAULT_HISTORY_SHARE_OPTIONS)).toContain(
    "Bazı günler daha düzenli",
  );

  setCurrentCoverage(source, 5, 5, 5, 5);
  expect(buildPeriodHistoryMotivation(source, DEFAULT_HISTORY_SHARE_OPTIONS)).toContain(
    "güzel bir ritim",
  );

  setCurrentCoverage(source, 7, 7, 7, 7);
  expect(buildPeriodHistoryMotivation(source, DEFAULT_HISTORY_SHARE_OPTIONS)).toContain(
    "Güzel bir dönem",
  );
});

test("motivation stays privacy-safe and identical across DOM and Canvas scene models", () => {
  const source = comparison();
  source.metrics.weight.lastMeasurementKg.current = observed(61.3);
  source.metrics.sleep.averageDurationPerRecordedNight.current = observed(503);

  const payload = buildComparisonHistorySharePayload(
    source,
    DEFAULT_HISTORY_SHARE_OPTIONS,
    null,
  );
  const scene = buildHistoryShareScene(payload);
  const dom = historyShareDomModel(payload);
  const serialized = JSON.stringify({ motivation: payload.motivation });

  expect(payload.visualCards.some((card) => card.tone === "weight")).toBe(false);
  expect(payload.visualCards.some((card) => card.tone === "sleep")).toBe(false);
  expect(serialized).not.toContain("61.3");
  expect(serialized).not.toContain("503");
  expect(serialized).not.toContain("AI");
  expect(dom.motivation).toBe(payload.motivation);
  expect(scene.motivation).toBe(payload.motivation);
  expect(Array.from(scene.motivation).length).toBeLessThanOrEqual(
    HISTORY_MOTIVATION_MAX_CHARACTERS,
  );
});

test("text share keeps its privacy-filtered contract and excludes visual-only motivation", () => {
  const payload = buildComparisonHistorySharePayload(
    comparison(),
    DEFAULT_HISTORY_SHARE_OPTIONS,
    null,
  );
  const text = historyPayloadText(payload);

  expect(text).toContain("Diewish haftalık karşılaştırmam");
  expect(text).toContain("Ortalama Kalori");
  expect(text).not.toContain(payload.motivation);
  expect(text).not.toContain(HISTORY_VISUAL_SHARE_CAPTION);
});

test("weekly and monthly comparison period labels are complete and locale formatted", () => {
  expect(formatComparisonPeriodDateRange("2026-09-14", "2026-09-20")).toBe(
    "14–20 Eylül 2026",
  );
  expect(formatComparisonPeriodDateRange("2026-09-07", "2026-09-13")).toBe(
    "7–13 Eylül 2026",
  );
  expect(formatComparisonPeriodDateRange("2026-09-01", "2026-09-22")).toBe(
    "1–22 Eylül 2026",
  );
  expect(formatComparisonPeriodDateRange("2026-08-01", "2026-08-22")).toBe(
    "1–22 Ağustos 2026",
  );
});
