"use client";

import * as React from "react";

import { trackingClient, type WaterLog } from "@/infrastructure/tracking/tracking-client";

/**
 * Daily-tracking store: today's water intake plus lightweight per-day coaching
 * flags. The backend is the single source of truth for water.
 */
interface DailyTrackingState {
  waterMl: number;
  waterGoalMl: number;
  chattedToday: boolean;
}

export const WATER_GLASS_ML = 250;

const EMPTY_STATE: DailyTrackingState = {
  waterMl: 0,
  waterGoalMl: 0,
  chattedToday: false,
};

let state: DailyTrackingState = { ...EMPTY_STATE };

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
  async hydrateWaterFromBackend(): Promise<void> {
    try {
      const { logs } = await trackingClient.listWater(startOfToday());
      const total = logs.reduce((sum, log) => sum + log.amountMl, 0);
      setState({ waterMl: Math.max(0, total) });
    } catch {
      setState({ waterMl: 0 });
    }
  },

  async addWater(amountMl: number = WATER_GLASS_ML): Promise<WaterLog> {
    const { log } = await trackingClient.logWater(amountMl);
    setState({ waterMl: Math.max(0, state.waterMl + log.amountMl) });
    return log;
  },

  async removeWater(logId: string): Promise<void> {
    await trackingClient.deleteWater(logId);
    await this.hydrateWaterFromBackend();
  },

  setWaterGoal(goalMl: number) {
    setState({ waterGoalMl: Math.max(0, goalMl) });
  },

  markChatted() {
    if (!state.chattedToday) setState({ chattedToday: true });
  },

  reset() {
    state = { ...EMPTY_STATE };
    listeners.forEach((l) => l());
  },
};

export function useDailyTracking(): DailyTrackingState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
