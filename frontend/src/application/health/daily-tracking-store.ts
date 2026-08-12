"use client";

import * as React from "react";

import { trackingClient } from "@/infrastructure/tracking/tracking-client";

/**
 * Daily-tracking store: today's water intake plus lightweight per-day coaching
 * flags (did the user chat with the coach today?). Shared via useSyncExternalStore.
 *
 * The backend is the single source of truth for water (Sprint 21.3A): today's
 * `waterMl` is hydrated from the `/api/tracking/water` logs on login / app
 * startup / refresh, and every add is persisted to the backend BEFORE the cache
 * is updated. There is no seeded/demo water value — the cache starts empty and
 * reflects only what the backend returns.
 */

interface DailyTrackingState {
  /** Water consumed today, in millilitres (hydrated from the backend). */
  waterMl: number;
  /** Daily water goal, in millilitres (sourced from the profile). */
  waterGoalMl: number;
  /** True once the user has messaged the coach today. */
  chattedToday: boolean;
}

/** Default increment used by the "add water" quick action (one glass). */
export const WATER_GLASS_ML = 250;

let state: DailyTrackingState = {
  waterMl: 0,
  waterGoalMl: 0,
  chattedToday: false,
};

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
   * Hydrates today's water total from the backend logs (single source of
   * truth). Called on login / app startup / refresh. Best-effort: on a
   * transient failure the last known cache is kept and retried on next mount.
   */
  async hydrateWaterFromBackend(): Promise<void> {
    try {
      const { logs } = await trackingClient.listWater(startOfToday());
      const total = logs.reduce((sum, log) => sum + log.amountMl, 0);
      setState({ waterMl: Math.max(0, total) });
    } catch {
      // Offline / transient failure: keep the last known cache.
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
};

/** Subscribe to the daily-tracking state. */
export function useDailyTracking(): DailyTrackingState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
