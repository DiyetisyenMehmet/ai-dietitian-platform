"use client";

import * as React from "react";

/**
 * In-memory daily-activity store: steps and active minutes for today plus their
 * goals. Shared via useSyncExternalStore, consistent with the other health
 * stores (session-scoped placeholder data layer, backend-ready shape).
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
  steps: 4200,
  stepGoal: 8000,
  activeMinutes: 18,
  activeMinutesGoal: 30,
};

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
  /** Adds steps (defaults to one increment), clamped at 0. */
  addSteps(amount: number = ACTIVITY_STEP_INCREMENT) {
    setState({ steps: Math.max(0, state.steps + amount) });
  },
  /** Adds active minutes, clamped at 0. */
  addActiveMinutes(minutes: number) {
    setState({ activeMinutes: Math.max(0, state.activeMinutes + minutes) });
  },
  setStepGoal(goal: number) {
    setState({ stepGoal: Math.max(0, goal) });
  },
};

/** Subscribe to the daily-activity state. */
export function useActivity(): ActivityState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
