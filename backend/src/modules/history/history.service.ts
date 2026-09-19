import type { Activity, MealLog, WaterLog, WeightLog } from "@prisma/client";

import { ApiError } from "../../utils/api-error";
import { activityRepository } from "../activity/activity.repository";
import { sleepRepository, type SleepLogRecord } from "../sleep/sleep.repository";
import { trackingRepository } from "../tracking/tracking.repository";
import { historyRepository } from "./history.repository";
import { addCalendarDays, dateKeyInTimezone, resolveHistoryDayRange } from "./history-time";
import type {
  DailyActivity,
  DailyCompleteness,
  DailyHistoryResponse,
  DailyMealGroup,
  DailyNutrition,
  DailySleep,
  DailyWater,
  DailyWeight,
  HistoryCategoryStatus,
  HistorySource,
  HistoryTimelineEvent,
  ObservedNumber,
} from "./history.types";

const MEAL_ORDER = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;

const EVENT_PRIORITY: Record<HistoryTimelineEvent["type"], number> = {
  MEAL: 10,
  WATER: 20,
  ACTIVITY: 30,
  WEIGHT: 40,
  SLEEP: 50,
};

type SourceResult<T> =
  | { status: "OK"; value: T }
  | { status: "UNAVAILABLE"; value: null };

export interface DailyHistorySourceSnapshot {
  meals: SourceResult<MealLog[]>;
  water: SourceResult<WaterLog[]>;
  activities: SourceResult<Activity[]>;
  sleep: SourceResult<SleepLogRecord[]>;
  weights: SourceResult<WeightLog[]>;
  waterGoal: SourceResult<{ dailyWaterGoalMl: number } | null>;
}

function unavailableNumber(): ObservedNumber {
  return { state: "UNAVAILABLE", value: null };
}

function noRecordNumber(): ObservedNumber {
  return { state: "NO_RECORD", value: null };
}

function unknownNumber(): ObservedNumber {
  return { state: "UNKNOWN", value: null };
}

function knownNumber(value: number): ObservedNumber {
  return { state: value === 0 ? "KNOWN_ZERO" : "KNOWN_VALUE", value };
}

function aggregateOptionalNumbers(
  values: Array<number | null>,
  hasRelevantRecord: boolean,
): ObservedNumber {
  if (!hasRelevantRecord) return noRecordNumber();
  const known = values.filter((value): value is number => value !== null);
  if (known.length === 0) return unknownNumber();
  const total = known.reduce((sum, value) => sum + value, 0);
  if (known.length !== values.length) return { state: "PARTIAL_VALUE", value: total };
  return knownNumber(total);
}

function averageKnownNumbers(values: number[]): ObservedNumber {
  if (values.length === 0) return noRecordNumber();
  return knownNumber(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function isBareMealCheckIn(log: MealLog): boolean {
  return (
    log.name === null &&
    log.calories === null &&
    log.proteinG === null &&
    log.carbsG === null &&
    log.fatG === null
  );
}

function nutritionStatus(logs: MealLog[]): HistoryCategoryStatus {
  if (logs.length === 0) return "NONE";
  const hasBareCheckIn = logs.some(isBareMealCheckIn);
  const nutritionRows = logs.filter((log) => !isBareMealCheckIn(log));
  if (nutritionRows.length === 0) return "PARTIAL";
  const hasUnknownCoreNutrition = nutritionRows.some(
    (log) =>
      log.calories === null ||
      log.proteinG === null ||
      log.carbsG === null ||
      log.fatG === null,
  );
  return hasBareCheckIn || hasUnknownCoreNutrition ? "PARTIAL" : "RECORDED";
}

function mealMetric(
  logs: MealLog[],
  key: "calories" | "proteinG" | "carbsG" | "fatG",
): ObservedNumber {
  if (logs.length === 0) return noRecordNumber();
  const nutritionRows = logs.filter((log) => !isBareMealCheckIn(log));
  if (nutritionRows.length === 0) return unknownNumber();
  return aggregateOptionalNumbers(
    nutritionRows.map((log) => log[key]),
    true,
  );
}

export function normalizeNutrition(source: SourceResult<MealLog[]>): DailyNutrition {
  if (source.status === "UNAVAILABLE") {
    return {
      sourceStatus: "UNAVAILABLE",
      status: "UNAVAILABLE",
      meals: [],
      totals: {
        calories: unavailableNumber(),
        proteinG: unavailableNumber(),
        carbsG: unavailableNumber(),
        fatG: unavailableNumber(),
      },
    };
  }

  const logs = source.value;
  const meals: DailyMealGroup[] = MEAL_ORDER.flatMap((mealType) => {
    const groupLogs = logs.filter((log) => log.mealType === mealType);
    if (groupLogs.length === 0) return [];
    const nutritionRows = groupLogs.filter((log) => !isBareMealCheckIn(log));
    return [
      {
        mealType,
        occurrenceRecorded: true,
        nutritionKnown: nutritionRows.some(
          (log) =>
            log.calories !== null ||
            log.proteinG !== null ||
            log.carbsG !== null ||
            log.fatG !== null,
        ),
        items: nutritionRows.map((log) => ({
          id: log.id,
          name: log.name,
          loggedAt: log.loggedAt.toISOString(),
          calories: log.calories,
          proteinG: log.proteinG,
          carbsG: log.carbsG,
          fatG: log.fatG,
        })),
        totals: {
          calories: mealMetric(groupLogs, "calories"),
          proteinG: mealMetric(groupLogs, "proteinG"),
          carbsG: mealMetric(groupLogs, "carbsG"),
          fatG: mealMetric(groupLogs, "fatG"),
        },
      },
    ];
  });

  return {
    sourceStatus: "OK",
    status: nutritionStatus(logs),
    meals,
    totals: {
      calories: mealMetric(logs, "calories"),
      proteinG: mealMetric(logs, "proteinG"),
      carbsG: mealMetric(logs, "carbsG"),
      fatG: mealMetric(logs, "fatG"),
    },
  };
}

export function normalizeWater(
  source: SourceResult<WaterLog[]>,
  goalSource: SourceResult<{ dailyWaterGoalMl: number } | null>,
  isToday: boolean,
): DailyWater {
  if (source.status === "UNAVAILABLE") {
    return {
      sourceStatus: "UNAVAILABLE",
      status: "UNAVAILABLE",
      totalMl: unavailableNumber(),
      currentGoalMl: goalSource.status === "UNAVAILABLE" ? unavailableNumber() : unknownNumber(),
      historicalGoalComparisonAvailable: false,
      logs: [],
    };
  }

  const logs = source.value;
  let currentGoalMl: ObservedNumber = unknownNumber();
  if (isToday) {
    if (goalSource.status === "UNAVAILABLE") currentGoalMl = unavailableNumber();
    else if (goalSource.value) currentGoalMl = knownNumber(goalSource.value.dailyWaterGoalMl);
  }

  return {
    sourceStatus: "OK",
    status: logs.length > 0 ? "RECORDED" : "NONE",
    totalMl:
      logs.length > 0
        ? knownNumber(logs.reduce((sum, log) => sum + log.amountMl, 0))
        : noRecordNumber(),
    currentGoalMl,
    historicalGoalComparisonAvailable:
      isToday &&
      currentGoalMl.state !== "UNAVAILABLE" &&
      currentGoalMl.state !== "UNKNOWN",
    logs: logs.map((log) => ({
      id: log.id,
      amountMl: log.amountMl,
      loggedAt: log.loggedAt.toISOString(),
    })),
  };
}

export function normalizeActivity(source: SourceResult<Activity[]>): DailyActivity {
  if (source.status === "UNAVAILABLE") {
    return {
      sourceStatus: "UNAVAILABLE",
      status: "UNAVAILABLE",
      entries: [],
      totalActiveMinutes: unavailableNumber(),
      totalDistanceKm: unavailableNumber(),
      totalCaloriesBurned: unavailableNumber(),
    };
  }

  const entries = source.value;
  if (entries.length === 0) {
    return {
      sourceStatus: "OK",
      status: "NONE",
      entries: [],
      totalActiveMinutes: noRecordNumber(),
      totalDistanceKm: noRecordNumber(),
      totalCaloriesBurned: noRecordNumber(),
    };
  }

  return {
    sourceStatus: "OK",
    status: "RECORDED",
    entries: entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      name: entry.name,
      durationMinutes: entry.durationMinutes,
      distanceKm: entry.distanceKm,
      perceivedIntensity: entry.perceivedIntensity,
      caloriesBurned: entry.caloriesBurned,
      loggedAt: entry.loggedAt.toISOString(),
    })),
    totalActiveMinutes: knownNumber(
      entries.reduce((sum, entry) => sum + entry.durationMinutes, 0),
    ),
    totalDistanceKm: aggregateOptionalNumbers(
      entries.map((entry) => entry.distanceKm),
      true,
    ),
    totalCaloriesBurned: aggregateOptionalNumbers(
      entries.map((entry) => entry.caloriesBurned),
      true,
    ),
  };
}

export function normalizeSleep(source: SourceResult<SleepLogRecord[]>): DailySleep {
  if (source.status === "UNAVAILABLE") {
    return {
      sourceStatus: "UNAVAILABLE",
      status: "UNAVAILABLE",
      entries: [],
      totalDurationMinutes: unavailableNumber(),
      averageQuality: unavailableNumber(),
    };
  }

  const entries = source.value;
  if (entries.length === 0) {
    return {
      sourceStatus: "OK",
      status: "NONE",
      entries: [],
      totalDurationMinutes: noRecordNumber(),
      averageQuality: noRecordNumber(),
    };
  }

  return {
    sourceStatus: "OK",
    status: "RECORDED",
    entries: entries.map((entry) => ({
      id: entry.id,
      sleepStart: entry.sleepStart.toISOString(),
      wakeTime: entry.wakeTime.toISOString(),
      durationMinutes: entry.durationMinutes,
      quality: entry.quality,
    })),
    totalDurationMinutes: knownNumber(
      entries.reduce((sum, entry) => sum + entry.durationMinutes, 0),
    ),
    averageQuality: averageKnownNumbers(entries.map((entry) => entry.quality)),
  };
}

export function normalizeWeight(source: SourceResult<WeightLog[]>): DailyWeight {
  if (source.status === "UNAVAILABLE") {
    return { sourceStatus: "UNAVAILABLE", status: "UNAVAILABLE", measurement: null };
  }
  if (source.value.length === 0) {
    return { sourceStatus: "OK", status: "NONE", measurement: null };
  }
  const latest = source.value[source.value.length - 1];
  return {
    sourceStatus: "OK",
    status: "RECORDED",
    measurement: {
      id: latest.id,
      weightKg: latest.weightKg,
      loggedAt: latest.loggedAt.toISOString(),
    },
  };
}

export function buildTimeline(snapshot: DailyHistorySourceSnapshot): HistoryTimelineEvent[] {
  const events: HistoryTimelineEvent[] = [];

  if (snapshot.meals.status === "OK") {
    for (const log of snapshot.meals.value) {
      events.push({
        id: `meal:${log.id}`,
        type: "MEAL",
        timestamp: log.loggedAt.toISOString(),
        sourceId: log.id,
        payload: {
          mealType: log.mealType,
          name: log.name,
          nutritionKnown: !isBareMealCheckIn(log),
        },
      });
    }
  }

  if (snapshot.water.status === "OK") {
    for (const log of snapshot.water.value) {
      events.push({
        id: `water:${log.id}`,
        type: "WATER",
        timestamp: log.loggedAt.toISOString(),
        sourceId: log.id,
        payload: { amountMl: log.amountMl },
      });
    }
  }

  if (snapshot.activities.status === "OK") {
    for (const entry of snapshot.activities.value) {
      events.push({
        id: `activity:${entry.id}`,
        type: "ACTIVITY",
        timestamp: entry.loggedAt.toISOString(),
        sourceId: entry.id,
        payload: {
          type: entry.type,
          name: entry.name,
          durationMinutes: entry.durationMinutes,
        },
      });
    }
  }

  if (snapshot.sleep.status === "OK") {
    for (const entry of snapshot.sleep.value) {
      events.push({
        id: `sleep:${entry.id}`,
        type: "SLEEP",
        timestamp: entry.wakeTime.toISOString(),
        sourceId: entry.id,
        payload: {
          sleepStart: entry.sleepStart.toISOString(),
          wakeTime: entry.wakeTime.toISOString(),
          durationMinutes: entry.durationMinutes,
          quality: entry.quality,
        },
      });
    }
  }

  if (snapshot.weights.status === "OK") {
    for (const log of snapshot.weights.value) {
      events.push({
        id: `weight:${log.id}`,
        type: "WEIGHT",
        timestamp: log.loggedAt.toISOString(),
        sourceId: log.id,
        payload: { weightKg: log.weightKg },
      });
    }
  }

  return events.sort((left, right) => {
    const timestampDifference =
      new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();
    if (timestampDifference !== 0) return timestampDifference;
    const priorityDifference = EVENT_PRIORITY[left.type] - EVENT_PRIORITY[right.type];
    if (priorityDifference !== 0) return priorityDifference;
    return left.sourceId.localeCompare(right.sourceId);
  });
}

function buildCompleteness(
  snapshot: DailyHistorySourceSnapshot,
  nutrition: DailyNutrition,
  water: DailyWater,
  activity: DailyActivity,
  sleep: DailySleep,
  weight: DailyWeight,
): DailyCompleteness {
  const mealLogs = snapshot.meals.status === "OK" ? snapshot.meals.value : [];
  const nutritionRows = mealLogs.filter((log) => !isBareMealCheckIn(log));
  return {
    nutrition: {
      status: nutrition.status,
      mealTypesRecorded: Array.from(new Set(mealLogs.map((log) => log.mealType))),
      nutritionBearingEntries: nutritionRows.length,
      entriesWithUnknownCoreNutrition: nutritionRows.filter(
        (log) =>
          log.calories === null ||
          log.proteinG === null ||
          log.carbsG === null ||
          log.fatG === null,
      ).length,
    },
    water: { status: water.status },
    activity: { status: activity.status },
    sleep: { status: sleep.status },
    weight: {
      status: weight.status,
      measurementCount: snapshot.weights.status === "OK" ? snapshot.weights.value.length : 0,
    },
  };
}

export function buildDailyHistory(
  input: {
    date: string;
    timezone: string;
    fromUtc: Date;
    toUtcExclusive: Date;
    isToday: boolean;
    generatedAt: Date;
  },
  snapshot: DailyHistorySourceSnapshot,
): DailyHistoryResponse {
  const nutrition = normalizeNutrition(snapshot.meals);
  const water = normalizeWater(snapshot.water, snapshot.waterGoal, input.isToday);
  const activity = normalizeActivity(snapshot.activities);
  const sleep = normalizeSleep(snapshot.sleep);
  const weight = normalizeWeight(snapshot.weights);

  const unavailableSources: HistorySource[] = [];
  if (snapshot.meals.status === "UNAVAILABLE") unavailableSources.push("nutrition");
  if (snapshot.water.status === "UNAVAILABLE") unavailableSources.push("water");
  if (snapshot.activities.status === "UNAVAILABLE") unavailableSources.push("activity");
  if (snapshot.sleep.status === "UNAVAILABLE") unavailableSources.push("sleep");
  if (snapshot.weights.status === "UNAVAILABLE") unavailableSources.push("weight");

  return {
    date: input.date,
    timezone: input.timezone,
    period: {
      localStartDate: input.date,
      localEndDateExclusive: addCalendarDays(input.date, 1),
      fromUtc: input.fromUtc.toISOString(),
      toUtcExclusive: input.toUtcExclusive.toISOString(),
      days: 1,
    },
    nutrition,
    water,
    activity,
    sleep,
    weight,
    timeline: buildTimeline(snapshot),
    completeness: buildCompleteness(snapshot, nutrition, water, activity, sleep, weight),
    meta: {
      partialResponse: unavailableSources.length > 0 || snapshot.waterGoal.status === "UNAVAILABLE",
      unavailableSources,
      generatedAt: input.generatedAt.toISOString(),
    },
  };
}

function settled<T>(result: PromiseSettledResult<T>): SourceResult<T> {
  return result.status === "fulfilled"
    ? { status: "OK", value: result.value }
    : { status: "UNAVAILABLE", value: null };
}

export const historyService = {
  async getDay(
    userId: string,
    date: string,
    timezone: string | undefined,
    now = new Date(),
  ): Promise<DailyHistoryResponse> {
    const range = resolveHistoryDayRange(date, timezone, now);

    const [meals, water, activities, sleep, weights, waterGoal] = await Promise.allSettled([
      trackingRepository.listMealLogsRange(userId, range.fromUtc, range.toUtcExclusive),
      trackingRepository.listWaterLogsRange(userId, range.fromUtc, range.toUtcExclusive),
      activityRepository.listActivitiesRange(userId, range.fromUtc, range.toUtcExclusive),
      sleepRepository.listRange(userId, range.fromUtc, range.toUtcExclusive),
      trackingRepository.listWeightLogsRange(userId, range.fromUtc, range.toUtcExclusive),
      historyRepository.getCurrentWaterGoal(userId),
    ]);

    const snapshot: DailyHistorySourceSnapshot = {
      meals: settled(meals),
      water: settled(water),
      activities: settled(activities),
      sleep: settled(sleep),
      weights: settled(weights),
      waterGoal: settled(waterGoal),
    };

    const failedMainSources = [
      snapshot.meals,
      snapshot.water,
      snapshot.activities,
      snapshot.sleep,
      snapshot.weights,
    ].filter((source) => source.status === "UNAVAILABLE").length;

    if (failedMainSources === 5) {
      throw new ApiError(503, "History data sources are temporarily unavailable.", {
        code: "HISTORY_SOURCES_UNAVAILABLE",
      });
    }

    return buildDailyHistory(
      {
        date: range.date,
        timezone: range.timezone,
        fromUtc: range.fromUtc,
        toUtcExclusive: range.toUtcExclusive,
        isToday: range.date === dateKeyInTimezone(now, range.timezone),
        generatedAt: now,
      },
      snapshot,
    );
  },
};
