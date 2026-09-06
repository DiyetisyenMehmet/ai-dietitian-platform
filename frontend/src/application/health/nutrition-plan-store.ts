"use client";

import * as React from "react";

import {
  isSupportedNutritionPlanDuration,
  nutritionPlanClient,
  type NutritionPlanRecord,
  type RefreshNutritionPlanInput,
  type SupportedNutritionPlanDuration,
} from "@/infrastructure/nutrition/nutrition-plan-client";

interface NutritionPlanState {
  /** Most recently updated active, completed supported plan. */
  activePlan: NutritionPlanRecord | null;
  plans: NutritionPlanRecord[];
  hydrated: boolean;
  loading: boolean;
  generating: boolean;
  generatingDuration: SupportedNutritionPlanDuration | null;
}

const EMPTY_STATE: NutritionPlanState = {
  activePlan: null,
  plans: [],
  hydrated: false,
  loading: false,
  generating: false,
  generatingDuration: null,
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
      .filter(
        (plan) =>
          plan.isActive &&
          plan.status === "COMPLETED" &&
          isSupportedNutritionPlanDuration(plan.duration),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
  );
}

function mergeActivePlan(plans: NutritionPlanRecord[], plan: NutritionPlanRecord): NutritionPlanRecord[] {
  return [
    plan,
    ...plans
      .filter((item) => item.id !== plan.id)
      .map((item) => (item.isActive ? { ...item, isActive: false } : item)),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function completeGeneration(plan: NutritionPlanRecord): NutritionPlanRecord {
  const plans = mergeActivePlan(state.plans, plan);
  emit({
    ...state,
    plans,
    activePlan: chooseActive(plans),
    hydrated: true,
    generating: false,
    generatingDuration: null,
  });
  return plan;
}

function failGeneration(error: unknown): never {
  patch({ generating: false, generatingDuration: null });
  throw error;
}

export const nutritionPlanStore = {
  async hydrateFromBackend(): Promise<NutritionPlanRecord | null> {
    patch({ loading: true });
    try {
      const { plans } = await nutritionPlanClient.list();
      const activePlan = chooseActive(plans);
      emit({ ...state, plans, activePlan, hydrated: true, loading: false });
      return activePlan;
    } catch {
      emit({ ...EMPTY_STATE, hydrated: true });
      return null;
    }
  },

  async generate(duration: SupportedNutritionPlanDuration): Promise<NutritionPlanRecord> {
    if (state.generating) throw new Error("Nutrition plan generation is already in progress.");
    patch({ generating: true, generatingDuration: duration });
    try {
      const { plan } = await nutritionPlanClient.generate(duration);
      return completeGeneration(plan);
    } catch (error) {
      return failGeneration(error);
    }
  },

  async regenerate(planId: string): Promise<NutritionPlanRecord> {
    if (state.generating) throw new Error("Nutrition plan generation is already in progress.");
    const source = state.plans.find((item) => item.id === planId) ?? state.activePlan;
    if (!source || !isSupportedNutritionPlanDuration(source.duration)) {
      throw new Error("This nutrition plan duration is no longer supported.");
    }
    patch({ generating: true, generatingDuration: source.duration });
    try {
      const { plan } = await nutritionPlanClient.regenerate(planId);
      return completeGeneration(plan);
    } catch (error) {
      return failGeneration(error);
    }
  },

  async refresh(planId: string, input: RefreshNutritionPlanInput): Promise<NutritionPlanRecord> {
    if (state.generating) throw new Error("Nutrition plan generation is already in progress.");
    const source = state.plans.find((item) => item.id === planId) ?? state.activePlan;
    if (!source || !isSupportedNutritionPlanDuration(source.duration)) {
      throw new Error("This nutrition plan duration is no longer supported.");
    }
    patch({ generating: true, generatingDuration: source.duration });
    try {
      const { plan } = await nutritionPlanClient.refresh(planId, input);
      return completeGeneration(plan);
    } catch (error) {
      return failGeneration(error);
    }
  },

  async extend(
    planId: string,
    duration: SupportedNutritionPlanDuration,
  ): Promise<NutritionPlanRecord> {
    if (state.generating) throw new Error("Nutrition plan generation is already in progress.");
    patch({ generating: true, generatingDuration: duration });
    try {
      const { plan } = await nutritionPlanClient.extend(planId, duration);
      return completeGeneration(plan);
    } catch (error) {
      return failGeneration(error);
    }
  },

  async remove(planId: string): Promise<void> {
    if (state.generating) throw new Error("Nutrition plan generation is already in progress.");
    await nutritionPlanClient.deletePlan(planId);
    const plans = state.plans.filter((item) => item.id !== planId);
    emit({
      ...state,
      plans,
      activePlan: chooseActive(plans),
      hydrated: true,
    });
  },

  reset(): void {
    emit({ ...EMPTY_STATE });
  },
};

export function useNutritionPlan(): NutritionPlanState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
