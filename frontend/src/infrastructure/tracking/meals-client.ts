import { apiRequest } from "@/infrastructure/api/http-client";
import { TRACKING_ENDPOINTS } from "@/infrastructure/auth/endpoints";

/** Backend meal-type enum. */
export type MealLogType = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";

/** Persisted meal-log entry returned by the backend tracking module. */
export interface MealLog {
  id: string;
  userId: string;
  mealType: MealLogType;
  name: string | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  sodiumMg: number | null;
  sugarG: number | null;
  loggedAt: string;
  createdAt: string;
}

/** Payload for a food log or a bare explicit meal check-in. */
export interface LogMealInput {
  mealType: MealLogType;
  name?: string;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  sodiumMg?: number;
  sugarG?: number;
  loggedAt?: string;
}

/** Editable nutrition-bearing fields. Meal type/time stay immutable here. */
export interface UpdateMealInput {
  name?: string;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  sodiumMg?: number;
  sugarG?: number;
}

export const mealsClient = {
  /** Lists meal logs, optionally only those logged on/after `since`. */
  listMeals(since?: Date) {
    const query = since ? `?since=${encodeURIComponent(since.toISOString())}` : "";
    return apiRequest<{ logs: MealLog[] }>({
      path: `${TRACKING_ENDPOINTS.meals}${query}`,
      method: "GET",
      auth: true,
    });
  },

  /** Persists a food entry or a bare meal check-in and returns it. */
  logMeal(input: LogMealInput) {
    return apiRequest<{ log: MealLog }>({
      path: TRACKING_ENDPOINTS.meals,
      method: "POST",
      auth: true,
      body: JSON.stringify(input),
    });
  },

  /** Persists an owner-scoped food edit and returns the updated row. */
  updateMeal(id: string, input: UpdateMealInput) {
    return apiRequest<{ log: MealLog }>({
      path: `${TRACKING_ENDPOINTS.meals}/${encodeURIComponent(id)}`,
      method: "PATCH",
      auth: true,
      body: JSON.stringify(input),
    });
  },

  /** Permanently removes one owner-scoped meal log. */
  deleteMeal(id: string) {
    return apiRequest<void>({
      path: `${TRACKING_ENDPOINTS.meals}/${encodeURIComponent(id)}`,
      method: "DELETE",
      auth: true,
    });
  },
} as const;
