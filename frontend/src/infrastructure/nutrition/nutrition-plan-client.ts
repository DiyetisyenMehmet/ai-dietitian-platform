import { apiRequest } from "@/infrastructure/api/http-client";

export const SUPPORTED_NUTRITION_PLAN_DURATIONS = [
  "SEVEN_DAY",
  "FOURTEEN_DAY",
  "THIRTY_DAY",
] as const;

export type SupportedNutritionPlanDuration = (typeof SUPPORTED_NUTRITION_PLAN_DURATIONS)[number];
/** SIXTY_DAY is retained only so historical API rows can still be read safely. */
export type NutritionPlanDuration = SupportedNutritionPlanDuration | "SIXTY_DAY";
export type NutritionPlanStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export type NutritionPlanDeviationScope = "FOOD" | "MEAL" | "DAY";
export type NutritionPlanDeviationType = "SKIPPED" | "REPLACED" | "EXTRA" | "PORTION_CHANGED";

export function isSupportedNutritionPlanDuration(
  value: NutritionPlanDuration,
): value is SupportedNutritionPlanDuration {
  return (SUPPORTED_NUTRITION_PLAN_DURATIONS as readonly string[]).includes(value);
}

export interface MealSlot {
  name: string;
  time: string;
  calorieShare: number;
}

export interface MealTimingRecommendation {
  mealsPerDay: number;
  slots: MealSlot[];
}

export interface PlannedFood {
  name: string;
  portion: string;
  calories: number;
}

export interface PlannedMeal {
  name: string;
  time: string;
  foods: PlannedFood[];
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  explanation: string;
}

export interface DailyPlan {
  dayLabel: string;
  meals: PlannedMeal[];
  totalCalories: number;
  totalProteinGrams: number;
  totalCarbsGrams: number;
  totalFatGrams: number;
  notes?: string;
}

export interface CalendarDay {
  dayNumber: number;
  cycleIndex: number;
}

export interface NutritionPlanContent {
  durationDays: number;
  cycleLengthDays: number;
  cycle: DailyPlan[];
  calendar: CalendarDay[];
}

export interface PlanExplanations {
  calories: string;
  macros: string;
  water: string;
  mealTiming: string;
  overall: string;
}

export interface NutritionPlanRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** Date-only value returned by the backend; optional during rolling deploy compatibility. */
  startDate?: string;
  deletedAt?: string | null;
  duration: NutritionPlanDuration;
  version: number;
  isActive: boolean;
  status: NutritionPlanStatus;
  bloodTestAnalysisId: string | null;
  bmr: number;
  tdee: number;
  dailyCalories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  waterMl: number;
  mealsPerDay: number;
  mealTiming: MealTimingRecommendation;
  dailyPlans: NutritionPlanContent;
  explanations: PlanExplanations;
  recommendations: string[];
  summary: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  processingTimeMs: number | null;
}

export interface NutritionPlanDeviationRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  planId: string;
  userId: string;
  dayNumber: number;
  mealIndex: number | null;
  foodIndex: number | null;
  scope: NutritionPlanDeviationScope;
  type: NutritionPlanDeviationType;
  plannedItemName: string | null;
  actualItemName: string | null;
  plannedPortion: string | null;
  actualPortion: string | null;
  note: string | null;
}

export interface CreateNutritionPlanDeviationInput {
  dayNumber: number;
  mealIndex?: number;
  foodIndex?: number;
  scope: NutritionPlanDeviationScope;
  type: NutritionPlanDeviationType;
  actualItemName?: string;
  actualPortion?: string;
  note?: string;
}

export type NutritionPlanSummary = NutritionPlanRecord;

function localDateYmd(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const nutritionPlanClient = {
  list() {
    return apiRequest<{ plans: NutritionPlanRecord[] }>({
      path: "/nutrition-plans",
      method: "GET",
      auth: true,
    });
  },

  generate(duration: SupportedNutritionPlanDuration) {
    return apiRequest<{ plan: NutritionPlanRecord }>({
      path: "/nutrition-plans/generate",
      method: "POST",
      auth: true,
      body: JSON.stringify({ duration, startDate: localDateYmd() }),
    });
  },

  regenerate(planId: string) {
    return apiRequest<{ plan: NutritionPlanRecord }>({
      path: `/nutrition-plans/${encodeURIComponent(planId)}/regenerate`,
      method: "POST",
      auth: true,
    });
  },

  get(planId: string) {
    return apiRequest<{ plan: NutritionPlanRecord }>({
      path: `/nutrition-plans/${encodeURIComponent(planId)}`,
      method: "GET",
      auth: true,
    });
  },

  deletePlan(planId: string) {
    return apiRequest<void>({
      path: `/nutrition-plans/${encodeURIComponent(planId)}`,
      method: "DELETE",
      auth: true,
    });
  },

  listDeviations(planId: string) {
    return apiRequest<{ deviations: NutritionPlanDeviationRecord[] }>({
      path: `/nutrition-plans/${encodeURIComponent(planId)}/deviations`,
      method: "GET",
      auth: true,
    });
  },

  createDeviation(planId: string, input: CreateNutritionPlanDeviationInput) {
    return apiRequest<{ deviation: NutritionPlanDeviationRecord }>({
      path: `/nutrition-plans/${encodeURIComponent(planId)}/deviations`,
      method: "POST",
      auth: true,
      body: JSON.stringify(input),
    });
  },

  deleteDeviation(planId: string, deviationId: string) {
    return apiRequest<void>({
      path: `/nutrition-plans/${encodeURIComponent(planId)}/deviations/${encodeURIComponent(deviationId)}`,
      method: "DELETE",
      auth: true,
    });
  },
} as const;
