"use client";

import * as React from "react";

import { trackingClient, type WaterLog } from "@/infrastructure/tracking/tracking-client";
import {
  isIsoOnLocalDay,
  localDayKey,
  msUntilNextLocalDay,
  readinessFromCount,
  startOfLocalDay,
  type DailyDataReadiness,
} from "./daily-data-readiness";

interface DailyTrackingState {
  dayKey: string;
  waterReadiness: DailyDataReadiness;
  waterMl: number;
  /** Persisted writes confirmed this session; not the full daily aggregate. */
  confirmedWaterMl: number;
  waterGoalMl: number;
  chattedToday: boolean;
}

export const WATER_GLASS_ML = 250;

function emptyState(): DailyTrackingState {
  return {
    dayKey: localDayKey(),
    waterReadiness: "UNKNOWN",
    waterMl: 0,
    confirmedWaterMl: 0,
    waterGoalMl: 0,
    chattedToday: false,
  };
}

let state: DailyTrackingState = emptyState();
const confirmedWater = new Map<string, WaterLog>();
let sessionVersion = 0;
let writeVersion = 0;
const listeners = new Set<() => void>();
let rolloverTimer: ReturnType<typeof setTimeout> | null = null;

function setState(next: Partial<DailyTrackingState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function ensureCurrentDay(): boolean {
  const current = localDayKey();
  if (state.dayKey === current) return false;
  confirmedWater.clear();
  state = {
    ...state,
    dayKey: current,
    waterReadiness: "UNKNOWN",
    waterMl: 0,
    confirmedWaterMl: 0,
    chattedToday: false,
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

export const dailyTrackingStore = {
  async hydrateWaterFromBackend(): Promise<boolean> {
    const session = sessionVersion;
    const revision = writeVersion;
    const targetDay = localDayKey();
    if (state.dayKey !== targetDay) {
      ensureCurrentDay();
      listeners.forEach((listener) => listener());
    }

    try {
      const { logs } = await trackingClient.listWater(startOfLocalDay());
      if (session !== sessionVersion || revision !== writeVersion) return false;
      if (localDayKey() !== targetDay) {
        ensureCurrentDay();
        listeners.forEach((listener) => listener());
        return false;
      }
      const todayLogs = logs.filter((log) => isIsoOnLocalDay(log.loggedAt, targetDay));
      const total = todayLogs.reduce((sum, log) => sum + log.amountMl, 0);
      setState({
        waterMl: Math.max(0, total),
        waterReadiness: readinessFromCount(todayLogs.length),
      });
      return true;
    } catch {
      if (session !== sessionVersion || revision !== writeVersion) return false;
      if (state.dayKey === targetDay) setState({ waterReadiness: "UNKNOWN" });
      return false;
    }
  },

  async addWater(amountMl: number = WATER_GLASS_ML): Promise<WaterLog> {
    const session = sessionVersion;
    ensureCurrentDay();
    const { log } = await trackingClient.logWater(amountMl);
    if (session !== sessionVersion) return log;
    ensureCurrentDay();
    writeVersion++;
    if (isIsoOnLocalDay(log.loggedAt, state.dayKey)) {
      confirmedWater.set(log.id, log);
      setState({
        confirmedWaterMl: [...confirmedWater.values()].reduce((sum, entry) => sum + entry.amountMl, 0),
        waterMl: Math.max(0, state.waterMl + log.amountMl),
        waterReadiness: state.waterReadiness === "UNKNOWN" ? "UNKNOWN" : "KNOWN",
      });
    }
    if (state.waterReadiness === "UNKNOWN") await this.hydrateWaterFromBackend();
    return log;
  },

  async removeWater(logId: string, amountMl?: number): Promise<void> {
    const session = sessionVersion;
    ensureCurrentDay();
    const targetDay = state.dayKey;
    await trackingClient.deleteWater(logId);
    if (session !== sessionVersion) return;
    ensureCurrentDay();
    writeVersion++;
    confirmedWater.delete(logId);
    setState({ confirmedWaterMl: [...confirmedWater.values()].reduce((sum, entry) => sum + entry.amountMl, 0) });
    if (targetDay === state.dayKey && amountMl !== undefined && state.waterReadiness !== "UNKNOWN") {
      const waterMl = Math.max(0, state.waterMl - Math.max(0, amountMl));
      setState({ waterMl, waterReadiness: waterMl === 0 ? "KNOWN_ZERO" : "KNOWN" });
    }
    await this.hydrateWaterFromBackend();
  },

  setWaterGoal(goalMl: number) {
    setState({ waterGoalMl: Math.max(0, goalMl) });
  },

  markChatted() {
    ensureCurrentDay();
    if (!state.chattedToday) setState({ chattedToday: true });
  },

  reset() {
    confirmedWater.clear();
    sessionVersion++;
    writeVersion++;
    state = emptyState();
    listeners.forEach((listener) => listener());
  },
};

export function useDailyTracking(): DailyTrackingState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
