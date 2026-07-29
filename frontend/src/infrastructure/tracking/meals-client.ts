import { apiRequest } from "@/infrastructure/api/http-client";
import { TRACKING_ENDPOINTS } from "@/infrastructure/auth/endpoints";

/** Backend meal-type enum (Sprint 19 tracking module). */
export type MealLogType = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";

/**
 * A persisted meal-log entry, as returned by the backend tracking module
 * (Sprint 19). The backend is the single source of truth; the frontend meals
 * store is a cache hydrated from these records.
 */
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

/**
 * Infrastructure-level meals client. Authenticated (the HTTP client attaches
 * the access token). Reuses the existing `/api/tracking/meals` endpoints — no
 * new backend contract. No UI or store logic here.
 */
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
} as const;
