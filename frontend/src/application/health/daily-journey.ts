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
  return { ...result, allDone: result.status === "all-done" };
}

/** Required recording goals; optional logs stay visible without increasing the denominator. */
export function summarizeJourney(steps: JourneyStep[]): {
  completed: number;
  total: number;
  percent: number;
} {
  const required = steps.filter((step) => step.countsTowardProgress !== false);
  const total = required.length;
  const completed = required.filter((s) => s.state === "completed").length;
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

/** UI-only preference; never persisted as a health record. */
export interface JourneyDisclosure {
  outer: boolean | null;
  inner: boolean;
  completionSeen: boolean;
}
export function journeyDisclosure(value: unknown): JourneyDisclosure {
  const item = value as Partial<JourneyDisclosure> | null;
  return {
    outer: typeof item?.outer === "boolean" ? item.outer : null,
    inner: item?.inner === true,
    completionSeen: item?.completionSeen === true,
  };
}
export function settleJourneyDisclosure(
  value: JourneyDisclosure,
  complete: boolean,
): JourneyDisclosure {
  return complete && !value.completionSeen
    ? { ...value, outer: false, completionSeen: true }
    : value;
}
