import assert from "node:assert/strict";
import test from "node:test";
import type { Activity, MealLog, WaterLog, WeightLog } from "@prisma/client";

import type { SleepLogRecord } from "../sleep/sleep.repository";
import {
  buildDailyHistory,
  buildTimeline,
  normalizeNutrition,
  type DailyHistorySourceSnapshot,
} from "./history.service";

const BASE = new Date("2026-09-10T08:00:00.000Z");

function meal(id: string, overrides: Partial<MealLog> = {}): MealLog {
  return {
    id,
    userId: "user-a",
    mealType: "BREAKFAST",
    name: "Yumurta",
    calories: 200,
    proteinG: 15,
    carbsG: 2,
    fatG: 14,
    sodiumMg: null,
    sugarG: null,
    loggedAt: BASE,
    createdAt: BASE,
    ...overrides,
  };
}

function water(id: string, amountMl: number, loggedAt = BASE): WaterLog {
  return { id, userId: "user-a", amountMl, loggedAt, createdAt: loggedAt };
}

function activity(id: string, loggedAt = BASE): Activity {
  return {
    id,
    userId: "user-a",
    type: "WALKING",
    name: "Yürüyüş",
    durationMinutes: 30,
    distanceKm: 2.5,
    perceivedIntensity: 5,
    caloriesBurned: 120,
    note: null,
    loggedAt,
    createdAt: loggedAt,
  };
}

function sleep(id: string): SleepLogRecord {
  return {
    id,
    userId: "user-a",
    sleepStart: new Date("2026-09-09T20:40:00.000Z"),
    wakeTime: new Date("2026-09-10T04:20:00.000Z"),
    durationMinutes: 460,
    quality: 4,
    note: "must not leak",
    createdAt: BASE,
    updatedAt: BASE,
  };
}

function weight(id: string, weightKg: number, loggedAt = BASE): WeightLog {
  return { id, userId: "user-a", weightKg, note: null, loggedAt, createdAt: loggedAt };
}

function ok<T>(value: T): { status: "OK"; value: T } {
  return { status: "OK", value };
}

const emptySnapshot = (): DailyHistorySourceSnapshot => ({
  meals: ok([]),
  water: ok([]),
  activities: ok([]),
  sleep: ok([]),
  weights: ok([]),
  waterGoal: ok({ dailyWaterGoalMl: 2500 }),
});

test("empty successful day stays NO_RECORD instead of becoming zero", () => {
  const history = buildDailyHistory(
    {
      date: "2026-09-10",
      timezone: "Europe/Istanbul",
      fromUtc: new Date("2026-09-09T21:00:00.000Z"),
      toUtcExclusive: new Date("2026-09-10T21:00:00.000Z"),
      isToday: false,
      generatedAt: BASE,
    },
    emptySnapshot(),
  );
  assert.equal(history.water.totalMl.state, "NO_RECORD");
  assert.equal(history.nutrition.totals.calories.state, "NO_RECORD");
  assert.equal(history.activity.totalActiveMinutes.state, "NO_RECORD");
  assert.equal(history.sleep.totalDurationMinutes.state, "NO_RECORD");
  assert.equal(history.weight.measurement, null);
  assert.equal(history.water.currentGoalMl.state, "UNKNOWN");
  assert.equal(history.water.historicalGoalComparisonAvailable, false);
  assert.equal(history.meta.partialResponse, false);
});

test("today uses the owner's authoritative water goal without backfilling past days", () => {
  const history = buildDailyHistory(
    {
      date: "2026-09-10",
      timezone: "Europe/Istanbul",
      fromUtc: new Date("2026-09-09T21:00:00.000Z"),
      toUtcExclusive: new Date("2026-09-10T21:00:00.000Z"),
      isToday: true,
      generatedAt: BASE,
    },
    emptySnapshot(),
  );

  assert.deepEqual(history.water.currentGoalMl, { state: "KNOWN_VALUE", value: 2500 });
  assert.equal(history.water.historicalGoalComparisonAvailable, true);
});

test("bare meal check-in records occurrence without manufacturing nutrition", () => {
  const bare = meal("bare", {
    name: null,
    calories: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
  });
  const nutrition = normalizeNutrition(ok([bare]));
  assert.equal(nutrition.status, "PARTIAL");
  assert.equal(nutrition.meals[0].occurrenceRecorded, true);
  assert.equal(nutrition.meals[0].nutritionKnown, false);
  assert.deepEqual(nutrition.meals[0].items, []);
  assert.equal(nutrition.totals.calories.state, "UNKNOWN");
  assert.equal(nutrition.totals.calories.value, null);
});

test("partial nutrition preserves known subtotal without claiming a complete total", () => {
  const nutrition = normalizeNutrition(
    ok([
      meal("known"),
      meal("unknown", {
        name: "Bilinmeyen",
        calories: null,
        proteinG: null,
        carbsG: null,
        fatG: null,
      }),
    ]),
  );
  assert.equal(nutrition.totals.calories.state, "PARTIAL_VALUE");
  assert.equal(nutrition.totals.calories.value, 200);
  assert.equal(nutrition.status, "PARTIAL");
});

test("real recorded numeric zero stays KNOWN_ZERO", () => {
  const nutrition = normalizeNutrition(
    ok([meal("zero", { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 })]),
  );
  assert.equal(nutrition.totals.calories.state, "KNOWN_ZERO");
  assert.equal(nutrition.totals.calories.value, 0);
});

test("unavailable source stays UNAVAILABLE rather than masquerading as no record", () => {
  const nutrition = normalizeNutrition({ status: "UNAVAILABLE", value: null });
  assert.equal(nutrition.status, "UNAVAILABLE");
  assert.equal(nutrition.totals.calories.state, "UNAVAILABLE");
});

test("timeline uses wake time for sleep and deterministic type/source ordering", () => {
  const same = new Date("2026-09-10T08:00:00.000Z");
  const snapshot: DailyHistorySourceSnapshot = {
    meals: ok([meal("b", { loggedAt: same }), meal("a", { loggedAt: same })]),
    water: ok([water("z", 250, same)]),
    activities: ok([activity("x", same)]),
    sleep: ok([sleep("sleep-1")]),
    weights: ok([weight("weight-1", 80, same)]),
    waterGoal: ok(null),
  };
  const timeline = buildTimeline(snapshot);
  assert.equal(timeline[0].type, "SLEEP");
  assert.equal(timeline[0].timestamp, "2026-09-10T04:20:00.000Z");
  assert.deepEqual(
    timeline.slice(1).map((event) => [event.type, event.sourceId]),
    [
      ["MEAL", "a"],
      ["MEAL", "b"],
      ["WATER", "z"],
      ["ACTIVITY", "x"],
      ["WEIGHT", "weight-1"],
    ],
  );
});

test("daily summary chooses the latest exact-day weight while timeline keeps both measurements", () => {
  const snapshot = emptySnapshot();
  snapshot.weights = ok([
    weight("early", 81, new Date("2026-09-10T06:00:00.000Z")),
    weight("late", 80.6, new Date("2026-09-10T18:00:00.000Z")),
  ]);
  const history = buildDailyHistory(
    {
      date: "2026-09-10",
      timezone: "Europe/Istanbul",
      fromUtc: new Date("2026-09-09T21:00:00.000Z"),
      toUtcExclusive: new Date("2026-09-10T21:00:00.000Z"),
      isToday: false,
      generatedAt: BASE,
    },
    snapshot,
  );
  assert.equal(history.weight.measurement?.id, "late");
  assert.equal(history.timeline.filter((event) => event.type === "WEIGHT").length, 2);
});

test("cross-midnight sleep remains one event owned by its wake day and omits note", () => {
  const snapshot = emptySnapshot();
  snapshot.sleep = ok([sleep("night")]);
  const timeline = buildTimeline(snapshot);
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].type, "SLEEP");
  if (timeline[0].type !== "SLEEP") throw new Error("Expected sleep event");
  assert.equal(timeline[0].timestamp, "2026-09-10T04:20:00.000Z");
  assert.equal("note" in timeline[0].payload, false);
});
