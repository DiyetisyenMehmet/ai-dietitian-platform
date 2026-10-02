"use client";

import type { DailyTask } from "@/domain/health/types";
import { useJourneyEngine } from "./use-journey-engine";
import { journeyTasks } from "./journey-engine";

export function useDailyTasks(): DailyTask[] {
  return useDailyTasksResult().tasks;
}

/** Keeps completion evidence alongside the legacy projection. */
export function useDailyTasksResult() {
  const result = useJourneyEngine();
  return { tasks: journeyTasks(result), status: result.status, allDone: result.status === "all-done" };
}

/** Completion summary for a task list. */
export function summarizeTasks(tasks: DailyTask[]): {
  done: number;
  total: number;
  percent: number;
} {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, percent };
}
