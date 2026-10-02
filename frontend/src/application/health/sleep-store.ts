"use client";

import * as React from "react";

import { sleepClient, type DailySleepAssessment } from "@/infrastructure/sleep/sleep-client";
import {
  localDayKey,
  msUntilNextLocalDay,
  readinessFromCount,
  type DailyDataReadiness,
} from "./daily-data-readiness";

export interface SleepDailyState {
  dayKey: string;
  readiness: DailyDataReadiness;
  assessment: DailySleepAssessment | null;
}

let state: SleepDailyState = {
  dayKey: localDayKey(),
  readiness: "UNKNOWN",
  assessment: null,
};
let sessionVersion = 0;
const listeners = new Set<() => void>();
let rolloverTimer: ReturnType<typeof setTimeout> | null = null;

function emit(): void {
  listeners.forEach((listener) => listener());
}

function resetForDay(dayKey = localDayKey()): void {
  state = { dayKey, readiness: "UNKNOWN", assessment: null };
}

function ensureCurrentDay(): void {
  const current = localDayKey();
  if (state.dayKey !== current) resetForDay(current);
}

function scheduleRollover(): void {
  if (typeof window === "undefined" || rolloverTimer !== null || listeners.size === 0) return;
  rolloverTimer = setTimeout(() => {
    rolloverTimer = null;
    const before = state.dayKey;
    ensureCurrentDay();
    if (state.dayKey !== before) emit();
    scheduleRollover();
  }, msUntilNextLocalDay());
}

function subscribe(listener: () => void): () => void {
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

function getSnapshot(): SleepDailyState {
  ensureCurrentDay();
  return state;
}

export const sleepStore = {
  async hydrateTodayFromBackend(dayKey = localDayKey()): Promise<boolean> {
    const session = sessionVersion;
    if (state.dayKey !== dayKey) {
      resetForDay(dayKey);
      emit();
    }
    try {
      const { assessment } = await sleepClient.dailyAssessment(dayKey);
      if (session !== sessionVersion) return false;
      if (localDayKey() !== dayKey) {
        resetForDay();
        emit();
        return false;
      }
      state = { dayKey, readiness: readinessFromCount(assessment.entries), assessment };
      emit();
      return true;
    } catch {
      if (session !== sessionVersion) return false;
      if (state.dayKey === dayKey) {
        state = { ...state, readiness: "UNKNOWN" };
        emit();
      }
      return false;
    }
  },

  reset(): void {
    sessionVersion++;
    resetForDay();
    emit();
  },
};

export function useSleepDaily(): SleepDailyState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
