import { apiRequest } from "@/infrastructure/api/http-client";

export type NutritionPlanDuration = "THIRTY_DAY" | "SIXTY_DAY";
export type NutritionPlanStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

/** Minimal backend nutrition-plan contract needed by the frontend dashboard. */
export interface NutritionPlanSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  duration: NutritionPlanDuration;
  version: number;
  isActive: boolean;
  status: NutritionPlanStatus;
  bmr: number;
  tdee: number;
  dailyCalories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  waterMl: number;
  mealsPerDay: number;
  summary: string | null;
}

/** Authenticated client for persisted personalized nutrition plans. */
export const nutritionPlanClient = {
  list() {
    return apiRequest<{ plans: NutritionPlanSummary[] }>({
      path: "/nutrition-plans",
      method: "GET",
      auth: true,
    });
  },
} as const;
