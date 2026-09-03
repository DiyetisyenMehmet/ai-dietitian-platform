"use client";

import * as React from "react";

import {
  activityClient,
  type Activity,
  type ActivityType,
} from "@/infrastructure/activity/activity-client";

/** Daily activity cache backed by `/api/activity`. */
interface ActivityState {
  steps: number;
  stepGoal: number;
  activeMinutes: number;
  activeMinutesGoal: number;
  /** Persisted activity entries recorded today, newest first. */
  activities: Activity[];
  /** Sum of available best-effort burn estimates; never added to food allowance. */
  estimatedCaloriesBurned: number;
}

export const ACTIVITY_STEP_INCREMENT = 1000;

const EMPTY_STATE: ActivityState = {
  steps: 0,
  stepGoal: 0,
  activeMinutes: 0,
  activeMinutesGoal: 0,
  activities: [],
  estimatedCaloriesBurned: 0,
};

let state: ActivityState = { ...EMPTY_STATE };

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function summarize(activities: Activity[]): Pick<ActivityState, "activeMinutes" | "estimatedCaloriesBurned"> {
  return activities.reduce(
    (acc, activity) => {
      acc.activeMinutes += Math.max(0, activity.durationMinutes);
      acc.estimatedCaloriesBurned += Math.max(0, activity.caloriesBurned ?? 0);
      return acc;
    },
    { activeMinutes: 0, estimatedCaloriesBurned: 0 },
  );
}

const listeners = new Set<() => void>();

function setState(next: Partial<ActivityState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export const activityStore = {
  async hydrateFromBackend(): Promise<void> {
    try {
      const { activities } = await activityClient.listActivities(startOfToday());
      setState({ activities, ...summarize(activities) });
    } catch {
      setState({ activities: [], activeMinutes: 0, estimatedCaloriesBurned: 0 });
    }
  },

  /** Persist first, then refresh today's cache from the created server record. */
  async logActivity(input: {
    type: ActivityType;
    durationMinutes: number;
    name?: string;
    caloriesBurned?: number;
    note?: string;
  }): Promise<Activity> {
    const { activity } = await activityClient.logActivity(input);
    const activities = [activity, ...state.activities.filter((item) => item.id !== activity.id)];
    setState({ activities, ...summarize(activities) });
    return activity;
  },

  /** Local-only until a real device/manual step source exists. Do not use for scoring. */
  addSteps(amount: number = ACTIVITY_STEP_INCREMENT) {
    setState({ steps: Math.max(0, state.steps + amount) });
  },
  setStepGoal(goal: number) {
    setState({ stepGoal: Math.max(0, goal) });
  },
  setActiveMinutesGoal(goal: number) {
    setState({ activeMinutesGoal: Math.max(0, goal) });
  },
  reset() {
    state = { ...EMPTY_STATE };
    listeners.forEach((l) => l());
  },
};

export function useActivity(): ActivityState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
