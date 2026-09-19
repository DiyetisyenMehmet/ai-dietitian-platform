import { expect, test } from "@playwright/test";

import {
  DEFAULT_HISTORY_SHARE_OPTIONS,
  buildDailyHistorySharePayload,
} from "../src/application/history/history-share";
import {
  historyRequestKey,
  historyStore,
  shiftCalendarDate,
  shiftCalendarMonth,
} from "../src/application/history/history-store";
import type { DailyHistoryResponse } from "../src/domain/history/types";
import { historyClient } from "../src/infrastructure/history/history-client";

const observed = (state: DailyHistoryResponse["nutrition"]["totals"]["calories"]["state"], value: number | null) => ({
  state,
  value,
});

function day(date: string): DailyHistoryResponse {
  return {
    date,
    timezone: "Europe/Istanbul",
    period: {
      localStartDate: date,
      localEndDateExclusive: shiftCalendarDate(date, 1),
      fromUtc: "2026-09-09T21:00:00.000Z",
      toUtcExclusive: "2026-09-10T21:00:00.000Z",
      days: 1,
    },
    nutrition: {
      sourceStatus: "OK",
      status: "RECORDED",
      meals: [
        {
          mealType: "LUNCH",
          occurrenceRecorded: true,
          nutritionKnown: true,
          items: [
            {
              id: "meal-1",
              name: "Private meal name",
              loggedAt: "2026-09-10T12:00:00.000Z",
              calories: 500,
              proteinG: 30,
              carbsG: 50,
              fatG: 20,
            },
          ],
          totals: {
            calories: observed("KNOWN_VALUE", 500),
            proteinG: observed("KNOWN_VALUE", 30),
            carbsG: observed("KNOWN_VALUE", 50),
            fatG: observed("KNOWN_VALUE", 20),
          },
        },
      ],
      totals: {
        calories: observed("KNOWN_VALUE", 500),
        proteinG: observed("KNOWN_VALUE", 30),
        carbsG: observed("KNOWN_VALUE", 50),
        fatG: observed("KNOWN_VALUE", 20),
      },
    },
    water: {
      sourceStatus: "OK",
      status: "RECORDED",
      totalMl: observed("KNOWN_VALUE", 1500),
      currentGoalMl: observed("UNKNOWN", null),
      historicalGoalComparisonAvailable: false,
      logs: [{ id: "w1", amountMl: 1500, loggedAt: "2026-09-10T13:00:00.000Z" }],
    },
    activity: {
      sourceStatus: "OK",
      status: "RECORDED",
      entries: [
        {
          id: "a1",
          type: "WALKING",
          name: "Walk",
          durationMinutes: 45,
          distanceKm: 3.4,
          perceivedIntensity: null,
          caloriesBurned: 150,
          loggedAt: "2026-09-10T15:00:00.000Z",
        },
      ],
      totalActiveMinutes: observed("KNOWN_VALUE", 45),
      totalDistanceKm: observed("KNOWN_VALUE", 3.4),
      totalCaloriesBurned: observed("KNOWN_VALUE", 150),
    },
    sleep: {
      sourceStatus: "OK",
      status: "RECORDED",
      entries: [
        {
          id: "s1",
          sleepStart: "2026-09-09T21:00:00.000Z",
          wakeTime: "2026-09-10T05:00:00.000Z",
          durationMinutes: 480,
          quality: 4,
        },
      ],
      totalDurationMinutes: observed("KNOWN_VALUE", 480),
      averageQuality: observed("KNOWN_VALUE", 4),
    },
    weight: {
      sourceStatus: "OK",
      status: "RECORDED",
      measurement: { id: "kg1", weightKg: 70.2, loggedAt: "2026-09-10T06:00:00.000Z" },
    },
    timeline: [],
    completeness: {
      nutrition: {
        status: "RECORDED",
        mealTypesRecorded: ["LUNCH"],
        nutritionBearingEntries: 1,
        entriesWithUnknownCoreNutrition: 0,
      },
      water: { status: "RECORDED" },
      activity: { status: "RECORDED" },
      sleep: { status: "RECORDED" },
      weight: { status: "RECORDED", measurementCount: 1 },
    },
    meta: { partialResponse: false, unavailableSources: [], generatedAt: "2026-09-10T18:00:00.000Z" },
  };
}

test("share defaults exclude meal names, sleep, weight and AI insight", () => {
  const payload = buildDailyHistorySharePayload(
    day("2026-09-10"),
    DEFAULT_HISTORY_SHARE_OPTIONS,
    {
      scope: "DAY",
      periodKey: "2026-09-10",
      timezone: "Europe/Istanbul",
      content: { text: "Private AI insight" },
      generatedBy: "AI",
      cacheStatus: "HIT",
      provider: "test",
      model: "test",
      generatedAt: "2026-09-10T18:00:00.000Z",
    },
  );

  const serialized = JSON.stringify(payload);
  expect(serialized).toContain("Beslenme");
  expect(serialized).toContain("Su");
  expect(serialized).toContain("Aktivite");
  expect(serialized).not.toContain("Private meal name");
  expect(serialized).not.toContain("Private AI insight");
  expect(serialized).not.toContain("70.2");
  expect(serialized).not.toContain("480");
});

test("explicit privacy toggles can include optional fields without adding hidden profile data", () => {
  const payload = buildDailyHistorySharePayload(
    day("2026-09-10"),
    {
      ...DEFAULT_HISTORY_SHARE_OPTIONS,
      includeMealNames: true,
      includeSleep: true,
      includeWeight: true,
      includeAiInsight: true,
    },
    {
      scope: "DAY",
      periodKey: "2026-09-10",
      timezone: "Europe/Istanbul",
      content: { text: "Selected AI insight" },
      generatedBy: "AI",
      cacheStatus: "HIT",
      provider: "test",
      model: "test",
      generatedAt: "2026-09-10T18:00:00.000Z",
    },
  );

  const serialized = JSON.stringify(payload);
  expect(serialized).toContain("Private meal name");
  expect(serialized).toContain("Selected AI insight");
  expect(serialized).toContain("70,2 kg");
  expect(serialized).toContain("480 dk");
  expect(serialized).not.toContain("email");
  expect(serialized).not.toContain("allerg");
});

test("calendar helpers clamp month edges and preserve date-only arithmetic", () => {
  expect(shiftCalendarDate("2026-03-01", -1)).toBe("2026-02-28");
  expect(shiftCalendarMonth("2026-03-31", -1)).toBe("2026-02-28");
  expect(shiftCalendarMonth("2028-03-31", -1)).toBe("2028-02-29");
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

test("rapid date switching ignores the older request when it resolves last", async () => {
  historyStore.reset();
  const original = historyClient.getDay;
  const firstDeferred = deferred<{ history: DailyHistoryResponse }>();
  const secondDeferred = deferred<{ history: DailyHistoryResponse }>();

  Reflect.set(historyClient, "getDay", (date: string) =>
    date === "2026-09-10" ? firstDeferred.promise : secondDeferred.promise,
  );

  try {
    const first = historyStore.load({
      userId: "user-1",
      mode: "DAY",
      date: "2026-09-10",
      timezone: "Europe/Istanbul",
    });
    const second = historyStore.load({
      userId: "user-1",
      mode: "DAY",
      date: "2026-09-11",
      timezone: "Europe/Istanbul",
    });

    secondDeferred.resolve({ history: day("2026-09-11") });
    await second;
    firstDeferred.resolve({ history: day("2026-09-10") });
    await first;

    const state = historyStore.getSnapshot();
    expect(state.requestKey).toBe(
      historyRequestKey("user-1", "DAY", "2026-09-11", "Europe/Istanbul"),
    );
    expect(state.daily?.date).toBe("2026-09-11");
  } finally {
    Reflect.set(historyClient, "getDay", original);
    historyStore.reset();
  }
});
