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
  nutrition: {
    sourceStatus: "OK" | "UNAVAILABLE";
    status: HistoryCategoryStatus;
    meals: Array<{
      mealType: "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
      occurrenceRecorded: boolean;
      nutritionKnown: boolean;
      items: Array<{
        id: string;
        name: string | null;
        loggedAt: string;
        calories: number | null;
        proteinG: number | null;
        carbsG: number | null;
        fatG: number | null;
      }>;
      totals: {
        calories: ObservedNumber;
        proteinG: ObservedNumber;
        carbsG: ObservedNumber;
        fatG: ObservedNumber;
      };
    }>;
    totals: {
      calories: ObservedNumber;
      proteinG: ObservedNumber;
      carbsG: ObservedNumber;
      fatG: ObservedNumber;
    };
  };
  water: {
    sourceStatus: "OK" | "UNAVAILABLE";
    status: HistoryCategoryStatus;
    totalMl: ObservedNumber;
    currentGoalMl: ObservedNumber;
    historicalGoalComparisonAvailable: boolean;
    logs: Array<{ id: string; amountMl: number; loggedAt: string }>;
  };
  activity: {
    sourceStatus: "OK" | "UNAVAILABLE";
    status: HistoryCategoryStatus;
    entries: Array<{
      id: string;
      type: string;
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
  };
  sleep: {
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
  };
  weight: {
    sourceStatus: "OK" | "UNAVAILABLE";
    status: "NONE" | "RECORDED" | "UNAVAILABLE";
    measurement: { id: string; weightKg: number; loggedAt: string } | null;
  };
  timeline: Array<
    | {
        id: string;
        type: "MEAL";
        timestamp: string;
        sourceId: string;
        payload: { mealType: string; name: string | null; nutritionKnown: boolean };
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
        payload: { type: string; name: string | null; durationMinutes: number };
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
      }
  >;
  completeness: {
    nutrition: {
      status: HistoryCategoryStatus;
      mealTypesRecorded: string[];
      nutritionBearingEntries: number;
      entriesWithUnknownCoreNutrition: number;
    };
    water: { status: HistoryCategoryStatus };
    activity: { status: HistoryCategoryStatus };
    sleep: { status: HistoryCategoryStatus };
    weight: {
      status: "NONE" | "RECORDED" | "UNAVAILABLE";
      measurementCount: number;
    };
  };
  meta: {
    partialResponse: boolean;
    unavailableSources: string[];
    generatedAt: string;
  };
}

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

export interface HistoryComparisonResponse {
  periodType: "WEEK" | "MONTH" | "CUSTOM";
  timezone: string;
  comparisonMode:
    | "FULL_PERIODS"
    | "FULL_CALENDAR_MONTHS"
    | "EQUAL_ELAPSED_DAYS"
    | "EQUAL_ELAPSED_DAYS_CLAMPED"
    | "CUSTOM_EQUAL_RANGES";
  currentPeriod: {
    localStartDate: string;
    localEndDateInclusive: string;
    localEndDateExclusive: string;
    fromUtc: string;
    toUtcExclusive: string;
    days: number;
  };
  previousPeriod: {
    localStartDate: string;
    localEndDateInclusive: string;
    localEndDateExclusive: string;
    fromUtc: string;
    toUtcExclusive: string;
    days: number;
  };
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
    current: {
      nutrition: PeriodCategoryCompleteness;
      water: PeriodCategoryCompleteness;
      activity: PeriodCategoryCompleteness;
      sleep: PeriodCategoryCompleteness;
      weight: { sourceStatus: "OK" | "UNAVAILABLE"; measurementCount: number };
    };
    previous: {
      nutrition: PeriodCategoryCompleteness;
      water: PeriodCategoryCompleteness;
      activity: PeriodCategoryCompleteness;
      sleep: PeriodCategoryCompleteness;
      weight: { sourceStatus: "OK" | "UNAVAILABLE"; measurementCount: number };
    };
  };
  meta: {
    partialResponse: boolean;
    unavailableSources: string[];
    generatedAt: string;
  };
}

export interface HistoryInsightResponse {
  scope: "DAY" | "WEEK" | "MONTH" | "CUSTOM";
  periodKey: string;
  timezone: string;
  content: { text: string };
  generatedBy: "AI" | "FALLBACK";
  cacheStatus: "HIT" | "MISS" | "BYPASS";
  provider: string | null;
  model: string | null;
  generatedAt: string;
}

export type HistoryMode = "DAY" | "WEEK" | "MONTH";
