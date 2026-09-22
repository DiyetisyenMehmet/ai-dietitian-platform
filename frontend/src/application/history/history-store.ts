"use client";

import * as React from "react";

import type { CustomHistoryComparisonInput } from "@/application/history/history-custom-comparison";
import type {
  DailyHistoryResponse,
  HistoryComparisonResponse,
  HistoryInsightResponse,
  HistoryMode,
} from "@/domain/history/types";
import { historyClient } from "@/infrastructure/history/history-client";

export type HistoryLoadStatus = "idle" | "loading" | "success" | "error";
export type HistoryInsightStatus = "idle" | "loading" | "success" | "error";

interface HistoryState {
  requestKey: string | null;
  dataStatus: HistoryLoadStatus;
  insightStatus: HistoryInsightStatus;
  daily: DailyHistoryResponse | null;
  comparison: HistoryComparisonResponse | null;
  insight: HistoryInsightResponse | null;
  error: string | null;
  insightError: string | null;
}

const SERVER_STATE: HistoryState = {
  requestKey: null,
  dataStatus: "idle",
  insightStatus: "idle",
  daily: null,
  comparison: null,
  insight: null,
  error: null,
  insightError: null,
};

let state: HistoryState = SERVER_STATE;
let dataSequence = 0;
let insightSequence = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(next: Partial<HistoryState>): void {
  state = { ...state, ...next };
  emit();
}

export function historyRequestKey(
  userId: string,
  mode: HistoryMode,
  date: string,
  timezone: string,
): string {
  return [userId, mode, date, timezone].join("|");
}

export function customHistoryRequestKey(
  userId: string,
  input: CustomHistoryComparisonInput,
  timezone: string,
): string {
  return [
    userId,
    "CUSTOM",
    input.period1Start,
    input.period1End,
    input.period2Start,
    input.period2End,
    timezone,
  ].join("|");
}

export function calendarDateKey(date = new Date()): string {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function dateKeyForTimezone(timezone: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function shiftCalendarDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function shiftCalendarMonth(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const nextMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
  const lastDay = new Date(nextMonth.getTime() - 1).getUTCDate();
  first.setUTCDate(Math.min(day, lastDay));
  return first.toISOString().slice(0, 10);
}

export const historyStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): HistoryState {
    return state;
  },

  getServerSnapshot(): HistoryState {
    return SERVER_STATE;
  },

  async load(input: {
    userId: string;
    mode: HistoryMode;
    date: string;
    timezone: string;
  }): Promise<void> {
    const requestKey = historyRequestKey(input.userId, input.mode, input.date, input.timezone);
    const sequence = ++dataSequence;
    insightSequence += 1;

    setState({
      requestKey,
      dataStatus: "loading",
      insightStatus: "idle",
      daily: null,
      comparison: null,
      insight: null,
      error: null,
      insightError: null,
    });

    try {
      if (input.mode === "DAY") {
        const { history } = await historyClient.getDay(input.date, input.timezone);
        if (sequence !== dataSequence) return;
        setState({ dataStatus: "success", daily: history });
      } else {
        const { comparison } = await historyClient.getComparison(
          input.mode === "WEEK" ? "week" : "month",
          input.date,
          input.timezone,
        );
        if (sequence !== dataSequence) return;
        setState({ dataStatus: "success", comparison });
      }
    } catch (error) {
      if (sequence !== dataSequence) return;
      setState({
        dataStatus: "error",
        error: error instanceof Error ? error.message : "Geçmiş verileri yüklenemedi.",
      });
    }
  },

  async loadCustomComparison(input: {
    userId: string;
    ranges: CustomHistoryComparisonInput;
    timezone: string;
  }): Promise<void> {
    const requestKey = customHistoryRequestKey(input.userId, input.ranges, input.timezone);
    const sequence = ++dataSequence;
    insightSequence += 1;

    setState({
      requestKey,
      dataStatus: "loading",
      insightStatus: "idle",
      daily: null,
      comparison: null,
      insight: null,
      error: null,
      insightError: null,
    });

    try {
      const { comparison } = await historyClient.getCustomComparison(
        input.ranges,
        input.timezone,
      );
      if (sequence !== dataSequence) return;
      setState({ dataStatus: "success", comparison });
    } catch (error) {
      if (sequence !== dataSequence) return;
      setState({
        dataStatus: "error",
        error:
          error instanceof Error ? error.message : "Özel karşılaştırma verileri yüklenemedi.",
      });
    }
  },

  async loadInsight(input: {
    userId: string;
    mode: HistoryMode;
    date: string;
    timezone: string;
  }): Promise<void> {
    const requestKey = historyRequestKey(input.userId, input.mode, input.date, input.timezone);
    if (state.requestKey !== requestKey || state.dataStatus !== "success") return;

    const sequence = ++insightSequence;
    setState({ insightStatus: "loading", insight: null, insightError: null });
    try {
      const { insight } = await historyClient.getInsight(input.mode, input.date, input.timezone);
      if (sequence !== insightSequence || state.requestKey !== requestKey) return;
      setState({ insightStatus: "success", insight });
    } catch (error) {
      if (sequence !== insightSequence || state.requestKey !== requestKey) return;
      setState({
        insightStatus: "error",
        insightError:
          error instanceof Error ? error.message : "Diewish değerlendirmesi şu anda alınamadı.",
      });
    }
  },

  async loadCustomInsight(input: {
    userId: string;
    ranges: CustomHistoryComparisonInput;
    timezone: string;
  }): Promise<void> {
    const requestKey = customHistoryRequestKey(input.userId, input.ranges, input.timezone);
    if (state.requestKey !== requestKey || state.dataStatus !== "success") return;

    const sequence = ++insightSequence;
    setState({ insightStatus: "loading", insight: null, insightError: null });
    try {
      const { insight } = await historyClient.getCustomInsight(input.ranges, input.timezone);
      if (sequence !== insightSequence || state.requestKey !== requestKey) return;
      setState({ insightStatus: "success", insight });
    } catch (error) {
      if (sequence !== insightSequence || state.requestKey !== requestKey) return;
      setState({
        insightStatus: "error",
        insightError:
          error instanceof Error
            ? error.message
            : "Diewish özel karşılaştırma değerlendirmesi şu anda alınamadı.",
      });
    }
  },

  reset(): void {
    dataSequence += 1;
    insightSequence += 1;
    state = SERVER_STATE;
    emit();
  },
} as const;

export function useHistoryState(): HistoryState {
  return React.useSyncExternalStore(
    historyStore.subscribe,
    historyStore.getSnapshot,
    historyStore.getServerSnapshot,
  );
}
