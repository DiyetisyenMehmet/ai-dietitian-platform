import { apiRequest } from "@/infrastructure/api/http-client";
import { ACTIVITY_ENDPOINTS } from "@/infrastructure/auth/endpoints";

/** Activity type enum matching the backend ActivityType. */
export type ActivityType =
  | "WALKING"
  | "RUNNING"
  | "CYCLING"
  | "SWIMMING"
  | "STRENGTH_TRAINING"
  | "PILATES"
  | "HOME_EXERCISE"
  | "YOGA"
  | "HIIT"
  | "SPORTS"
  | "OTHER";

/** A persisted activity log entry returned by the owner-scoped activity API. */
export interface Activity {
  id: string;
  userId: string;
  type: ActivityType;
  name: string | null;
  durationMinutes: number;
  distanceKm: number | null;
  perceivedIntensity: number | null;
  caloriesBurned: number | null;
  note: string | null;
  loggedAt: string;
  createdAt: string;
}

/** Input for logging a new activity. */
export interface LogActivityInput {
  type: ActivityType;
  name?: string;
  durationMinutes: number;
  distanceKm?: number;
  perceivedIntensity?: number;
  caloriesBurned?: number;
  note?: string;
  loggedAt?: string;
}

/** Authenticated transport for the owner-scoped activity REST API. */
export const activityClient = {
  /** Lists activity logs, optionally only those logged on/after `since`. */
  listActivities(since?: Date) {
    const query = since ? `?since=${encodeURIComponent(since.toISOString())}` : "";
    return apiRequest<{ activities: Activity[] }>({
      path: `${ACTIVITY_ENDPOINTS.base}${query}`,
      method: "GET",
      auth: true,
    });
  },

  /** Persists a new activity log and returns it. */
  logActivity(input: LogActivityInput) {
    return apiRequest<{ activity: Activity }>({
      path: ACTIVITY_ENDPOINTS.base,
      method: "POST",
      auth: true,
      body: JSON.stringify(input),
    });
  },

  /** Permanently removes one activity belonging to the authenticated user. */
  deleteActivity(activityId: string) {
    return apiRequest<void>({
      path: `${ACTIVITY_ENDPOINTS.base}/${encodeURIComponent(activityId)}`,
      method: "DELETE",
      auth: true,
    });
  },
} as const;
