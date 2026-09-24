import { expect, test } from "@playwright/test";

import {
  DEFAULT_HISTORY_SHARE_OPTIONS,
  buildComparisonHistorySharePayload,
  buildPeriodHistorySharePayload,
} from "../src/application/history/history-share";
import type {
  HistoryComparisonResponse,
  HistoryInsightResponse,
  MetricComparison,
  ObservedNumber,
} from "../src/domain/history/types";
import {
  HISTORY_SHARE_EXPORT_SIZE,
  historyPayloadText,
} from "../src/presentation/components/history/history-share-card";
import {
  buildHistoryShareScene,
  distributeVerticalSpace,
} from "../src/presentation/components/history/history-share-scene";

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

function completeness(recordedDays: number, expectedDays: number) {
  return {
    recordedDays,
    quantifiedDays: recordedDays,
    expectedDays,
    coverageRatio: recordedDays / expectedDays,
    status: recordedDays === expectedDays ? ("COMPLETE" as const) : ("PARTIAL" as const),
  };
}

function comparison(periodType: "WEEK" | "MONTH"): HistoryComparisonResponse {
  const week = periodType === "WEEK";
  const expectedDays = week ? 7 : 19;
  return {
    periodType,
    timezone: "Europe/Istanbul",
    comparisonMode: "EQUAL_ELAPSED_DAYS",
    currentPeriod: {
      localStartDate: week ? "2026-09-14" : "2026-09-01",
      localEndDateInclusive: "2026-09-19",
      localEndDateExclusive: "2026-09-20",
      fromUtc: "2026-09-01T00:00:00.000Z",
      toUtcExclusive: "2026-09-20T00:00:00.000Z",
      days: expectedDays,
    },
    previousPeriod: {
      localStartDate: week ? "2026-09-07" : "2026-08-01",
      localEndDateInclusive: week ? "2026-09-12" : "2026-08-19",
      localEndDateExclusive: week ? "2026-09-13" : "2026-08-20",
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
        recordedDays: metric(3, 3),
      },
      activity: {
        totalActiveMinutes: metric(990, 480),
        averageActiveMinutesPerRecordedDay: metric(330, 160),
        activityCount: metric(4, 3),
        totalDistanceKm: metric(12, 10),
        totalCaloriesBurned: metric(600, 500),
      },
      sleep: {
        recordedNights: metric(3, 2),
        totalDurationMinutes: metric(1350, 840),
        averageDurationPerRecordedNight: metric(450, 420),
        averageQuality: metric(4, 3.5),
      },
      weight: {
        measurementCount: metric(2, 2),
        firstMeasurementKg: metric(82, 81),
        lastMeasurementKg: metric(84, 81),
        netChangeKg: metric(2, 0),
      },
    },
    completeness: {
      current: {
        nutrition: completeness(3, expectedDays),
        water: completeness(3, expectedDays),
        activity: completeness(4, expectedDays),
        sleep: completeness(3, expectedDays),
        weight: { sourceStatus: "OK", measurementCount: 2 },
      },
      previous: {
        nutrition: completeness(3, expectedDays),
        water: completeness(3, expectedDays),
        activity: completeness(3, expectedDays),
        sleep: completeness(2, expectedDays),
        weight: { sourceStatus: "OK", measurementCount: 2 },
      },
    },
    meta: {
      partialResponse: false,
      unavailableSources: [],
      generatedAt: "2026-09-19T18:00:00.000Z",
    },
  };
}

function insight(scope: "DAY" | "WEEK" | "MONTH", text: string): HistoryInsightResponse {
  return {
    scope,
    periodKey: "2026-09-19",
    timezone: "Europe/Istanbul",
    content: { text },
    generatedBy: "AI",
    cacheStatus: "HIT",
    provider: "test",
    model: "test",
    generatedAt: "2026-09-19T18:00:00.000Z",
  };
}

test("weekly and monthly normal shares contain only the current period summary", () => {
  for (const periodType of ["WEEK", "MONTH"] as const) {
    const payload = buildPeriodHistorySharePayload(
      comparison(periodType),
      DEFAULT_HISTORY_SHARE_OPTIONS,
      null,
    );
    const text = historyPayloadText(payload);

    expect(payload.kind).toBe("normal");
    expect(payload.comparisonLabel).toBeNull();
    expect(payload.visualCards.every((card) => card.layout === "summary")).toBe(true);
    expect(text).toContain(periodType === "WEEK" ? "Diewish Hafta Özetim 🌿" : "Diewish Ay Özetim 🌿");
    expect(text).toContain("Günlük ortalama enerji: 1.840 kcal");
    expect(text).toContain("Toplam hareket: 16 sa 30 dk");
    expect(text).not.toContain("Geçen hafta");
    expect(text).not.toContain("Geçen ay");
    expect(text).not.toContain("Fark:");
  }
});

test("weekly and monthly comparison shares keep three-column values and readable durations", () => {
  for (const periodType of ["WEEK", "MONTH"] as const) {
    const payload = buildComparisonHistorySharePayload(
      comparison(periodType),
      DEFAULT_HISTORY_SHARE_OPTIONS,
      null,
    );
    const text = historyPayloadText(payload);
    const activity = payload.visualCards.find((card) => card.tone === "activity");

    expect(payload.kind).toBe("comparison");
    expect(payload.visualCards.every((card) => card.layout === "comparison")).toBe(true);
    expect(activity).toMatchObject({
      currentValue: "16 sa 30 dk",
      previousValue: "8 sa",
      difference: "+8 sa 30 dk",
    });
    expect(text).toContain(
      periodType === "WEEK"
        ? "Bu hafta ↔ Geçen haftanın aynı dönemi"
        : "Bu ay ↔ Geçen ayın aynı dönemi",
    );
    expect(text).toContain(periodType === "WEEK" ? "Bu hafta: 1.840 kcal" : "Bu ay: 1.840 kcal");
    expect(text).toContain(
      periodType === "WEEK" ? "Geçen hafta: 1.740 kcal" : "Geçen ay: 1.740 kcal",
    );
    expect(text).toContain("Fark: +100 kcal");
  }
});

test("privacy defaults and toggles drive the same payload used by visual and text previews", () => {
  const source = comparison("WEEK") as HistoryComparisonResponse & {
    fullName?: string;
    email?: string;
    internalId?: string;
  };
  source.fullName = "PRIVATE FULL NAME";
  source.email = "private@example.com";
  source.internalId = "PRIVATE_INTERNAL_ID";

  const defaults = buildComparisonHistorySharePayload(
    source,
    DEFAULT_HISTORY_SHARE_OPTIONS,
    insight("WEEK", "PRIVATE AI INSIGHT"),
  );
  const defaultSerialized = JSON.stringify(defaults);
  expect(defaults.visualCards.map((card) => card.tone)).toEqual([
    "nutrition",
    "protein",
    "water",
    "activity",
  ]);
  expect(defaultSerialized).not.toContain("PRIVATE AI INSIGHT");
  expect(defaultSerialized).not.toContain("PRIVATE FULL NAME");
  expect(defaultSerialized).not.toContain("private@example.com");
  expect(defaultSerialized).not.toContain("PRIVATE_INTERNAL_ID");

  const selected = buildComparisonHistorySharePayload(
    source,
    {
      ...DEFAULT_HISTORY_SHARE_OPTIONS,
      includeSleep: true,
      includeWeight: true,
      includeAiInsight: true,
    },
    insight("WEEK", "Selected evaluation ".repeat(20).trim()),
  );
  const selectedText = historyPayloadText(selected);
  expect(selected.visualCards.some((card) => card.tone === "sleep")).toBe(true);
  expect(selected.visualCards.some((card) => card.tone === "weight")).toBe(true);
  expect(selected.visualCards.find((card) => card.tone === "weight")).toMatchObject({
    currentValue: "+2 kg",
    previousValue: "0 kg",
    difference: "+2 kg",
    coverage: "2 ölçüm",
  });
  expect(selected.aiInsight).toContain("Selected evaluation");
  expect(selectedText).toContain(selected.aiInsight ?? "");
});

test("a single weight measurement stays missing instead of becoming zero", () => {
  const source = comparison("WEEK");
  source.completeness.current.weight.measurementCount = 1;
  source.metrics.weight.netChangeKg.current = { state: "NO_RECORD", value: null };
  source.metrics.weight.netChangeKg.absoluteChange = null;
  source.metrics.weight.netChangeKg.percentageChange = null;
  source.metrics.weight.netChangeKg.direction = "UNAVAILABLE";
  source.metrics.weight.netChangeKg.comparisonAvailable = false;

  const payload = buildComparisonHistorySharePayload(
    source,
    { ...DEFAULT_HISTORY_SHARE_OPTIONS, includeWeight: true },
    null,
  );
  const weight = payload.visualCards.find((card) => card.tone === "weight");

  expect(weight).toMatchObject({
    currentValue: "—",
    difference: "—",
    coverage: "1 ölçüm",
    note: "Bu dönemde 1 ölçüm; değişim hesaplanamıyor.",
  });
});

test("mismatched insight scope and missing comparison records cannot leak into sharing", () => {
  const source = comparison("WEEK");
  source.metrics.water.averageMlPerRecordedDay = {
    ...source.metrics.water.averageMlPerRecordedDay,
    previous: { state: "NO_RECORD", value: null },
    absoluteChange: null,
    percentageChange: null,
    direction: "UNAVAILABLE",
    comparisonAvailable: false,
    quality: "NONE",
  };

  const payload = buildComparisonHistorySharePayload(
    source,
    { ...DEFAULT_HISTORY_SHARE_OPTIONS, includeAiInsight: true },
    insight("DAY", "WRONG SCOPE INSIGHT"),
  );
  const water = payload.visualCards.find((card) => card.tone === "water");
  const serialized = JSON.stringify(payload);

  expect(water?.previousValue).toBe("—");
  expect(water?.difference).toBe("—");
  expect(water?.note).toBe("Geçen dönemde kayıt yok.");
  expect(serialized).not.toContain("WRONG SCOPE INSIGHT");
  expect(serialized).not.toContain("NaN");
  expect(serialized).not.toContain("Infinity");
});

test("Share Visual V2 keeps the deterministic story export contract", () => {
  expect(HISTORY_SHARE_EXPORT_SIZE).toEqual({ width: 1080, height: 1920 });

  const weekly = buildPeriodHistorySharePayload(
    comparison("WEEK"),
    DEFAULT_HISTORY_SHARE_OPTIONS,
    null,
  );
  const monthly = buildPeriodHistorySharePayload(
    comparison("MONTH"),
    DEFAULT_HISTORY_SHARE_OPTIONS,
    null,
  );
  expect(buildHistoryShareScene(weekly).heading).toBe("Haftanın Özeti");
  expect(buildHistoryShareScene(monthly).heading).toBe("Ayın Özeti");
  expect(buildHistoryShareScene(weekly).cards.every((card) => card.layout === "summary")).toBe(
    true,
  );
  expect(buildHistoryShareScene(monthly).cards.every((card) => card.layout === "summary")).toBe(
    true,
  );
});

test("Share Visual V2 keeps comparison scenes distinct from normal period scenes", () => {
  const weekly = buildHistoryShareScene(
    buildComparisonHistorySharePayload(comparison("WEEK"), DEFAULT_HISTORY_SHARE_OPTIONS, null),
  );
  const monthly = buildHistoryShareScene(
    buildComparisonHistorySharePayload(comparison("MONTH"), DEFAULT_HISTORY_SHARE_OPTIONS, null),
  );

  expect(weekly.heading).toBe("Haftalık Karşılaştırma");
  expect(monthly.heading).toBe("Aylık Karşılaştırma");
  expect(weekly.cards.every((card) => card.layout === "comparison")).toBe(true);
  expect(monthly.cards.every((card) => card.layout === "comparison")).toBe(true);
  expect(weekly.cards[0]).toMatchObject({
    currentLabel: "Bu hafta",
    previousLabel: "Geçen hafta",
  });
  expect(monthly.cards[0]).toMatchObject({
    currentLabel: "Bu ay",
    previousLabel: "Geçen ay",
  });
});

test("visual scene is built only from the privacy-filtered immutable payload", () => {
  const source = comparison("WEEK") as HistoryComparisonResponse & {
    fullName?: string;
    email?: string;
    phone?: string;
    internalId?: string;
  };
  source.fullName = "PII_SENTINEL_NAME";
  source.email = "pii@example.com";
  source.phone = "+900000000000";
  source.internalId = "PII_INTERNAL_ID";

  const payload = buildComparisonHistorySharePayload(
    source,
    DEFAULT_HISTORY_SHARE_OPTIONS,
    insight("WEEK", "AI_SENTINEL"),
  );
  const scene = buildHistoryShareScene(payload);
  const serialized = JSON.stringify(scene);

  expect(Object.isFrozen(payload)).toBe(true);
  expect(Object.isFrozen(scene)).toBe(true);
  expect(serialized).not.toContain("PII_SENTINEL_NAME");
  expect(serialized).not.toContain("pii@example.com");
  expect(serialized).not.toContain("+900000000000");
  expect(serialized).not.toContain("PII_INTERNAL_ID");
  expect(serialized).not.toContain("AI_SENTINEL");
  expect(scene.cards.map((card) => card.tone)).toEqual([
    "nutrition",
    "protein",
    "water",
    "activity",
  ]);
});

test("long optional AI content is visually bounded while text share keeps the permitted full text", () => {
  const fullAi = "Uzun Türkçe değerlendirme metni ".repeat(80).trim();
  const payload = buildComparisonHistorySharePayload(
    comparison("MONTH"),
    {
      ...DEFAULT_HISTORY_SHARE_OPTIONS,
      includeSleep: true,
      includeWeight: true,
      includeAiInsight: true,
    },
    insight("MONTH", fullAi),
  );
  const scene = buildHistoryShareScene(payload);
  const text = historyPayloadText(payload);

  expect(scene.density).toBe("dense");
  expect(scene.aiInsight?.endsWith("…")).toBe(true);
  expect((scene.aiInsight?.length ?? 0) < fullAi.length).toBe(true);
  expect(text).toContain(fullAi);
});

test("sparse share content distributes unused vertical space symmetrically", () => {
  const spacing = distributeVerticalSpace(1200, [280, 280], 18);
  expect(spacing.before).toBeGreaterThan(18);
  expect(spacing.before).toBe(spacing.between);
  expect(spacing.before).toBe(spacing.after);
  expect(spacing.before * 3 + 560).toBeCloseTo(1200, 5);
});
