import { apiRequest } from "@/infrastructure/api/http-client";
import { GOAL_ENDPOINTS } from "@/infrastructure/auth/endpoints";
import type { Goal, GoalType } from "@/domain/goals/types";

export interface GoalWritePayload {
  type: GoalType;
  title: string;
  targetValue: number;
  startDate: string;
  targetDate: string;
  reminderTime?: string;
  notes?: string;
}

function timezoneQuery(): string {
  let timezone = "UTC";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    timezone = "UTC";
  }
  return "?timezone=" + encodeURIComponent(timezone);
}

export const goalsClient = {
  listGoals() {
    return apiRequest<{ goals: Goal[] }>({
      path: GOAL_ENDPOINTS.base + timezoneQuery(),
      method: "GET",
      auth: true,
    });
  },

  createGoal(input: GoalWritePayload) {
    return apiRequest<{ goal: Goal }>({
      path: GOAL_ENDPOINTS.base + timezoneQuery(),
      method: "POST",
      auth: true,
      body: JSON.stringify(input),
    });
  },

  updateGoal(id: string, input: GoalWritePayload) {
    return apiRequest<{ goal: Goal }>({
      path: GOAL_ENDPOINTS.base + "/" + encodeURIComponent(id) + timezoneQuery(),
      method: "PATCH",
      auth: true,
      body: JSON.stringify(input),
    });
  },

  deleteGoal(id: string) {
    return apiRequest<void>({
      path: GOAL_ENDPOINTS.base + "/" + encodeURIComponent(id),
      method: "DELETE",
      auth: true,
    });
  },
} as const;
