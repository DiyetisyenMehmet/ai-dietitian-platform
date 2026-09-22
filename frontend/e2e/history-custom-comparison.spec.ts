import { expect, test } from "@playwright/test";

import {
  type CustomHistoryComparisonInput,
  customRangeDayCount,
  validateCustomComparisonInput,
} from "../src/application/history/history-custom-comparison";
import {
  DEFAULT_HISTORY_SHARE_OPTIONS,
  HISTORY_VISUAL_SHARE_CAPTION,
  buildComparisonHistorySharePayload,
} from "../src/application/history/history-share";
import type {
  HistoryComparisonResponse,
  MetricComparison,
  ObservedNumber,
  PeriodCategoryCompleteness,
} from "../src/domain/history/types";
import {
  buildHistoryWebShareData,
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

function completeness(recordedDays: number, expectedDays: number): PeriodCategoryCompleteness {
  return {
    recordedDays,
    quantifiedDays: recordedDays,
    expectedDays,
    coverageRatio: recordedDays / expectedDays,
    status: recordedDays === expectedDays ? "COMPLETE" : recordedDays === 0 ? "NONE" : "PARTIAL",
  };
}

function customComparison(singleDay = false): HistoryComparisonResponse {
  const days = singleDay ? 1 : 7;
  return {
    periodType: "CUSTOM",
    timezone: "Europe/Istanbul",
    comparisonMode: "CUSTOM_EQUAL_RANGES",
    currentPeriod: {
      localStartDate: singleDay ? "2026-09-05" : "2026-08-01",
      localEndDateInclusive: singleDay ? "2026-09-05" : "2026-08-07",
      localEndDateExclusive: singleDay ? "2026-09-06" : "2026-08-08",
      fromUtc: "2026-08-31T21:00:00.000Z",
      toUtcExclusive: "2026-09-01T21:00:00.000Z",
      days,
    },
    previousPeriod: {
      localStartDate: singleDay ? "2026-09-19" : "2026-09-01",
      localEndDateInclusive: singleDay ? "2026-09-19" : "2026-09-07",
      localEndDateExclusive: singleDay ? "2026-09-20" : "2026-09-08",
      fromUtc: "2026-09-18T21:00:00.000Z",
      toUtcExclusive: "2026-09-19T21:00:00.000Z",
      days,
    },
    metrics: {
      nutrition: {
        averageCaloriesPerQuantifiedDay: metric(1840, 1760),
        averageProteinGPerQuantifiedDay: metric(112, 101),
        averageCarbsGPerQuantifiedDay: metric(201, 190),
        averageFatGPerQuantifiedDay: metric(61, 59),
        mealOccurrenceCount: metric(12, 10),
      },
      water: {
        totalMl: metric(9500, 8800),
        averageMlPerRecordedDay: metric(1900, 1760),
        recordedDays: metric(5, 5),
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
        measurementCount: metric(1, 1),
        firstMeasurementKg: metric(91.7, 92.1),
        lastMeasurementKg: metric(91.7, 92.1),
        netChangeKg: {
          current: { state: "UNKNOWN", value: null },
          previous: { state: "UNKNOWN", value: null },
          absoluteChange: null,
          percentageChange: null,
          direction: "UNAVAILABLE",
          comparisonAvailable: false,
          quality: "NONE",
        },
      },
    },
    completeness: {
      current: {
        nutrition: completeness(Math.min(5, days), days),
        water: completeness(Math.min(5, days), days),
        activity: completeness(Math.min(5, days), days),
        sleep: completeness(Math.min(5, days), days),
        weight: { sourceStatus: "OK", measurementCount: 1 },
      },
      previous: {
        nutrition: completeness(Math.min(4, days), days),
        water: completeness(Math.min(4, days), days),
        activity: completeness(Math.min(4, days), days),
        sleep: completeness(Math.min(4, days), days),
        weight: { sourceStatus: "OK", measurementCount: 1 },
      },
    },
    meta: {
      partialResponse: false,
      unavailableSources: [],
      generatedAt: "2026-09-22T12:00:00.000Z",
    },
  };
}

test("frontend custom range validation accepts single-day, seven-day, cross-month and cross-year ranges", () => {
  const cases: CustomHistoryComparisonInput[] = [
    {
      period1Start: "2026-09-05",
      period1End: "2026-09-05",
      period2Start: "2026-09-19",
      period2End: "2026-09-19",
    },
    {
      period1Start: "2026-08-01",
      period1End: "2026-08-07",
      period2Start: "2026-09-01",
      period2End: "2026-09-07",
    },
    {
      period1Start: "2026-08-29",
      period1End: "2026-09-04",
      period2Start: "2026-09-10",
      period2End: "2026-09-16",
    },
    {
      period1Start: "2025-12-29",
      period1End: "2026-01-04",
      period2Start: "2026-01-05",
      period2End: "2026-01-11",
    },
  ];

  for (const input of cases) {
    expect(validateCustomComparisonInput(input, "2026-09-22")).toBeNull();
  }
  expect(customRangeDayCount("2026-09-05", "2026-09-05")).toBe(1);
  expect(customRangeDayCount("2026-08-01", "2026-08-07")).toBe(7);
});

test("frontend rejects unequal, invalid, reversed, future and over-31-day custom ranges", () => {
  expect(
    validateCustomComparisonInput(
      {
        period1Start: "2026-08-01",
        period1End: "2026-08-07",
        period2Start: "2026-09-01",
        period2End: "2026-09-10",
      },
      "2026-09-22",
    ),
  ).toBe("Karşılaştırılacak dönemler aynı sayıda gün içermelidir.");

  expect(
    validateCustomComparisonInput(
      {
        period1Start: "2026-02-30",
        period1End: "2026-03-01",
        period2Start: "2026-03-02",
        period2End: "2026-03-03",
      },
      "2026-09-22",
    ),
  ).toBe("Geçerli tarihler seç.");

  expect(
    validateCustomComparisonInput(
      {
        period1Start: "2026-08-07",
        period1End: "2026-08-01",
        period2Start: "2026-09-01",
        period2End: "2026-09-07",
      },
      "2026-09-22",
    ),
  ).toBe("Başlangıç tarihi bitiş tarihinden sonra olamaz.");

  expect(
    validateCustomComparisonInput(
      {
        period1Start: "2026-07-01",
        period1End: "2026-08-01",
        period2Start: "2026-08-02",
        period2End: "2026-09-02",
      },
      "2026-09-22",
    ),
  ).toBe("Her dönem en fazla 31 gün içerebilir.");

  expect(
    validateCustomComparisonInput(
      {
        period1Start: "2026-09-23",
        period1End: "2026-09-23",
        period2Start: "2026-09-24",
        period2End: "2026-09-24",
      },
      "2026-09-22",
    ),
  ).toBe("Gelecek tarih karşılaştırılamaz.");
});

test("custom share uses 1. dönem and 2. dönem without changing privacy defaults", () => {
  const payload = buildComparisonHistorySharePayload(
    customComparison(),
    DEFAULT_HISTORY_SHARE_OPTIONS,
    {
      scope: "CUSTOM",
      periodKey: "CUSTOM:private",
      timezone: "Europe/Istanbul",
      content: { text: "PRIVATE_AI_SENTINEL" },
      generatedBy: "AI",
      cacheStatus: "HIT",
      provider: "test",
      model: "test",
      generatedAt: "2026-09-22T12:00:00.000Z",
    },
  );

  expect(payload.scope).toBe("CUSTOM");
  expect(payload.title).toBe("Diewish • Özel Karşılaştırma");
  expect(payload.periodLabel).toContain("1. dönem:");
  expect(payload.periodLabel).toBe("1. dönem: 1–7 Ağustos 2026");
  expect(payload.comparisonLabel).toContain("2. dönem:");
  expect(payload.comparisonLabel).toBe("2. dönem: 1–7 Eylül 2026");
  expect(payload.visualCards.every((card) => card.currentLabel === "1. dönem")).toBe(true);
  expect(payload.visualCards.every((card) => card.previousLabel === "2. dönem")).toBe(true);
  expect(payload.visualCards.some((card) => card.tone === "sleep")).toBe(false);
  expect(payload.visualCards.some((card) => card.tone === "weight")).toBe(false);
  expect(payload.aiInsight).toBeNull();
  expect(payload.motivation).not.toMatch(/PRIVATE_|91[,.]7|uyku|kilo/i);

  const dom = historyShareDomModel(payload);
  const scene = buildHistoryShareScene(payload);
  expect(dom.heading).toBe("Özel Karşılaştırma");
  expect(scene.heading).toBe("Özel Karşılaştırma");
  expect(scene.periodLabel).toBe(payload.periodLabel);
  expect(scene.comparisonLabel).toBe(payload.comparisonLabel);
});

test("single-day custom share keeps complete one-day labels", () => {
  const payload = buildComparisonHistorySharePayload(
    customComparison(true),
    DEFAULT_HISTORY_SHARE_OPTIONS,
    null,
  );
  expect(payload.periodLabel).toBe("1. dönem: 5 Eylül 2026");
  expect(payload.comparisonLabel).toBe("2. dönem: 19 Eylül 2026");
});

test("custom visual caption remains opt-in, generic and metric-free", () => {
  const payload = buildComparisonHistorySharePayload(
    customComparison(),
    DEFAULT_HISTORY_SHARE_OPTIONS,
    null,
  );
  const file = {} as File;
  const off = buildHistoryWebShareData(payload, file, null);
  const on = buildHistoryWebShareData(payload, file, HISTORY_VISUAL_SHARE_CAPTION);

  expect(Object.prototype.hasOwnProperty.call(off, "text")).toBe(false);
  expect(on.text).toBe(HISTORY_VISUAL_SHARE_CAPTION);
  expect(Array.from(normalizeHistoryVisualCaption(on.text)).length).toBeLessThanOrEqual(140);
  expect(on.text).not.toMatch(/kcal|kg|uyku|öğün|1\. dönem|2\. dönem/i);
});

test("standard weekly labels remain unchanged after custom support", () => {
  const standard = { ...customComparison(), periodType: "WEEK" as const, comparisonMode: "FULL_PERIODS" as const };
  const payload = buildComparisonHistorySharePayload(
    standard,
    DEFAULT_HISTORY_SHARE_OPTIONS,
    null,
  );
  expect(payload.visualCards.every((card) => card.currentLabel === "Bu hafta")).toBe(true);
  expect(payload.visualCards.every((card) => card.previousLabel === "Geçen hafta")).toBe(true);
  expect(payload.title).toBe("Diewish • Haftalık Karşılaştırma");
});
