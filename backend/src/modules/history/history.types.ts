import type { ActivityType, MealType } from "@prisma/client";

export type ObservedNumberState =
  | "NO_RECORD"
  | "UNKNOWN"
  | "PARTIAL_VALUE"
  | "KNOWN_ZERO"
  | "KNOWN_VALUE"
  | "UNAVAILABLE";

export interface ObservedNumber {
  state: ObservedNumberState;
  value: number | null;
}

export type HistoryCategoryStatus = "NONE" | "PARTIAL" | "RECORDED" | "UNAVAILABLE";
export type HistorySource = "nutrition" | "water" | "activity" | "sleep" | "weight";

export interface DailyMealItem {
  id: string;
  name: string | null;
  loggedAt: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

export interface DailyMealGroup {
  mealType: MealType;
  occurrenceRecorded: boolean;
  nutritionKnown: boolean;
  items: DailyMealItem[];
  totals: {
    calories: ObservedNumber;
    proteinG: ObservedNumber;
    carbsG: ObservedNumber;
    fatG: ObservedNumber;
  };
}

export interface DailyNutrition {
  sourceStatus: "OK" | "UNAVAILABLE";
  status: HistoryCategoryStatus;
  meals: DailyMealGroup[];
  totals: {
    calories: ObservedNumber;
    proteinG: ObservedNumber;
    carbsG: ObservedNumber;
    fatG: ObservedNumber;
  };
}

export interface DailyWater {
  sourceStatus: "OK" | "UNAVAILABLE";
  status: HistoryCategoryStatus;
  totalMl: ObservedNumber;
  currentGoalMl: ObservedNumber;
  historicalGoalComparisonAvailable: boolean;
  logs: Array<{ id: string; amountMl: number; loggedAt: string }>;
}

export interface DailyActivity {
  sourceStatus: "OK" | "UNAVAILABLE";
  status: HistoryCategoryStatus;
  entries: Array<{
    id: string;
    type: ActivityType;
    name: string | null;
    durationMinutes: number;
    distanceKm: number | null;
    perceivedIntensity: number | null;
    caloriesBurned: number | null;
    loggedAt: string;
  }>;
  totalActiveMinutes: ObservedNumber;
  totalDistanceKm: ObservedNumber;
  totalCaloriesBurned: ObservedNumber;
}

export interface DailySleep {
  sourceStatus: "OK" | "UNAVAILABLE";
  status: HistoryCategoryStatus;
  entries: Array<{
    id: string;
    sleepStart: string;
    wakeTime: string;
    durationMinutes: number;
    quality: number;
  }>;
  totalDurationMinutes: ObservedNumber;
  averageQuality: ObservedNumber;
}

export interface DailyWeight {
  sourceStatus: "OK" | "UNAVAILABLE";
  status: "NONE" | "RECORDED" | "UNAVAILABLE";
  measurement: { id: string; weightKg: number; loggedAt: string } | null;
}

export type HistoryTimelineEvent =
  | {
      id: string;
      type: "MEAL";
      timestamp: string;
      sourceId: string;
      payload: {
        mealType: MealType;
        name: string | null;
        nutritionKnown: boolean;
      };
    }
  | {
      id: string;
      type: "WATER";
      timestamp: string;
      sourceId: string;
      payload: { amountMl: number };
    }
  | {
      id: string;
      type: "ACTIVITY";
      timestamp: string;
      sourceId: string;
      payload: {
        type: ActivityType;
        name: string | null;
        durationMinutes: number;
      };
    }
  | {
      id: string;
      type: "SLEEP";
      timestamp: string;
      sourceId: string;
      payload: {
        sleepStart: string;
        wakeTime: string;
        durationMinutes: number;
        quality: number;
      };
    }
  | {
      id: string;
      type: "WEIGHT";
      timestamp: string;
      sourceId: string;
      payload: { weightKg: number };
    };

export interface DailyCompleteness {
  nutrition: {
    status: HistoryCategoryStatus;
    mealTypesRecorded: MealType[];
    nutritionBearingEntries: number;
    entriesWithUnknownCoreNutrition: number;
  };
  water: { status: HistoryCategoryStatus };
  activity: { status: HistoryCategoryStatus };
  sleep: { status: HistoryCategoryStatus };
  weight: { status: "NONE" | "RECORDED" | "UNAVAILABLE"; measurementCount: number };
}

export interface DailyHistoryResponse {
  date: string;
  timezone: string;
  period: {
    localStartDate: string;
    localEndDateExclusive: string;
    fromUtc: string;
    toUtcExclusive: string;
    days: 1;
  };
  nutrition: DailyNutrition;
  water: DailyWater;
  activity: DailyActivity;
  sleep: DailySleep;
  weight: DailyWeight;
  timeline: HistoryTimelineEvent[];
  completeness: DailyCompleteness;
  meta: {
    partialResponse: boolean;
    unavailableSources: HistorySource[];
    generatedAt: string;
  };
}


export type HistoryPeriodType = "WEEK" | "MONTH";
export type HistoryComparisonMode =
  | "FULL_PERIODS"
  | "FULL_CALENDAR_MONTHS"
  | "EQUAL_ELAPSED_DAYS"
  | "EQUAL_ELAPSED_DAYS_CLAMPED";

export type ComparisonDirection = "UP" | "DOWN" | "UNCHANGED" | "UNAVAILABLE";
export type ComparisonQuality = "FULL" | "LIMITED" | "NONE";

export interface MetricComparison {
  current: ObservedNumber;
  previous: ObservedNumber;
  absoluteChange: number | null;
  percentageChange: number | null;
  direction: ComparisonDirection;
  comparisonAvailable: boolean;
  quality: ComparisonQuality;
}

export interface PeriodCategoryCompleteness {
  recordedDays: number;
  quantifiedDays: number;
  expectedDays: number;
  coverageRatio: number | null;
  status: "NONE" | "PARTIAL" | "COMPLETE" | "UNAVAILABLE";
}

export interface PeriodCompleteness {
  nutrition: PeriodCategoryCompleteness;
  water: PeriodCategoryCompleteness;
  activity: PeriodCategoryCompleteness;
  sleep: PeriodCategoryCompleteness;
  weight: {
    sourceStatus: "OK" | "UNAVAILABLE";
    measurementCount: number;
  };
}

export interface ResolvedHistoryPeriod {
  localStartDate: string;
  localEndDateInclusive: string;
  localEndDateExclusive: string;
  fromUtc: string;
  toUtcExclusive: string;
  days: number;
}

export interface HistoryComparisonResponse {
  periodType: HistoryPeriodType;
  timezone: string;
  comparisonMode: HistoryComparisonMode;
  currentPeriod: ResolvedHistoryPeriod;
  previousPeriod: ResolvedHistoryPeriod;
  metrics: {
    nutrition: {
      averageCaloriesPerQuantifiedDay: MetricComparison;
      averageProteinGPerQuantifiedDay: MetricComparison;
      averageCarbsGPerQuantifiedDay: MetricComparison;
      averageFatGPerQuantifiedDay: MetricComparison;
      mealOccurrenceCount: MetricComparison;
    };
    water: {
      totalMl: MetricComparison;
      averageMlPerRecordedDay: MetricComparison;
      recordedDays: MetricComparison;
    };
    activity: {
      totalActiveMinutes: MetricComparison;
      averageActiveMinutesPerRecordedDay: MetricComparison;
      activityCount: MetricComparison;
      totalDistanceKm: MetricComparison;
      totalCaloriesBurned: MetricComparison;
    };
    sleep: {
      recordedNights: MetricComparison;
      totalDurationMinutes: MetricComparison;
      averageDurationPerRecordedNight: MetricComparison;
      averageQuality: MetricComparison;
    };
    weight: {
      measurementCount: MetricComparison;
      firstMeasurementKg: MetricComparison;
      lastMeasurementKg: MetricComparison;
      netChangeKg: MetricComparison;
    };
  };
  completeness: {
    current: PeriodCompleteness;
    previous: PeriodCompleteness;
  };
  meta: {
    partialResponse: boolean;
    unavailableSources: HistorySource[];
    generatedAt: string;
  };
}
