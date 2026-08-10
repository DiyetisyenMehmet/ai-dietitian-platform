"use client";

import * as React from "react";

import { activityClient } from "@/infrastructure/activity/activity-client";

/**
 * Daily-activity store: steps and active minutes for today plus their goals.
 * Shared via useSyncExternalStore, consistent with the other health stores.
 *
 * The backend is the single source of truth for activity (Sprint 22.2B):
 * today's `activeMinutes` is hydrated from the `/api/activity` logs on login /
 * app startup / refresh. There is no seeded/demo activity value — the cache
 * starts empty and reflects only what the backend returns.
 *
 * Activity is a first-class step of the guided daily journey (Sprint 20) and a
 * weighted contributor to the dynamic health score, so it needs a reactive
 * source the dashboard and coach reasoning can read.
 */

interface ActivityState {
  /** Steps recorded today. */
  steps: number;
  /** Daily step goal. */
  stepGoal: number;
  /** Active minutes recorded today. */
  activeMinutes: number;
  /** Daily active-minutes goal. */
  activeMinutesGoal: number;
}

/** Increment used by the "log activity" quick action. */
export const ACTIVITY_STEP_INCREMENT = 1000;

let state: ActivityState = {
  steps: 0,
  stepGoal: 8000,
  activeMinutes: 0,
  activeMinutesGoal: 30,
};

/** Start of today (local) — the window used to sum "today's" activity logs. */
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
   * Hydrates today's active-minutes total from the backend activity logs
   * (single source of truth). Called on login / app startup / refresh.
   * Best-effort: on a transient failure the last known cache is kept and
   * retried on next mount.
   */
  async hydrateFromBackend(): Promise<void> {
    try {
      const { activities } = await activityClient.listActivities(startOfToday());
      const total = activities.reduce((sum, activity) => sum + activity.durationMinutes, 0);
      setState({ activeMinutes: Math.max(0, total) });
    } catch {
      // Offline / transient failure: keep the last known cache.
    }
  },
  /**
   * Persists an activity log to the backend FIRST, then updates the cache from
   * the persisted duration. Throws on failure so the caller can surface an
   * error and avoid showing an optimistic success.
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
  /** Adds steps (defaults to one increment), clamped at 0. */
  addSteps(amount: number = ACTIVITY_STEP_INCREMENT) {
    setState({ steps: Math.max(0, state.steps + amount) });
  },
  setStepGoal(goal: number) {
    setState({ stepGoal: Math.max(0, goal) });
  },
};

/** Subscribe to the daily-activity state. */
export function useActivity(): ActivityState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
