import type { Activity, ActivityType } from "@prisma/client";

import { ApiError } from "../../utils/api-error";
import { activityRepository } from "./activity.repository";

/**
 * Input for logging a physical-activity entry. `caloriesBurned` may be supplied
 * by a trusted/device source; otherwise the backend derives a conservative
 * estimate from activity type, duration and the user's current profile weight.
 */
export interface CreateActivityInput {
  type: ActivityType;
  name?: string;
  durationMinutes: number;
  caloriesBurned?: number;
  note?: string;
  loggedAt?: string;
}

const UNDOABLE_ACTIVITY_COUNT = 3;

/** Parses an optional ISO string into a Date, or undefined. */
function toDate(iso?: string): Date | undefined {
  return iso ? new Date(iso) : undefined;
}

/**
 * Representative MET values used only for a best-effort calorie estimate. They
 * deliberately stay conservative and are never used to automatically increase
 * a user's food/calorie allowance. Real energy expenditure varies by pace,
 * fitness, terrain, technique and device accuracy.
 */
const MET_BY_ACTIVITY: Record<ActivityType, number> = {
  WALKING: 3.5,
  RUNNING: 8.3,
  CYCLING: 6.8,
  SWIMMING: 6,
  STRENGTH_TRAINING: 5,
  YOGA: 2.5,
  HIIT: 8,
  SPORTS: 6,
  OTHER: 4,
};

function estimateCaloriesBurned(
  type: ActivityType,
  durationMinutes: number,
  weightKg: number | null,
): number | undefined {
  if (!weightKg || weightKg <= 0 || durationMinutes <= 0) return undefined;
  // Standard MET estimate: kcal/min = MET × 3.5 × kg / 200.
  const calories = (MET_BY_ACTIVITY[type] * 3.5 * weightKg * durationMinutes) / 200;
  return Math.max(0, Math.round(calories));
}

/**
 * Activity service. Persists movement/exercise time-series for the AI Health
 * Coach while keeping estimated exercise energy separate from the nutrition
 * target, avoiding the common "exercise calories earned back" double count.
 */
export const activityService = {
  async logActivity(userId: string, input: CreateActivityInput): Promise<Activity> {
    let caloriesBurned = input.caloriesBurned;
    if (caloriesBurned === undefined) {
      const weightKg = await activityRepository.findCurrentWeightKg(userId);
      caloriesBurned = estimateCaloriesBurned(input.type, input.durationMinutes, weightKg);
    }

    return activityRepository.createActivity({
      userId,
      type: input.type,
      name: input.name,
      durationMinutes: input.durationMinutes,
      caloriesBurned,
      note: input.note,
      loggedAt: toDate(input.loggedAt),
    });
  },

  listActivities(userId: string, since?: Date): Promise<Activity[]> {
    return activityRepository.listActivities(userId, since);
  },

  async deleteActivity(userId: string, activityId: string): Promise<void> {
    const latestActivityIds = await activityRepository.listLatestActivityIds(
      userId,
      UNDOABLE_ACTIVITY_COUNT,
    );

    if (!latestActivityIds.includes(activityId)) {
      throw ApiError.conflict("Yalnızca son 3 hareket kaydı geri alınabilir.");
    }

    return activityRepository.deleteActivity(userId, activityId);
  },
};
