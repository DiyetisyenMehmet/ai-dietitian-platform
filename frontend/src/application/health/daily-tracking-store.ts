"use client";

import * as React from "react";

/**
 * In-memory daily-tracking store: water intake plus lightweight per-day coaching
 * flags (did the user chat with the coach today?). Shared via useSyncExternalStore.
 *
 * This replaces the previously static water figure so quick actions and daily
 * tasks can react to real, session-scoped interactions. Placeholder data layer
 * consistent with the other stores.
 */

interface DailyTrackingState {
  /** Water consumed today, in millilitres. */
  waterMl: number;
  /** Daily water goal, in millilitres. */
  waterGoalMl: number;
  /** True once the user has messaged the coach today. */
  chattedToday: boolean;
}

/** Default increment used by the "add water" quick action (one glass). */
export const WATER_GLASS_ML = 250;

let state: DailyTrackingState = {
  waterMl: 1250,
  waterGoalMl: 2500,
  chattedToday: false,
};

const listeners = new Set<() => void>();

function setState(next: Partial<DailyTrackingState>) {
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

export const dailyTrackingStore = {
  /** Adds one glass (or a custom amount) of water, clamped at 0. */
  addWater(amountMl: number = WATER_GLASS_ML) {
    setState({ waterMl: Math.max(0, state.waterMl + amountMl) });
  },
  setWaterGoal(goalMl: number) {
    setState({ waterGoalMl: Math.max(0, goalMl) });
  },
  markChatted() {
    if (!state.chattedToday) setState({ chattedToday: true });
  },
};

/** Subscribe to the daily-tracking state. */
export function useDailyTracking(): DailyTrackingState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
