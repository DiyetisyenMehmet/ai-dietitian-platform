import type { Activity, ActivityType } from "@prisma/client";

import { activityRepository } from "./activity.repository";

/**
 * Input for logging a physical-activity entry. Defined locally (not as a route
 * schema) because Sprint 22.1B introduces the data foundation and service only
 * — no HTTP surface. `loggedAt` is an optional ISO string; it defaults to the
 * current time when omitted.
 */
export interface CreateActivityInput {
  type: ActivityType;
  name?: string;
  durationMinutes: number;
  caloriesBurned?: number;
  note?: string;
  loggedAt?: string;
}

/** Parses an optional ISO string into a Date, or undefined. */
function toDate(iso?: string): Date | undefined {
  return iso ? new Date(iso) : undefined;
}

/**
 * Activity service (Sprint 22). Persists the movement/exercise time-series the
 * AI Health Coach can reason over (activity consistency, inactivity gaps,
 * energy-expenditure context). Mirrors the thin Sprint 19 tracking service.
 */
export const activityService = {
  logActivity(userId: string, input: CreateActivityInput): Promise<Activity> {
    return activityRepository.createActivity({
      userId,
      type: input.type,
      name: input.name,
      durationMinutes: input.durationMinutes,
      caloriesBurned: input.caloriesBurned,
      note: input.note,
      loggedAt: toDate(input.loggedAt),
    });
  },

  listActivities(userId: string, since?: Date): Promise<Activity[]> {
    return activityRepository.listActivities(userId, since);
  },
};
