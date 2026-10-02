"use client";

import type { JourneyStep } from "@/domain/health/types";
import { useJourneyEngine } from "./use-journey-engine";

export function useDailyJourney(): JourneyStep[] {
  return useDailyJourneyResult().steps;
}

/** Keeps completion evidence alongside the legacy projection. */
export function useDailyJourneyResult() {
  const result = useJourneyEngine();
  return { steps: result.steps, status: result.status, allDone: result.status === "all-done" };
}

/** Completion summary (completed vs. total, including recorded-window skips). */
export function summarizeJourney(steps: JourneyStep[]): {
  completed: number;
  total: number;
  percent: number;
} {
  const total = steps.length;
  const completed = steps.filter((s) => s.state === "completed").length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, percent };
}
