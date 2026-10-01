"use client";

import * as React from "react";

import {
  activityClient,
  type Activity,
  type ActivityType,
} from "@/infrastructure/activity/activity-client";
import {
  isIsoOnLocalDay,
  localDayKey,
  msUntilNextLocalDay,
  readinessFromCount,
  startOfLocalDay,
  type DailyDataReadiness,
} from "./daily-data-readiness";

interface ActivityState {
  dayKey: string;
  readiness: DailyDataReadiness;
  steps: number;
  stepGoal: number;
  activeMinutes: number;
  activeMinutesGoal: number;
  activities: Activity[];
  estimatedCaloriesBurned: number;
}

export const ACTIVITY_STEP_INCREMENT = 1000;

function emptyState(): ActivityState {
  return {
    dayKey: localDayKey(),
    readiness: "UNKNOWN",
    steps: 0,
    stepGoal: 0,
    activeMinutes: 0,
    activeMinutesGoal: 0,
    activities: [],
    estimatedCaloriesBurned: 0,
  };
}

let state: ActivityState = emptyState();
const listeners = new Set<() => void>();
let rolloverTimer: ReturnType<typeof setTimeout> | null = null;

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

function setState(next: Partial<ActivityState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function ensureCurrentDay(): boolean {
  const current = localDayKey();
  if (state.dayKey === current) return false;
  state = {
    ...emptyState(),
    stepGoal: state.stepGoal,
    activeMinutesGoal: state.activeMinutesGoal,
  };
  return true;
}

function scheduleRollover(): void {
  if (typeof window === "undefined" || rolloverTimer !== null || listeners.size === 0) return;
  rolloverTimer = setTimeout(() => {
    rolloverTimer = null;
    if (ensureCurrentDay()) listeners.forEach((listener) => listener());
    scheduleRollover();
  }, msUntilNextLocalDay());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  scheduleRollover();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && rolloverTimer !== null) {
      clearTimeout(rolloverTimer);
      rolloverTimer = null;
    }
  };
}

function getSnapshot() {
  ensureCurrentDay();
  return state;
}

export const activityStore = {
  async hydrateFromBackend(): Promise<boolean> {
    const targetDay = localDayKey();
    if (state.dayKey !== targetDay) {
      ensureCurrentDay();
      listeners.forEach((listener) => listener());
    }

    try {
      const { activities } = await activityClient.listActivities(startOfLocalDay());
      if (localDayKey() !== targetDay) {
        ensureCurrentDay();
        listeners.forEach((listener) => listener());
        return false;
      }
      const todayActivities = activities.filter((item) => isIsoOnLocalDay(item.loggedAt, targetDay));
      setState({
        activities: todayActivities,
        readiness: readinessFromCount(todayActivities.length),
        ...summarize(todayActivities),
      });
      return true;
    } catch {
      if (state.dayKey === targetDay) setState({ readiness: "UNKNOWN" });
      return false;
    }
  },

  async logActivity(input: {
    type: ActivityType;
    durationMinutes: number;
    name?: string;
    distanceKm?: number;
    perceivedIntensity?: number;
    caloriesBurned?: number;
    note?: string;
  }): Promise<Activity> {
    ensureCurrentDay();
    const previousReadiness = state.readiness;
    const { activity } = await activityClient.logActivity(input);
    if (isIsoOnLocalDay(activity.loggedAt, state.dayKey)) {
      const activities = [activity, ...state.activities.filter((item) => item.id !== activity.id)];
      setState({
        activities,
        readiness: previousReadiness === "UNKNOWN" ? "UNKNOWN" : "KNOWN",
        ...summarize(activities),
      });
    }
    return activity;
  },

  async deleteActivity(activityId: string): Promise<void> {
    ensureCurrentDay();
    const previousReadiness = state.readiness;
    await activityClient.deleteActivity(activityId);
    const activities = state.activities.filter((item) => item.id !== activityId);
    setState({
      activities,
      readiness: previousReadiness === "UNKNOWN" ? "UNKNOWN" : readinessFromCount(activities.length),
      ...summarize(activities),
    });
  },

  /** Local-only until a real device/manual step source exists. Do not use for scoring. */
  addSteps(amount: number = ACTIVITY_STEP_INCREMENT) {
    ensureCurrentDay();
    setState({ steps: Math.max(0, state.steps + amount) });
  },
  setStepGoal(goal: number) {
    setState({ stepGoal: Math.max(0, goal) });
  },
  setActiveMinutesGoal(goal: number) {
    setState({ activeMinutesGoal: Math.max(0, goal) });
  },
  reset() {
    state = emptyState();
    listeners.forEach((listener) => listener());
  },
};

export function useActivity(): ActivityState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
