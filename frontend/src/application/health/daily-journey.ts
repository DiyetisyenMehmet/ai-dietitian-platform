"use client";

import type { JourneyStep } from "@/domain/health/types";
import type { JourneyResult } from "./journey-engine";
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


/**
 * Presentation-only selector for the compact Dashboard Journey.
 * The engine already decides the recommended action; this helper only chooses
 * what to reveal when the list is collapsed.
 */
export function selectJourneyCompactStep(steps: JourneyStep[]): JourneyStep | null {
  return (
    steps.find((step) => step.state === "recommended") ??
    steps.find((step) => step.state === "pending") ??
    null
  );
}

export function visibleJourneySteps(
  steps: JourneyStep[],
  status: JourneyResult["status"],
  expanded: boolean,
): JourneyStep[] {
  if (expanded) return steps;
  if (status === "all-done" || status === "insufficient-data") return [];
  const primary = selectJourneyCompactStep(steps);
  return primary ? [primary] : [];
}
