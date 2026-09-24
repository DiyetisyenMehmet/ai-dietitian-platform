import { expect, test } from "@playwright/test";

import {
  DEFAULT_HISTORY_SHARE_OPTIONS,
  buildDailyHistorySharePayload,
  buildPeriodHistorySharePayload,
  type HistoryShareOptions,
} from "../src/application/history/history-share";
import { formatHistoryShareText } from "../src/application/history/history-share-text";
import type {
  DailyHistoryResponse,
  HistoryComparisonResponse,
  HistoryInsightResponse,
  MetricComparison,
  ObservedNumber,
} from "../src/domain/history/types";

function observed(
  value: number | null,
  state: ObservedNumber["state"] = value === null ? "NO_RECORD" : value === 0 ? "KNOWN_ZERO" : "KNOWN_VALUE",
): ObservedNumber {
  return { state, value };
}

function metric(current: ObservedNumber, previous: ObservedNumber = observed(null)): MetricComparison {
  const comparable = current.value !== null && previous.value !== null;
  const absoluteChange = comparable ? current.value! - previous.value! : null;
  return {
    current,
    previous,
    absoluteChange,
    percentageChange:
      comparable && previous.value !== 0 ? absoluteChange! / Math.abs(previous.value!) * 100 : null,
    direction:
      absoluteChange === null
        ? "UNAVAILABLE"
        : absoluteChange === 0
          ? "UNCHANGED"
          : absoluteChange > 0
            ? "UP"
            : "DOWN",
    comparisonAvailable: comparable,
    quality: comparable ? "FULL" : "NONE",
  };
}

function daily(overrides: Partial<DailyHistoryResponse> = {}): DailyHistoryResponse {
  const base: DailyHistoryResponse = {
    date: "2026-09-17",
    timezone: "Europe/Istanbul",
    period: {
      localStartDate: "2026-09-17",
      localEndDateExclusive: "2026-09-18",
      fromUtc: "2026-09-16T21:00:00.000Z",
      toUtcExclusive: "2026-09-17T21:00:00.000Z",
      days: 1,
    },
    nutrition: {
      sourceStatus: "OK",
      status: "NONE",
      meals: [],
      totals: {
        calories: observed(null),
        proteinG: observed(null),
        carbsG: observed(null),
        fatG: observed(null),
      },
    },
    water: {
      sourceStatus: "OK",
      status: "NONE",
      totalMl: observed(null),
      currentGoalMl: observed(null),
      historicalGoalComparisonAvailable: false,
      logs: [],
    },
    activity: {
      sourceStatus: "OK",
      status: "NONE",
      entries: [],
      totalActiveMinutes: observed(null),
      totalDistanceKm: observed(null),
      totalCaloriesBurned: observed(null),
    },
    sleep: {
      sourceStatus: "OK",
      status: "NONE",
      entries: [],
      totalDurationMinutes: observed(null),
      averageQuality: observed(null),
    },
    weight: { sourceStatus: "OK", status: "NONE", measurement: null },
    timeline: [],
    completeness: {
      nutrition: {
        status: "NONE",
        mealTypesRecorded: [],
        nutritionBearingEntries: 0,
        entriesWithUnknownCoreNutrition: 0,
      },
      water: { status: "NONE" },
      activity: { status: "NONE" },
      sleep: { status: "NONE" },
      weight: { status: "NONE", measurementCount: 0 },
    },
    meta: { partialResponse: false, unavailableSources: [], generatedAt: "2026-09-17T18:00:00.000Z" },
  };
  return { ...base, ...overrides };
}

function completeness(recordedDays: number, expectedDays: number) {
  return {
    recordedDays,
    quantifiedDays: recordedDays,
    expectedDays,
    coverageRatio: expectedDays > 0 ? recordedDays / expectedDays : null,
    status: recordedDays === 0 ? ("NONE" as const) : recordedDays === expectedDays ? ("COMPLETE" as const) : ("PARTIAL" as const),
  };
}

function comparison(
  periodType: "WEEK" | "MONTH",
  recordedDays: number,
  expectedDays: number,
): HistoryComparisonResponse {
  const week = periodType === "WEEK";
  const current = completeness(recordedDays, expectedDays);
  const previous = completeness(recordedDays, expectedDays);
  return {
    periodType,
    timezone: "Europe/Istanbul",
    comparisonMode: recordedDays === expectedDays ? "FULL_PERIODS" : "EQUAL_ELAPSED_DAYS",
    currentPeriod: {
      localStartDate: week ? "2026-09-21" : "2026-09-01",
      localEndDateInclusive: week ? "2026-09-27" : "2026-09-24",
      localEndDateExclusive: week ? "2026-09-28" : "2026-09-25",
      fromUtc: "2026-09-01T00:00:00.000Z",
      toUtcExclusive: "2026-09-25T00:00:00.000Z",
      days: expectedDays,
    },
    previousPeriod: {
      localStartDate: week ? "2026-09-14" : "2026-08-01",
      localEndDateInclusive: week ? "2026-09-20" : "2026-08-24",
      localEndDateExclusive: week ? "2026-09-21" : "2026-08-25",
      fromUtc: "2026-08-01T00:00:00.000Z",
      toUtcExclusive: "2026-09-01T00:00:00.000Z",
      days: expectedDays,
    },
    metrics: {
      nutrition: {
        averageCaloriesPerQuantifiedDay: metric(observed(1840), observed(1760)),
        averageProteinGPerQuantifiedDay: metric(observed(96), observed(91)),
        averageCarbsGPerQuantifiedDay: metric(observed(205), observed(198)),
        averageFatGPerQuantifiedDay: metric(observed(62), observed(60)),
        mealOccurrenceCount: metric(observed(12), observed(11)),
      },
      water: {
        totalMl: metric(observed(6300), observed(5700)),
        averageMlPerRecordedDay: metric(observed(2100), observed(1900)),
        recordedDays: metric(observed(recordedDays), observed(recordedDays)),
      },
      activity: {
        totalActiveMinutes: metric(observed(180), observed(160)),
        averageActiveMinutesPerRecordedDay: metric(observed(60), observed(53)),
        activityCount: metric(observed(4), observed(3)),
        totalDistanceKm: metric(observed(12.4), observed(10.8)),
        totalCaloriesBurned: metric(observed(760), observed(690)),
      },
      sleep: {
        recordedNights: metric(observed(recordedDays), observed(recordedDays)),
        totalDurationMinutes: metric(observed(1350), observed(1260)),
        averageDurationPerRecordedNight: metric(observed(450), observed(420)),
        averageQuality: metric(observed(4), observed(3.5)),
      },
      weight: {
        measurementCount: metric(observed(2), observed(2)),
        firstMeasurementKg: metric(observed(78.6), observed(79)),
        lastMeasurementKg: metric(observed(78.4), observed(78.7)),
        netChangeKg: metric(observed(-0.2), observed(-0.3)),
      },
    },
    completeness: {
      current: {
        nutrition: current,
        water: current,
        activity: current,
        sleep: current,
        weight: { sourceStatus: "OK", measurementCount: 2 },
      },
      previous: {
        nutrition: previous,
        water: previous,
        activity: previous,
        sleep: previous,
        weight: { sourceStatus: "OK", measurementCount: 2 },
      },
    },
    meta: { partialResponse: false, unavailableSources: [], generatedAt: "2026-09-24T12:00:00.000Z" },
  };
}

function insight(scope: "DAY" | "WEEK" | "MONTH", text: string): HistoryInsightResponse {
  return {
    scope,
    periodKey: "test",
    timezone: "Europe/Istanbul",
    content: { text },
    generatedBy: "AI",
    cacheStatus: "MISS",
    provider: "test",
    model: "test",
    generatedAt: "2026-09-24T12:00:00.000Z",
  };
}

test("DAY only-water canonical output is professional and does not invent missing metrics", () => {
  const history = daily({
    water: {
      sourceStatus: "OK",
      status: "RECORDED",
      totalMl: observed(500),
      currentGoalMl: observed(null),
      historicalGoalComparisonAvailable: false,
      logs: [{ id: "water-1", amountMl: 500, loggedAt: "2026-09-17T10:00:00.000Z" }],
    },
    timeline: [{ id: "water:1", type: "WATER", timestamp: "2026-09-17T10:00:00.000Z", sourceId: "water-1", payload: { amountMl: 500 } }],
    completeness: {
      nutrition: { status: "NONE", mealTypesRecorded: [], nutritionBearingEntries: 0, entriesWithUnknownCoreNutrition: 0 },
      water: { status: "RECORDED" },
      activity: { status: "NONE" },
      sleep: { status: "NONE" },
      weight: { status: "NONE", measurementCount: 0 },
    },
  });
  const text = formatHistoryShareText(
    buildDailyHistorySharePayload(history, DEFAULT_HISTORY_SHARE_OPTIONS, null),
  );

  expect(text).toBe(
    [
      "17 Eylül 2026 • Diewish Gün Özetim 🌿",
      "",
      "💧 Su Tüketimi",
      "Kaydedilen su: 500 ml",
      "",
      "📊 Günün Genel Durumu",
      "Bugün kaydettiğim verilere göre takip edilen başlıca alan su tüketimim oldu.",
      "",
      "Diewish ile ilerlememi takip ediyorum. 🌿",
    ].join("\n"),
  );
  expect(text).not.toMatch(/0 kcal|0 dk|0 kg|0 sa|Hedef tamamlanma/u);
});

test("DAY multi-metric output uses real goal, macros, distance and active energy", () => {
  const history = daily({
    nutrition: {
      sourceStatus: "OK",
      status: "RECORDED",
      meals: [{
        mealType: "LUNCH",
        occurrenceRecorded: true,
        nutritionKnown: true,
        items: [{ id: "meal-1", name: "Mercimek", loggedAt: "2026-09-17T09:00:00.000Z", calories: 1840, proteinG: 96, carbsG: 205, fatG: 62 }],
        totals: { calories: observed(1840), proteinG: observed(96), carbsG: observed(205), fatG: observed(62) },
      }],
      totals: { calories: observed(1840), proteinG: observed(96), carbsG: observed(205), fatG: observed(62) },
    },
    water: {
      sourceStatus: "OK",
      status: "RECORDED",
      totalMl: observed(2250),
      currentGoalMl: observed(2500),
      historicalGoalComparisonAvailable: true,
      logs: [{ id: "water-1", amountMl: 2250, loggedAt: "2026-09-17T10:00:00.000Z" }],
    },
    activity: {
      sourceStatus: "OK",
      status: "RECORDED",
      entries: [{ id: "activity-1", type: "WALKING", name: "Yürüyüş", durationMinutes: 48, distanceKm: 6.1, perceivedIntensity: null, caloriesBurned: 320, loggedAt: "2026-09-17T12:00:00.000Z" }],
      totalActiveMinutes: observed(48),
      totalDistanceKm: observed(6.1),
      totalCaloriesBurned: observed(320),
    },
    timeline: [
      { id: "meal:1", type: "MEAL", timestamp: "2026-09-17T09:00:00.000Z", sourceId: "meal-1", payload: { mealType: "LUNCH", name: "Mercimek", nutritionKnown: true } },
      { id: "water:1", type: "WATER", timestamp: "2026-09-17T10:00:00.000Z", sourceId: "water-1", payload: { amountMl: 2250 } },
      { id: "activity:1", type: "ACTIVITY", timestamp: "2026-09-17T12:00:00.000Z", sourceId: "activity-1", payload: { type: "WALKING", name: "Yürüyüş", durationMinutes: 48 } },
    ],
  });
  const text = formatHistoryShareText(
    buildDailyHistorySharePayload(history, DEFAULT_HISTORY_SHARE_OPTIONS, null),
  );

  for (const expected of [
    "🥗 Beslenme",
    "Toplam enerji: 1.840 kcal",
    "Protein: 96 g",
    "Karbonhidrat: 205 g",
    "Yağ: 62 g",
    "💧 Su Tüketimi",
    "Günlük hedef: 2.500 ml",
    "Hedef tamamlanma: %90",
    "🚶 Aktivite",
    "Toplam hareket: 48 dk",
    "Mesafe: 6,1 km",
    "Aktif enerji: 320 kcal",
  ]) expect(text).toContain(expected);

  expect(text).not.toContain("Mercimek");
  expect(text).not.toContain("😴 Uyku");
  expect(text).not.toContain("⚖️ Kilo");
});

test("DAY optional privacy fields appear only when explicitly enabled", () => {
  const history = daily({
    nutrition: {
      sourceStatus: "OK",
      status: "RECORDED",
      meals: [{
        mealType: "DINNER",
        occurrenceRecorded: true,
        nutritionKnown: true,
        items: [{ id: "meal-private", name: "PRIVATE_MEAL", loggedAt: "2026-09-17T18:00:00.000Z", calories: 600, proteinG: 30, carbsG: 70, fatG: 20 }],
        totals: { calories: observed(600), proteinG: observed(30), carbsG: observed(70), fatG: observed(20) },
      }],
      totals: { calories: observed(600), proteinG: observed(30), carbsG: observed(70), fatG: observed(20) },
    },
    sleep: {
      sourceStatus: "OK",
      status: "RECORDED",
      entries: [{ id: "sleep-1", sleepStart: "2026-09-16T21:00:00.000Z", wakeTime: "2026-09-17T04:32:00.000Z", durationMinutes: 452, quality: 4 }],
      totalDurationMinutes: observed(452),
      averageQuality: observed(4),
    },
    weight: { sourceStatus: "OK", status: "RECORDED", measurement: { id: "weight-1", weightKg: 78.4, loggedAt: "2026-09-17T06:00:00.000Z" } },
    timeline: [{ id: "meal:private", type: "MEAL", timestamp: "2026-09-17T18:00:00.000Z", sourceId: "meal-private", payload: { mealType: "DINNER", name: "PRIVATE_MEAL", nutritionKnown: true } }],
  });
  const evaluation = "Kayıtlarına göre bugün seçtiğin alanlar bu değerlendirmede özetleniyor.";
  const defaultText = formatHistoryShareText(
    buildDailyHistorySharePayload(history, DEFAULT_HISTORY_SHARE_OPTIONS, insight("DAY", evaluation)),
  );
  for (const hidden of ["PRIVATE_MEAL", "7 sa 32 dk", "78,4 kg", evaluation]) {
    expect(defaultText).not.toContain(hidden);
  }

  const allOptions: HistoryShareOptions = {
    ...DEFAULT_HISTORY_SHARE_OPTIONS,
    includeMealNames: true,
    includeSleep: true,
    includeWeight: true,
    includeAiInsight: true,
  };
  const allText = formatHistoryShareText(
    buildDailyHistorySharePayload(history, allOptions, insight("DAY", evaluation)),
  );
  expect(allText).toContain("Öğünler: PRIVATE_MEAL");
  expect(allText).toContain("Toplam uyku: 7 sa 32 dk");
  expect(allText).toContain("Bugünkü kayıt: 78,4 kg");
  expect(allText).toContain("🌱 Diewish Değerlendirmesi");
  expect(allText).toContain(evaluation);
});

test("DAY preserves real zero while missing categories remain absent", () => {
  const history = daily({
    nutrition: {
      sourceStatus: "OK",
      status: "RECORDED",
      meals: [],
      totals: {
        calories: observed(0, "KNOWN_ZERO"),
        proteinG: observed(0, "KNOWN_ZERO"),
        carbsG: observed(0, "KNOWN_ZERO"),
        fatG: observed(0, "KNOWN_ZERO"),
      },
    },
    timeline: [{ id: "meal:zero", type: "MEAL", timestamp: "2026-09-17T08:00:00.000Z", sourceId: "zero", payload: { mealType: "BREAKFAST", name: null, nutritionKnown: true } }],
  });
  const text = formatHistoryShareText(
    buildDailyHistorySharePayload(history, DEFAULT_HISTORY_SHARE_OPTIONS, null),
  );
  expect(text).toContain("Toplam enerji: 0 kcal");
  expect(text).toContain("Protein: 0 g");
  expect(text).not.toContain("💧 Su Tüketimi");
  expect(text).not.toContain("🚶 Aktivite");
  expect(text).not.toContain("😴 Uyku");
  expect(text).not.toContain("⚖️ Kilo");
});

test("WEEK normal formatter includes real aggregates and marks partial coverage", () => {
  const text = formatHistoryShareText(
    buildPeriodHistorySharePayload(
      comparison("WEEK", 2, 7),
      { ...DEFAULT_HISTORY_SHARE_OPTIONS, includeSleep: true, includeWeight: true },
      null,
    ),
  );
  for (const expected of [
    "21 Eylül 2026 – 27 Eylül 2026 • Diewish Hafta Özetim 🌿",
    "Günlük ortalama enerji: 1.840 kcal",
    "Günlük ortalama protein: 96 g",
    "Günlük ortalama karbonhidrat: 205 g",
    "Günlük ortalama yağ: 62 g",
    "Toplam: 6,3 L",
    "Günlük ortalama: 2,1 L",
    "Toplam hareket: 3 sa",
    "Mesafe: 12,4 km",
    "Aktif enerji: 760 kcal",
    "Ortalama: 7 sa 30 dk",
    "Dönem değişimi: −0,2 kg",
    "Kayıt kapsamı dönemin tamamını içermediği için özet yalnız kayıt bulunan günleri yansıtır.",
  ]) expect(text).toContain(expected);
});

test("WEEK completed historical period does not claim limited coverage", () => {
  const text = formatHistoryShareText(
    buildPeriodHistorySharePayload(
      comparison("WEEK", 7, 7),
      DEFAULT_HISTORY_SHARE_OPTIONS,
      null,
    ),
  );
  expect(text).toContain("Diewish Hafta Özetim 🌿");
  expect(text).not.toContain("Kayıt kapsamı dönemin tamamını içermediği");
});

test("MONTH supports partial and completed periods without inventing missing metrics", () => {
  const partial = comparison("MONTH", 3, 24);
  partial.metrics.activity.totalDistanceKm = metric(observed(null));
  partial.metrics.activity.totalCaloriesBurned = metric(observed(null));
  const partialText = formatHistoryShareText(
    buildPeriodHistorySharePayload(partial, DEFAULT_HISTORY_SHARE_OPTIONS, null),
  );
  expect(partialText).toContain("Diewish Ay Özetim 🌿");
  expect(partialText).toContain("Kayıt kapsamı dönemin tamamını içermediği");
  expect(partialText).not.toContain("Mesafe:");
  expect(partialText).not.toContain("Aktif enerji:");

  const completedText = formatHistoryShareText(
    buildPeriodHistorySharePayload(
      comparison("MONTH", 30, 30),
      DEFAULT_HISTORY_SHARE_OPTIONS,
      null,
    ),
  );
  expect(completedText).toContain("Diewish Ay Özetim 🌿");
  expect(completedText).not.toContain("NaN");
  expect(completedText).not.toContain("Infinity");
});

test("privacy exclusions hold independently for meal names, sleep, weight and evaluation", () => {
  const history = daily({
    nutrition: {
      sourceStatus: "OK",
      status: "RECORDED",
      meals: [{
        mealType: "LUNCH",
        occurrenceRecorded: true,
        nutritionKnown: true,
        items: [{ id: "private-id", name: "PRIVATE_MEAL", loggedAt: "2026-09-17T09:00:00.000Z", calories: 500, proteinG: 20, carbsG: 60, fatG: 18 }],
        totals: { calories: observed(500), proteinG: observed(20), carbsG: observed(60), fatG: observed(18) },
      }],
      totals: { calories: observed(500), proteinG: observed(20), carbsG: observed(60), fatG: observed(18) },
    },
    sleep: {
      sourceStatus: "OK",
      status: "RECORDED",
      entries: [{ id: "sleep-private", sleepStart: "2026-09-16T21:00:00.000Z", wakeTime: "2026-09-17T04:00:00.000Z", durationMinutes: 420, quality: 4 }],
      totalDurationMinutes: observed(420),
      averageQuality: observed(4),
    },
    weight: { sourceStatus: "OK", status: "RECORDED", measurement: { id: "weight-private", weightKg: 78.4, loggedAt: "2026-09-17T06:00:00.000Z" } },
    timeline: [{ id: "meal:private", type: "MEAL", timestamp: "2026-09-17T09:00:00.000Z", sourceId: "private-id", payload: { mealType: "LUNCH", name: "PRIVATE_MEAL", nutritionKnown: true } }],
  });
  const ai = "PRIVATE_EVALUATION";

  const cases: Array<[keyof HistoryShareOptions, string]> = [
    ["includeMealNames", "PRIVATE_MEAL"],
    ["includeSleep", "7 sa"],
    ["includeWeight", "78,4 kg"],
    ["includeAiInsight", ai],
  ];

  for (const [key, sentinel] of cases) {
    const options: HistoryShareOptions = {
      ...DEFAULT_HISTORY_SHARE_OPTIONS,
      includeMealNames: true,
      includeSleep: true,
      includeWeight: true,
      includeAiInsight: true,
      [key]: false,
    };
    const text = formatHistoryShareText(
      buildDailyHistorySharePayload(history, options, insight("DAY", ai)),
    );
    expect(text).not.toContain(sentinel);
  }
});
