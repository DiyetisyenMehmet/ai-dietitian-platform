"use client";

import * as React from "react";

import {
  nutritionPlanClient,
  type NutritionPlanSummary,
} from "@/infrastructure/nutrition/nutrition-plan-client";

interface NutritionPlanState {
  /** Most recently updated active, completed plan across supported durations. */
  activePlan: NutritionPlanSummary | null;
  hydrated: boolean;
}

let state: NutritionPlanState = { activePlan: null, hydrated: false };
const listeners = new Set<() => void>();

function emit(next: NutritionPlanState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): NutritionPlanState {
  return state;
}

function chooseActive(plans: NutritionPlanSummary[]): NutritionPlanSummary | null {
  return (
    plans
      .filter((plan) => plan.isActive && plan.status === "COMPLETED")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
  );
}

export const nutritionPlanStore = {
  /**
   * Hydrates the persisted active nutrition plan. Returns the selected plan so
   * callers can synchronize legacy scalar caches without duplicating a request.
   */
  async hydrateFromBackend(): Promise<NutritionPlanSummary | null> {
    try {
      const { plans } = await nutritionPlanClient.list();
      const activePlan = chooseActive(plans);
      emit({ activePlan, hydrated: true });
      return activePlan;
    } catch {
      // Clear stale nutrition targets on failure; fabricated or cross-account
      // calorie/macro targets are more dangerous than an explicit unavailable UI.
      emit({ activePlan: null, hydrated: true });
      return null;
    }
  },
  reset(): void {
    emit({ activePlan: null, hydrated: false });
  },
};

export function useNutritionPlan(): NutritionPlanState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
