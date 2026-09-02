"use client";

import * as React from "react";

import { activityClient } from "@/infrastructure/activity/activity-client";

/**
 * Daily-activity cache.
 *
 * Persisted active minutes come from the backend `/api/activity` source. Step
 * count has no authoritative backend source in V1 yet, so it intentionally
 * starts at zero with no fabricated goal and must not drive health decisions.
 */

interface ActivityState {
  /** Steps recorded today. Zero until a real persisted/device source is wired. */
  steps: number;
  /** Daily step goal. Zero means not configured/available. */
  stepGoal: number;
  /** Active minutes recorded today from persisted backend activity logs. */
  activeMinutes: number;
  /** Optional daily active-minutes coaching goal; zero means not configured. */
  activeMinutesGoal: number;
}

/** Increment retained for future device/manual step integration. */
export const ACTIVITY_STEP_INCREMENT = 1000;

const EMPTY_STATE: ActivityState = {
  steps: 0,
  stepGoal: 0,
  activeMinutes: 0,
  activeMinutesGoal: 0,
};

let state: ActivityState = { ...EMPTY_STATE };

/** Start of today (local) — the window used to sum today's activity logs. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
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
  /**
   * Hydrates today's active-minutes total from persisted backend logs. On
   * failure the persisted signal is reset rather than retaining stale account
   * data.
   */
  async hydrateFromBackend(): Promise<void> {
    try {
      const { activities } = await activityClient.listActivities(startOfToday());
      const total = activities.reduce((sum, activity) => sum + activity.durationMinutes, 0);
      setState({ activeMinutes: Math.max(0, total) });
    } catch {
      setState({ activeMinutes: 0 });
    }
  },
  /**
   * Persists an activity log to the backend FIRST, then updates the cache from
   * the persisted duration. Throws on failure so the UI cannot claim success
   * for an unsaved activity.
   */
  async logActivity(input: {
    type: string;
    durationMinutes: number;
    name?: string;
    caloriesBurned?: number;
  }): Promise<void> {
    const { activity } = await activityClient.logActivity({
      type: input.type as never,
      name: input.name,
      durationMinutes: input.durationMinutes,
      caloriesBurned: input.caloriesBurned,
    });
    setState({ activeMinutes: Math.max(0, state.activeMinutes + activity.durationMinutes) });
  },
  /** Local-only until a real step source exists. Do not use for scoring. */
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

/** Subscribe to the daily-activity state. */
export function useActivity(): ActivityState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
