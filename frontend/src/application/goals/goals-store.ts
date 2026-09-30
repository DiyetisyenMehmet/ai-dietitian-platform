"use client";

import * as React from "react";

import type { Goal } from "@/domain/goals/types";
import { goalsClient } from "@/infrastructure/goals/goals-client";

export type GoalsStatus = "idle" | "loading" | "ready" | "error";

let goals: Goal[] = [];
let status: GoalsStatus = "idle";
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  goals = [...goals];
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return goals;
}

function getStatusSnapshot() {
  return status;
}

export interface GoalDraft {
  type: Goal["type"];
  title: string;
  targetValue: number;
  startDate: string;
  targetDate: string;
  reminderTime?: string;
  notes?: string;
}

export const goalsStore = {
  async hydrate(force = false): Promise<void> {
    if (!force && status === "ready") return;
    if (hydratePromise) return hydratePromise;

    status = "loading";
    emit();

    const request = goalsClient
      .listGoals()
      .then(({ goals: persisted }) => {
        goals = persisted;
        status = "ready";
        emit();
      })
      .catch((error: unknown) => {
        status = "error";
        emit();
        throw error;
      })
      .finally(() => {
        hydratePromise = null;
      });

    hydratePromise = request;
    return request;
  },

  async create(draft: GoalDraft): Promise<Goal> {
    const { goal } = await goalsClient.createGoal(draft);
    goals = [goal, ...goals.filter((item) => item.id !== goal.id)];
    status = "ready";
    emit();
    return goal;
  },

  async update(id: string, draft: GoalDraft): Promise<Goal> {
    const { goal } = await goalsClient.updateGoal(id, draft);
    goals = goals.map((item) => (item.id === id ? goal : item));
    status = "ready";
    emit();
    return goal;
  },

  async remove(id: string): Promise<void> {
    await goalsClient.deleteGoal(id);
    goals = goals.filter((item) => item.id !== id);
    status = "ready";
    emit();
  },

  reset() {
    goals = [];
    status = "idle";
    hydratePromise = null;
    emit();
  },
};

export function useGoals(): Goal[] {
  React.useEffect(() => {
    if (status === "idle") {
      void goalsStore.hydrate().catch(() => undefined);
    }
  }, []);
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useGoalsStatus(): GoalsStatus {
  return React.useSyncExternalStore(subscribe, getStatusSnapshot, getStatusSnapshot);
}

export function useGoal(id: string): Goal | undefined {
  const all = useGoals();
  return all.find((goal) => goal.id === id);
}
