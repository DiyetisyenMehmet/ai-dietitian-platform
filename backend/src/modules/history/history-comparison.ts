import type { Activity, MealLog, WaterLog, WeightLog } from "@prisma/client";

import { ApiError } from "../../utils/api-error";
import { activityRepository } from "../activity/activity.repository";
import { sleepRepository, type SleepLogRecord } from "../sleep/sleep.repository";
import { trackingRepository } from "../tracking/tracking.repository";
import {
  addCalendarDays,
  canonicalizeHistoryTimezone,
  dateKeyInTimezone,
  localDateTimeToUtc,
  parseHistoryDate,
  resolveHistoryDayRange,
} from "./history-time";
import {
  normalizeActivity,
  normalizeNutrition,
  normalizeSleep,
  normalizeWater,
  type SourceResult,
} from "./history.service";
import type {
  HistoryComparisonMode,
  HistoryComparisonResponse,
  HistoryPeriodType,
  HistorySource,
  MetricComparison,
  ObservedNumber,
  PeriodCategoryCompleteness,
  PeriodCompleteness,
  ResolvedHistoryPeriod,
} from "./history.types";

interface ComparisonPeriods {
  periodType: HistoryPeriodType;
  timezone: string;
  comparisonMode: HistoryComparisonMode;
  currentPeriod: ResolvedHistoryPeriod;
  previousPeriod: ResolvedHistoryPeriod;
}

interface PeriodRows {
  meals: SourceResult<MealLog[]>;
  water: SourceResult<WaterLog[]>;
  activities: SourceResult<Activity[]>;
  sleep: SourceResult<SleepLogRecord[]>;
  weights: SourceResult<WeightLog[]>;
}

interface PeriodMetricValues {
  nutrition: {
    averageCaloriesPerQuantifiedDay: ObservedNumber;
    averageProteinGPerQuantifiedDay: ObservedNumber;
    averageCarbsGPerQuantifiedDay: ObservedNumber;
    averageFatGPerQuantifiedDay: ObservedNumber;
    mealOccurrenceCount: ObservedNumber;
  };
  water: {
    totalMl: ObservedNumber;
    averageMlPerRecordedDay: ObservedNumber;
    recordedDays: ObservedNumber;
  };
  activity: {
    totalActiveMinutes: ObservedNumber;
    averageActiveMinutesPerRecordedDay: ObservedNumber;
    activityCount: ObservedNumber;
    totalDistanceKm: ObservedNumber;
    totalCaloriesBurned: ObservedNumber;
  };
  sleep: {
    recordedNights: ObservedNumber;
    totalDurationMinutes: ObservedNumber;
    averageDurationPerRecordedNight: ObservedNumber;
    averageQuality: ObservedNumber;
  };
  weight: {
    measurementCount: ObservedNumber;
    firstMeasurementKg: ObservedNumber;
    lastMeasurementKg: ObservedNumber;
    netChangeKg: ObservedNumber;
  };
}

function dateFromParts(parts: { year: number; month: number; day: number }): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function startOfWeek(date: string): string {
  const parts = parseHistoryDate(date);
  const value = dateFromParts(parts);
  const day = value.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  value.setUTCDate(value.getUTCDate() - daysSinceMonday);
  return dateKey(value);
}

function startOfMonth(date: string): string {
  const parts = parseHistoryDate(date);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-01`;
}

function shiftMonth(date: string, offset: number): string {
  const parts = parseHistoryDate(startOfMonth(date));
  const value = new Date(Date.UTC(parts.year, parts.month - 1 + offset, 1));
  return dateKey(value);
}

function daysInMonth(date: string): number {
  const parts = parseHistoryDate(startOfMonth(date));
  return new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
}

function enumerateDates(start: string, endExclusive: string): string[] {
  const dates: string[] = [];
  for (let cursor = start; cursor < endExclusive; cursor = addCalendarDays(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
}

function resolvePeriod(
  localStartDate: string,
  localEndDateExclusive: string,
  timezone: string,
): ResolvedHistoryPeriod {
  const zone = canonicalizeHistoryTimezone(timezone);
  const start = parseHistoryDate(localStartDate);
  const end = parseHistoryDate(localEndDateExclusive);
  const dates = enumerateDates(localStartDate, localEndDateExclusive);
  if (dates.length === 0) {
    throw ApiError.internal("History comparison resolved an empty period.");
  }
  return {
    localStartDate,
    localEndDateInclusive: dates[dates.length - 1],
    localEndDateExclusive,
    fromUtc: localDateTimeToUtc(start, zone).toISOString(),
    toUtcExclusive: localDateTimeToUtc(end, zone).toISOString(),
    days: dates.length,
  };
}

export function resolveHistoryComparisonPeriods(
  periodType: HistoryPeriodType,
  referenceDate: string,
  timezone: string | undefined,
  now = new Date(),
): ComparisonPeriods {
  const validated = resolveHistoryDayRange(referenceDate, timezone, now);
  const zone = validated.timezone;
  const today = dateKeyInTimezone(now, zone);

  if (periodType === "WEEK") {
    const currentWeekStart = startOfWeek(referenceDate);
    const todayWeekStart = startOfWeek(today);
    const isCurrentWeek = currentWeekStart === todayWeekStart;

    const currentEndExclusive = isCurrentWeek
      ? addCalendarDays(referenceDate, 1)
      : addCalendarDays(currentWeekStart, 7);
    const comparisonDays = enumerateDates(currentWeekStart, currentEndExclusive).length;

    const previousStart = addCalendarDays(currentWeekStart, -7);
    const previousEndExclusive = addCalendarDays(previousStart, comparisonDays);

    return {
      periodType,
      timezone: zone,
      comparisonMode: isCurrentWeek ? "EQUAL_ELAPSED_DAYS" : "FULL_PERIODS",
      currentPeriod: resolvePeriod(currentWeekStart, currentEndExclusive, zone),
      previousPeriod: resolvePeriod(previousStart, previousEndExclusive, zone),
    };
  }

  const currentMonthStart = startOfMonth(referenceDate);
  const todayMonthStart = startOfMonth(today);
  const previousMonthStart = shiftMonth(currentMonthStart, -1);

  if (currentMonthStart === todayMonthStart) {
    const requestedDay = parseHistoryDate(referenceDate).day;
    const previousMonthDays = daysInMonth(previousMonthStart);
    const comparisonDays = Math.min(requestedDay, previousMonthDays);
    const clamped = comparisonDays !== requestedDay;
    const currentEndExclusive = addCalendarDays(currentMonthStart, comparisonDays);
    const previousEndExclusive = addCalendarDays(previousMonthStart, comparisonDays);

    return {
      periodType,
      timezone: zone,
      comparisonMode: clamped ? "EQUAL_ELAPSED_DAYS_CLAMPED" : "EQUAL_ELAPSED_DAYS",
      currentPeriod: resolvePeriod(currentMonthStart, currentEndExclusive, zone),
      previousPeriod: resolvePeriod(previousMonthStart, previousEndExclusive, zone),
    };
  }

  return {
    periodType,
    timezone: zone,
    comparisonMode: "FULL_CALENDAR_MONTHS",
    currentPeriod: resolvePeriod(currentMonthStart, shiftMonth(currentMonthStart, 1), zone),
    previousPeriod: resolvePeriod(previousMonthStart, currentMonthStart, zone),
  };
}

function unavailable(): ObservedNumber {
  return { state: "UNAVAILABLE", value: null };
}

function noRecord(): ObservedNumber {
  return { state: "NO_RECORD", value: null };
}

function unknown(): ObservedNumber {
  return { state: "UNKNOWN", value: null };
}

function known(value: number): ObservedNumber {
  return { state: value === 0 ? "KNOWN_ZERO" : "KNOWN_VALUE", value };
}

function numericObservation(value: ObservedNumber): value is ObservedNumber & { value: number } {
  return value.value !== null && value.state !== "UNAVAILABLE" && value.state !== "UNKNOWN" && value.state !== "NO_RECORD";
}

function combineObserved(values: ObservedNumber[], divisor?: number): ObservedNumber {
  const numeric = values.filter(numericObservation);
  if (values.some((value) => value.state === "UNAVAILABLE")) return unavailable();
  if (numeric.length === 0) {
    return values.some((value) => value.state === "UNKNOWN") ? unknown() : noRecord();
  }
  const total = numeric.reduce((sum, value) => sum + value.value, 0);
  const result = divisor && divisor > 0 ? total / divisor : total;
  const partial =
    numeric.length !== values.filter((value) => value.state !== "NO_RECORD").length ||
    numeric.some((value) => value.state === "PARTIAL_VALUE");
  return partial ? { state: "PARTIAL_VALUE", value: result } : known(result);
}

function categoryCompleteness(
  sourceStatus: "OK" | "UNAVAILABLE",
  recordedDays: number,
  quantifiedDays: number,
  expectedDays: number,
): PeriodCategoryCompleteness {
  if (sourceStatus === "UNAVAILABLE") {
    return {
      recordedDays: 0,
      quantifiedDays: 0,
      expectedDays,
      coverageRatio: null,
      status: "UNAVAILABLE",
    };
  }
  const status =
    recordedDays === 0
      ? "NONE"
      : recordedDays >= expectedDays
        ? "COMPLETE"
        : "PARTIAL";
  return {
    recordedDays,
    quantifiedDays,
    expectedDays,
    coverageRatio: expectedDays > 0 ? recordedDays / expectedDays : null,
    status,
  };
}

function dailyDates(period: ResolvedHistoryPeriod): string[] {
  return enumerateDates(period.localStartDate, period.localEndDateExclusive);
}

function groupByDate<T>(
  rows: T[],
  timezone: string,
  timestamp: (row: T) => Date,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = dateKeyInTimezone(timestamp(row), timezone);
    const values = map.get(key) ?? [];
    values.push(row);
    map.set(key, values);
  }
  return map;
}

function periodMetrics(
  rows: PeriodRows,
  period: ResolvedHistoryPeriod,
  timezone: string,
): { values: PeriodMetricValues; completeness: PeriodCompleteness } {
  const dates = dailyDates(period);

  const mealMap =
    rows.meals.status === "OK"
      ? groupByDate(rows.meals.value, timezone, (row) => row.loggedAt)
      : new Map<string, MealLog[]>();
  const waterMap =
    rows.water.status === "OK"
      ? groupByDate(rows.water.value, timezone, (row) => row.loggedAt)
      : new Map<string, WaterLog[]>();
  const activityMap =
    rows.activities.status === "OK"
      ? groupByDate(rows.activities.value, timezone, (row) => row.loggedAt)
      : new Map<string, Activity[]>();
  const sleepMap =
    rows.sleep.status === "OK"
      ? groupByDate(rows.sleep.value, timezone, (row) => row.wakeTime)
      : new Map<string, SleepLogRecord[]>();

  const nutritionDays = dates.map((date) =>
    normalizeNutrition(
      rows.meals.status === "OK"
        ? { status: "OK", value: mealMap.get(date) ?? [] }
        : { status: "UNAVAILABLE", value: null },
    ),
  );
  const waterDays = dates.map((date) =>
    normalizeWater(
      rows.water.status === "OK"
        ? { status: "OK", value: waterMap.get(date) ?? [] }
        : { status: "UNAVAILABLE", value: null },
      { status: "OK", value: null },
      false,
    ),
  );
  const activityDays = dates.map((date) =>
    normalizeActivity(
      rows.activities.status === "OK"
        ? { status: "OK", value: activityMap.get(date) ?? [] }
        : { status: "UNAVAILABLE", value: null },
    ),
  );
  const sleepDays = dates.map((date) =>
    normalizeSleep(
      rows.sleep.status === "OK"
        ? { status: "OK", value: sleepMap.get(date) ?? [] }
        : { status: "UNAVAILABLE", value: null },
    ),
  );

  const nutritionRecorded = nutritionDays.filter(
    (day) => day.status === "RECORDED" || day.status === "PARTIAL",
  ).length;
  const nutritionQuantified = nutritionDays.filter((day) =>
    [
      day.totals.calories,
      day.totals.proteinG,
      day.totals.carbsG,
      day.totals.fatG,
    ].some(numericObservation),
  ).length;

  const waterRecorded = waterDays.filter((day) => day.status === "RECORDED").length;
  const activityRecorded = activityDays.filter((day) => day.status === "RECORDED").length;
  const sleepRecorded = sleepDays.filter((day) => day.status === "RECORDED").length;

  const averageNutrition = (
    key: "calories" | "proteinG" | "carbsG" | "fatG",
  ): ObservedNumber => {
    const observed = nutritionDays.map((day) => day.totals[key]);
    const numericDays = observed.filter(numericObservation).length;
    if (numericDays === 0) {
      if (rows.meals.status === "UNAVAILABLE") return unavailable();
      return nutritionRecorded > 0 ? unknown() : noRecord();
    }
    return combineObserved(observed, numericDays);
  };

  const waterTotals = waterDays.map((day) => day.totalMl);
  const totalWater = combineObserved(waterTotals);
  const averageWater =
    waterRecorded > 0 && numericObservation(totalWater)
      ? totalWater.state === "PARTIAL_VALUE"
        ? { state: "PARTIAL_VALUE" as const, value: totalWater.value / waterRecorded }
        : known(totalWater.value / waterRecorded)
      : rows.water.status === "UNAVAILABLE"
        ? unavailable()
        : noRecord();

  const activeTotals = activityDays.map((day) => day.totalActiveMinutes);
  const totalActiveMinutes = combineObserved(activeTotals);
  const averageActiveMinutes =
    activityRecorded > 0 && numericObservation(totalActiveMinutes)
      ? totalActiveMinutes.state === "PARTIAL_VALUE"
        ? { state: "PARTIAL_VALUE" as const, value: totalActiveMinutes.value / activityRecorded }
        : known(totalActiveMinutes.value / activityRecorded)
      : rows.activities.status === "UNAVAILABLE"
        ? unavailable()
        : noRecord();

  const distanceTotals = activityDays.map((day) => day.totalDistanceKm);
  const calorieTotals = activityDays.map((day) => day.totalCaloriesBurned);

  const sleepEntries = rows.sleep.status === "OK" ? rows.sleep.value : [];
  const totalSleep =
    rows.sleep.status === "UNAVAILABLE"
      ? unavailable()
      : sleepEntries.length === 0
        ? noRecord()
        : known(sleepEntries.reduce((sum, entry) => sum + entry.durationMinutes, 0));
  const averageSleep =
    sleepEntries.length > 0 && numericObservation(totalSleep)
      ? known(totalSleep.value / sleepEntries.length)
      : rows.sleep.status === "UNAVAILABLE"
        ? unavailable()
        : noRecord();
  const averageQuality =
    rows.sleep.status === "UNAVAILABLE"
      ? unavailable()
      : sleepEntries.length === 0
        ? noRecord()
        : known(
            sleepEntries.reduce((sum, entry) => sum + entry.quality, 0) /
              sleepEntries.length,
          );

  const weights = rows.weights.status === "OK" ? rows.weights.value : [];
  const firstWeight = weights[0];
  const lastWeight = weights[weights.length - 1];

  return {
    values: {
      nutrition: {
        averageCaloriesPerQuantifiedDay: averageNutrition("calories"),
        averageProteinGPerQuantifiedDay: averageNutrition("proteinG"),
        averageCarbsGPerQuantifiedDay: averageNutrition("carbsG"),
        averageFatGPerQuantifiedDay: averageNutrition("fatG"),
        mealOccurrenceCount:
          rows.meals.status === "UNAVAILABLE"
            ? unavailable()
            : known(nutritionDays.reduce((sum, day) => sum + day.meals.length, 0)),
      },
      water: {
        totalMl: totalWater,
        averageMlPerRecordedDay: averageWater,
        recordedDays:
          rows.water.status === "UNAVAILABLE" ? unavailable() : known(waterRecorded),
      },
      activity: {
        totalActiveMinutes,
        averageActiveMinutesPerRecordedDay: averageActiveMinutes,
        activityCount:
          rows.activities.status === "UNAVAILABLE"
            ? unavailable()
            : known(rows.activities.value.length),
        totalDistanceKm: combineObserved(distanceTotals),
        totalCaloriesBurned: combineObserved(calorieTotals),
      },
      sleep: {
        recordedNights:
          rows.sleep.status === "UNAVAILABLE" ? unavailable() : known(sleepEntries.length),
        totalDurationMinutes: totalSleep,
        averageDurationPerRecordedNight: averageSleep,
        averageQuality,
      },
      weight: {
        measurementCount:
          rows.weights.status === "UNAVAILABLE" ? unavailable() : known(weights.length),
        firstMeasurementKg:
          rows.weights.status === "UNAVAILABLE"
            ? unavailable()
            : firstWeight
              ? known(firstWeight.weightKg)
              : noRecord(),
        lastMeasurementKg:
          rows.weights.status === "UNAVAILABLE"
            ? unavailable()
            : lastWeight
              ? known(lastWeight.weightKg)
              : noRecord(),
        netChangeKg:
          rows.weights.status === "UNAVAILABLE"
            ? unavailable()
            : weights.length >= 2
              ? known(lastWeight.weightKg - firstWeight.weightKg)
              : weights.length === 1
                ? unknown()
                : noRecord(),
      },
    },
    completeness: {
      nutrition: categoryCompleteness(
        rows.meals.status,
        nutritionRecorded,
        nutritionQuantified,
        period.days,
      ),
      water: categoryCompleteness(rows.water.status, waterRecorded, waterRecorded, period.days),
      activity: categoryCompleteness(
        rows.activities.status,
        activityRecorded,
        activityRecorded,
        period.days,
      ),
      sleep: categoryCompleteness(rows.sleep.status, sleepRecorded, sleepRecorded, period.days),
      weight: {
        sourceStatus: rows.weights.status,
        measurementCount: rows.weights.status === "OK" ? weights.length : 0,
      },
    },
  };
}

function isFullCoverage(
  category: PeriodCategoryCompleteness | null,
  current: ObservedNumber,
  previous: ObservedNumber,
): boolean {
  if (current.state === "PARTIAL_VALUE" || previous.state === "PARTIAL_VALUE") return false;
  if (!category) return true;
  return category.status === "COMPLETE";
}

export function compareObserved(
  current: ObservedNumber,
  previous: ObservedNumber,
  currentCompleteness: PeriodCategoryCompleteness | null,
  previousCompleteness: PeriodCategoryCompleteness | null,
): MetricComparison {
  if (!numericObservation(current) || !numericObservation(previous)) {
    return {
      current,
      previous,
      absoluteChange: null,
      percentageChange: null,
      direction: "UNAVAILABLE",
      comparisonAvailable: false,
      quality: "NONE",
    };
  }

  const absoluteChange = current.value - previous.value;
  const percentageChange =
    previous.value === 0 ? null : (absoluteChange / Math.abs(previous.value)) * 100;
  const direction =
    Math.abs(absoluteChange) < 1e-9 ? "UNCHANGED" : absoluteChange > 0 ? "UP" : "DOWN";
  const full =
    isFullCoverage(currentCompleteness, current, previous) &&
    isFullCoverage(previousCompleteness, current, previous);

  return {
    current,
    previous,
    absoluteChange: Number.isFinite(absoluteChange) ? absoluteChange : null,
    percentageChange:
      percentageChange !== null && Number.isFinite(percentageChange)
        ? percentageChange
        : null,
    direction,
    comparisonAvailable: true,
    quality: full ? "FULL" : "LIMITED",
  };
}

function compareMetricSets(
  current: PeriodMetricValues,
  previous: PeriodMetricValues,
  completeness: { current: PeriodCompleteness; previous: PeriodCompleteness },
): HistoryComparisonResponse["metrics"] {
  const n = (key: keyof PeriodMetricValues["nutrition"]) =>
    compareObserved(
      current.nutrition[key],
      previous.nutrition[key],
      completeness.current.nutrition,
      completeness.previous.nutrition,
    );
  const w = (key: keyof PeriodMetricValues["water"]) =>
    compareObserved(
      current.water[key],
      previous.water[key],
      completeness.current.water,
      completeness.previous.water,
    );
  const a = (key: keyof PeriodMetricValues["activity"]) =>
    compareObserved(
      current.activity[key],
      previous.activity[key],
      completeness.current.activity,
      completeness.previous.activity,
    );
  const s = (key: keyof PeriodMetricValues["sleep"]) =>
    compareObserved(
      current.sleep[key],
      previous.sleep[key],
      completeness.current.sleep,
      completeness.previous.sleep,
    );
  const weight = (key: keyof PeriodMetricValues["weight"]) =>
    compareObserved(current.weight[key], previous.weight[key], null, null);

  return {
    nutrition: {
      averageCaloriesPerQuantifiedDay: n("averageCaloriesPerQuantifiedDay"),
      averageProteinGPerQuantifiedDay: n("averageProteinGPerQuantifiedDay"),
      averageCarbsGPerQuantifiedDay: n("averageCarbsGPerQuantifiedDay"),
      averageFatGPerQuantifiedDay: n("averageFatGPerQuantifiedDay"),
      mealOccurrenceCount: n("mealOccurrenceCount"),
    },
    water: {
      totalMl: w("totalMl"),
      averageMlPerRecordedDay: w("averageMlPerRecordedDay"),
      recordedDays: w("recordedDays"),
    },
    activity: {
      totalActiveMinutes: a("totalActiveMinutes"),
      averageActiveMinutesPerRecordedDay: a("averageActiveMinutesPerRecordedDay"),
      activityCount: a("activityCount"),
      totalDistanceKm: a("totalDistanceKm"),
      totalCaloriesBurned: a("totalCaloriesBurned"),
    },
    sleep: {
      recordedNights: s("recordedNights"),
      totalDurationMinutes: s("totalDurationMinutes"),
      averageDurationPerRecordedNight: s("averageDurationPerRecordedNight"),
      averageQuality: s("averageQuality"),
    },
    weight: {
      measurementCount: weight("measurementCount"),
      firstMeasurementKg: weight("firstMeasurementKg"),
      lastMeasurementKg: weight("lastMeasurementKg"),
      netChangeKg: weight("netChangeKg"),
    },
  };
}

function settled<T>(result: PromiseSettledResult<T>): SourceResult<T> {
  return result.status === "fulfilled"
    ? { status: "OK", value: result.value }
    : { status: "UNAVAILABLE", value: null };
}

function filterPeriod<T>(
  source: SourceResult<T[]>,
  period: ResolvedHistoryPeriod,
  timestamp: (row: T) => Date,
): SourceResult<T[]> {
  if (source.status === "UNAVAILABLE") return source;
  const from = new Date(period.fromUtc).getTime();
  const to = new Date(period.toUtcExclusive).getTime();
  return {
    status: "OK",
    value: source.value.filter((row) => {
      const value = timestamp(row).getTime();
      return value >= from && value < to;
    }),
  };
}

function partitionRows(source: PeriodRows, period: ResolvedHistoryPeriod): PeriodRows {
  return {
    meals: filterPeriod(source.meals, period, (row) => row.loggedAt),
    water: filterPeriod(source.water, period, (row) => row.loggedAt),
    activities: filterPeriod(source.activities, period, (row) => row.loggedAt),
    sleep: filterPeriod(source.sleep, period, (row) => row.wakeTime),
    weights: filterPeriod(source.weights, period, (row) => row.loggedAt),
  };
}

export const historyComparisonService = {
  async getComparison(
    userId: string,
    periodType: HistoryPeriodType,
    referenceDate: string,
    timezone: string | undefined,
    now = new Date(),
  ): Promise<HistoryComparisonResponse> {
    const periods = resolveHistoryComparisonPeriods(periodType, referenceDate, timezone, now);
    const combinedFrom = new Date(periods.previousPeriod.fromUtc);
    const combinedTo = new Date(periods.currentPeriod.toUtcExclusive);

    const [meals, water, activities, sleep, weights] = await Promise.allSettled([
      trackingRepository.listMealLogsRange(userId, combinedFrom, combinedTo),
      trackingRepository.listWaterLogsRange(userId, combinedFrom, combinedTo),
      activityRepository.listActivitiesRange(userId, combinedFrom, combinedTo),
      sleepRepository.listRange(userId, combinedFrom, combinedTo),
      trackingRepository.listWeightLogsRange(userId, combinedFrom, combinedTo),
    ]);

    const allRows: PeriodRows = {
      meals: settled(meals),
      water: settled(water),
      activities: settled(activities),
      sleep: settled(sleep),
      weights: settled(weights),
    };

    const unavailableSources: HistorySource[] = [];
    if (allRows.meals.status === "UNAVAILABLE") unavailableSources.push("nutrition");
    if (allRows.water.status === "UNAVAILABLE") unavailableSources.push("water");
    if (allRows.activities.status === "UNAVAILABLE") unavailableSources.push("activity");
    if (allRows.sleep.status === "UNAVAILABLE") unavailableSources.push("sleep");
    if (allRows.weights.status === "UNAVAILABLE") unavailableSources.push("weight");

    if (unavailableSources.length === 5) {
      throw new ApiError(503, "History comparison sources are temporarily unavailable.", {
        code: "HISTORY_SOURCES_UNAVAILABLE",
      });
    }

    const current = periodMetrics(
      partitionRows(allRows, periods.currentPeriod),
      periods.currentPeriod,
      periods.timezone,
    );
    const previous = periodMetrics(
      partitionRows(allRows, periods.previousPeriod),
      periods.previousPeriod,
      periods.timezone,
    );
    const completeness = {
      current: current.completeness,
      previous: previous.completeness,
    };

    return {
      periodType,
      timezone: periods.timezone,
      comparisonMode: periods.comparisonMode,
      currentPeriod: periods.currentPeriod,
      previousPeriod: periods.previousPeriod,
      metrics: compareMetricSets(current.values, previous.values, completeness),
      completeness,
      meta: {
        partialResponse: unavailableSources.length > 0,
        unavailableSources,
        generatedAt: now.toISOString(),
      },
    };
  },
};
