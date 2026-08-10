import { apiRequest } from "@/infrastructure/api/http-client";
import { TRACKING_ENDPOINTS } from "@/infrastructure/auth/endpoints";

/**
 * A persisted water-intake log entry, as returned by the backend tracking
 * module (Sprint 19). The backend is the single source of truth; the frontend
 * daily-tracking store is a cache hydrated from these records.
 */
export interface WaterLog {
  id: string;
  userId: string;
  amountMl: number;
  loggedAt: string;
  createdAt: string;
}

/**
 * A persisted weight-measurement log entry, as returned by the backend tracking
 * module (Sprint 19). The backend is the single source of truth; the frontend
 * journey store is a cache hydrated from these records.
 */
export interface WeightLog {
  id: string;
  userId: string;
  weightKg: number;
  note: string | null;
  loggedAt: string;
  createdAt: string;
}

/**
 * Infrastructure-level tracking client. Authenticated (the HTTP client attaches
 * the access token). Reuses the existing `/api/tracking/water` endpoints — no
 * new backend contract. No UI or store logic here.
 */
export const trackingClient = {
  /** Lists water logs, optionally only those logged on/after `since`. */
  listWater(since?: Date) {
    const query = since ? `?since=${encodeURIComponent(since.toISOString())}` : "";
    return apiRequest<{ logs: WaterLog[] }>({
      path: `${TRACKING_ENDPOINTS.water}${query}`,
      method: "GET",
      auth: true,
    });
  },

  /** Persists a new water log (amount in millilitres) and returns it. */
  logWater(amountMl: number) {
    return apiRequest<{ log: WaterLog }>({
      path: TRACKING_ENDPOINTS.water,
      method: "POST",
      auth: true,
      body: JSON.stringify({ amountMl }),
    });
  },

  /** Lists weight logs, optionally only those logged on/after `since`. */
  listWeight(since?: Date) {
    const query = since ? `?since=${encodeURIComponent(since.toISOString())}` : "";
    return apiRequest<{ logs: WeightLog[] }>({
      path: `${TRACKING_ENDPOINTS.weight}${query}`,
      method: "GET",
      auth: true,
    });
  },
} as const;
