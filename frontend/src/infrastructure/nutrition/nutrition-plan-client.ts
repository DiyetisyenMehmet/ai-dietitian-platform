import { apiRequest } from "@/infrastructure/api/http-client";

export type NutritionPlanDuration = "THIRTY_DAY" | "SIXTY_DAY";
export type NutritionPlanStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

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

/** Full persisted nutrition-plan contract returned by the backend. */
export interface NutritionPlanRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
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

/** Backwards-compatible alias for dashboard consumers. */
export type NutritionPlanSummary = NutritionPlanRecord;

/** Authenticated client for persisted personalized nutrition plans. */
export const nutritionPlanClient = {
  list() {
    return apiRequest<{ plans: NutritionPlanRecord[] }>({
      path: "/nutrition-plans",
      method: "GET",
      auth: true,
    });
  },

  generate(duration: NutritionPlanDuration) {
    return apiRequest<{ plan: NutritionPlanRecord }>({
      path: "/nutrition-plans/generate",
      method: "POST",
      auth: true,
      body: JSON.stringify({ duration }),
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
} as const;
