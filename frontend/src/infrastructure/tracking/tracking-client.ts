import { apiRequest } from "@/infrastructure/api/http-client";
import { TRACKING_ENDPOINTS } from "@/infrastructure/auth/endpoints";

/**
 * A persisted water-intake log entry, as returned by the backend tracking
 * module. The backend is the single source of truth.
 */
export interface WaterLog {
  id: string;
  userId: string;
  amountMl: number;
  loggedAt: string;
  createdAt: string;
}

export interface WaterRecommendation {
  text: string;
  source: "AI" | "RULE_BASED_FALLBACK";
  todayMl: number;
  dailyGoalMl: number;
  sevenDayAverageMl: number;
  generatedAt: string;
}

export interface WaterReminder {
  id: string;
  scheduledFor: string;
  type: "WATER_REMINDER";
}

/**
 * A persisted weight-measurement log entry, as returned by the backend tracking
 * module. The backend is the single source of truth.
 */
export interface WeightLog {
  id: string;
  userId: string;
  weightKg: number;
  note: string | null;
  loggedAt: string;
  createdAt: string;
}

export interface WeightCheckInStatus {
  active: boolean;
  intervalDays: number;
  required: boolean;
  lastLoggedAt: string | null;
  nextDueAt: string | null;
  overdueDays: number;
}

/** Infrastructure-level tracking client. Authenticated requests only. */
export const trackingClient = {
  listWater(since?: Date) {
    const query = since ? `?since=${encodeURIComponent(since.toISOString())}` : "";
    return apiRequest<{ logs: WaterLog[] }>({
      path: `${TRACKING_ENDPOINTS.water}${query}`,
      method: "GET",
      auth: true,
    });
  },

  logWater(amountMl: number) {
    return apiRequest<{ log: WaterLog }>({
      path: TRACKING_ENDPOINTS.water,
      method: "POST",
      auth: true,
      body: JSON.stringify({ amountMl }),
    });
  },

  deleteWater(id: string) {
    return apiRequest<void>({
      path: `${TRACKING_ENDPOINTS.water}/${encodeURIComponent(id)}`,
      method: "DELETE",
      auth: true,
    });
  },

  getWaterGoal() {
    return apiRequest<{ dailyWaterGoalMl: number }>({
      path: `${TRACKING_ENDPOINTS.water}/goal`,
      method: "GET",
      auth: true,
    });
  },

  updateWaterGoal(dailyWaterGoalMl: number) {
    return apiRequest<{ dailyWaterGoalMl: number }>({
      path: `${TRACKING_ENDPOINTS.water}/goal`,
      method: "PATCH",
      auth: true,
      body: JSON.stringify({ dailyWaterGoalMl }),
    });
  },

  scheduleWaterReminder(minutesFromNow: number) {
    return apiRequest<{ notification: WaterReminder }>({
      path: `${TRACKING_ENDPOINTS.water}/reminders`,
      method: "POST",
      auth: true,
      body: JSON.stringify({ minutesFromNow }),
    });
  },

  getWaterRecommendation() {
    return apiRequest<{ recommendation: WaterRecommendation }>({
      path: `${TRACKING_ENDPOINTS.water}/recommendation`,
      method: "GET",
      auth: true,
    });
  },

  listWeight(since?: Date) {
    const query = since ? `?since=${encodeURIComponent(since.toISOString())}` : "";
    return apiRequest<{ logs: WeightLog[] }>({
      path: `${TRACKING_ENDPOINTS.weight}${query}`,
      method: "GET",
      auth: true,
    });
  },

  getWeightCheckIn() {
    return apiRequest<{ checkIn: WeightCheckInStatus }>({
      path: TRACKING_ENDPOINTS.weightCheckIn,
      method: "GET",
      auth: true,
    });
  },

  logWeight(weightKg: number, note?: string, loggedAt?: Date) {
    return apiRequest<{ log: WeightLog }>({
      path: TRACKING_ENDPOINTS.weight,
      method: "POST",
      auth: true,
      body: JSON.stringify({
        weightKg,
        ...(note?.trim() ? { note: note.trim() } : {}),
        ...(loggedAt ? { loggedAt: loggedAt.toISOString() } : {}),
      }),
    });
  },
} as const;
