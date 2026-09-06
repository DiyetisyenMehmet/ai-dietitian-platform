"use client";

import * as React from "react";

import {
  nutritionPlanClient,
  type NutritionPlanDuration,
  type NutritionPlanRecord,
} from "@/infrastructure/nutrition/nutrition-plan-client";

interface NutritionPlanState {
  /** Most recently updated active, completed plan across supported durations. */
  activePlan: NutritionPlanRecord | null;
  plans: NutritionPlanRecord[];
  hydrated: boolean;
  loading: boolean;
  generating: boolean;
}

const EMPTY_STATE: NutritionPlanState = {
  activePlan: null,
  plans: [],
  hydrated: false,
  loading: false,
  generating: false,
};

let state: NutritionPlanState = { ...EMPTY_STATE };
const listeners = new Set<() => void>();

function emit(next: NutritionPlanState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

function patch(next: Partial<NutritionPlanState>): void {
  emit({ ...state, ...next });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): NutritionPlanState {
  return state;
}

function chooseActive(plans: NutritionPlanRecord[]): NutritionPlanRecord | null {
  return (
    plans
      .filter((plan) => plan.isActive && plan.status === "COMPLETED")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
  );
}

function mergePlan(plans: NutritionPlanRecord[], plan: NutritionPlanRecord): NutritionPlanRecord[] {
  return [plan, ...plans.filter((item) => item.id !== plan.id)].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export const nutritionPlanStore = {
  /** Hydrates persisted plans; backend remains the source of truth. */
  async hydrateFromBackend(): Promise<NutritionPlanRecord | null> {
    patch({ loading: true });
    try {
      const { plans } = await nutritionPlanClient.list();
      const activePlan = chooseActive(plans);
      emit({ ...state, plans, activePlan, hydrated: true, loading: false });
      return activePlan;
    } catch {
      // Fail closed: stale/cross-account calorie and macro targets are more
      // dangerous than an explicit unavailable state.
      emit({ ...EMPTY_STATE, hydrated: true });
      return null;
    }
  },

  async generate(duration: NutritionPlanDuration): Promise<NutritionPlanRecord> {
    if (state.generating) throw new Error("Nutrition plan generation is already in progress.");
    patch({ generating: true });
    try {
      const { plan } = await nutritionPlanClient.generate(duration);
      const plans = mergePlan(
        state.plans.map((item) =>
          item.duration === plan.duration && item.id !== plan.id ? { ...item, isActive: false } : item,
        ),
        plan,
      );
      emit({ ...state, plans, activePlan: chooseActive(plans), hydrated: true, generating: false });
      return plan;
    } catch (error) {
      patch({ generating: false });
      throw error;
    }
  },

  async regenerate(planId: string): Promise<NutritionPlanRecord> {
    if (state.generating) throw new Error("Nutrition plan generation is already in progress.");
    patch({ generating: true });
    try {
      const { plan } = await nutritionPlanClient.regenerate(planId);
      const plans = mergePlan(
        state.plans.map((item) =>
          item.duration === plan.duration && item.id !== plan.id ? { ...item, isActive: false } : item,
        ),
        plan,
      );
      emit({ ...state, plans, activePlan: chooseActive(plans), hydrated: true, generating: false });
      return plan;
    } catch (error) {
      patch({ generating: false });
      throw error;
    }
  },

  reset(): void {
    emit({ ...EMPTY_STATE });
  },
};

export function useNutritionPlan(): NutritionPlanState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
