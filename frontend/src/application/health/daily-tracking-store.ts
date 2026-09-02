"use client";

import * as React from "react";

import { trackingClient } from "@/infrastructure/tracking/tracking-client";

/**
 * Daily-tracking store: today's water intake plus lightweight per-day coaching
 * flags (did the user chat with the coach today?). Shared via useSyncExternalStore.
 *
 * The backend is the single source of truth for water: today's `waterMl` is
 * hydrated from `/api/tracking/water`, and every add is persisted BEFORE the
 * cache is updated. There is no seeded/demo water value.
 */

interface DailyTrackingState {
  /** Water consumed today, in millilitres (hydrated from the backend). */
  waterMl: number;
  /** Daily water goal, in millilitres (sourced from the profile). */
  waterGoalMl: number;
  /** True once the user has messaged the coach today in this app session/day. */
  chattedToday: boolean;
}

/** Default increment used by the "add water" quick action (one glass). */
export const WATER_GLASS_ML = 250;

const EMPTY_STATE: DailyTrackingState = {
  waterMl: 0,
  waterGoalMl: 0,
  chattedToday: false,
};

let state: DailyTrackingState = { ...EMPTY_STATE };

/** Start of today (local) — the window used to sum "today's" water logs. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

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
  /**
   * Hydrates today's water total from the backend logs. On failure the total is
   * reset to zero rather than retaining another user's stale cache.
   */
  async hydrateWaterFromBackend(): Promise<void> {
    try {
      const { logs } = await trackingClient.listWater(startOfToday());
      const total = logs.reduce((sum, log) => sum + log.amountMl, 0);
      setState({ waterMl: Math.max(0, total) });
    } catch {
      setState({ waterMl: 0 });
    }
  },
  /**
   * Persists one glass (or a custom amount) of water to the backend FIRST, then
   * updates the cache from the persisted amount. Throws on failure so the caller
   * can surface an error and avoid showing an optimistic success.
   */
  async addWater(amountMl: number = WATER_GLASS_ML): Promise<void> {
    const { log } = await trackingClient.logWater(amountMl);
    setState({ waterMl: Math.max(0, state.waterMl + log.amountMl) });
  },
  setWaterGoal(goalMl: number) {
    setState({ waterGoalMl: Math.max(0, goalMl) });
  },
  markChatted() {
    if (!state.chattedToday) setState({ chattedToday: true });
  },
  /** Clears user-specific/day-specific cached values during account changes. */
  reset() {
    state = { ...EMPTY_STATE };
    listeners.forEach((l) => l());
  },
};

/** Subscribe to the daily-tracking state. */
export function useDailyTracking(): DailyTrackingState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
