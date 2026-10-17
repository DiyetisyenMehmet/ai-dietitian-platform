"use client";

import * as React from "react";
import { ApiError } from "@/infrastructure/api/http-client";

import {
  isSupportedNutritionPlanDuration,
  nutritionPlanClient,
  type NutritionPlanRecord,
  type RefreshNutritionPlanInput,
  type SupportedNutritionPlanDuration,
  type NutritionPreparation,
} from "@/infrastructure/nutrition/nutrition-plan-client";

interface NutritionPlanState {
  /** Most recently updated active, completed supported plan. */
  activePlan: NutritionPlanRecord | null;
  plans: NutritionPlanRecord[];
  hydrated: boolean;
  loading: boolean;
  generating: boolean;
  generatingDuration: SupportedNutritionPlanDuration | null;
  /** Optional household ingredients for the next generated plan. Never persisted in browser storage. */
  pantryDraft: string;
  preparation: NutritionPreparation | null;
  durable: boolean;
  preparationOffline: boolean;
}

type SupportedNutritionPlanRecord = NutritionPlanRecord & {
  duration: SupportedNutritionPlanDuration;
};

const EMPTY_STATE: NutritionPlanState = {
  activePlan: null,
  plans: [],
  hydrated: false,
  loading: false,
  generating: false,
  generatingDuration: null,
  pantryDraft: "",
  preparation: null,
  durable: false,
  preparationOffline: false,
};

let state: NutritionPlanState = { ...EMPTY_STATE };
let accountEpoch = 0;
let watchId: string | null = null;
let watchEpoch = 0;
let pendingRequest: { key: string; payload: string } | null = null;

function isPreparing(job: NutritionPreparation): boolean {
  return ["QUEUED", "RUNNING", "RETRY_WAIT", "READY"].includes(job.status);
}
async function watchPreparation(job: NutritionPreparation, epoch = accountEpoch): Promise<void> {
  if (watchId === job.id) return;
  watchId = job.id;
  const watcher = ++watchEpoch;
  let refreshBeforeDelivery = false;
  try {
    while (epoch === accountEpoch && watchId === job.id && watcher === watchEpoch) {
      patch({
        preparation: job,
        generating: isPreparing(job),
        generatingDuration: isPreparing(job) ? job.duration : null,
      });
      if (job.status === "CONSUMED" && job.deliveredPlanId) {
        try {
          const { plan } = await nutritionPlanClient.get(job.deliveredPlanId);
          if (epoch !== accountEpoch || watcher !== watchEpoch) return;
          pendingRequest = null;
          completeGeneration(plan);
          patch({ preparation: null, preparationOffline: false });
          return;
        } catch {
          if (epoch !== accountEpoch || watcher !== watchEpoch) return;
          patch({ preparationOffline: true });
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
      }
      if (!isPreparing(job)) {
        pendingRequest = null;
        return;
      }
      try {
        if (job.status === "READY" && !refreshBeforeDelivery) {
          const { plan } = await nutritionPlanClient.deliverPreparation(job.id);
          if (epoch !== accountEpoch || watcher !== watchEpoch) return;
          pendingRequest = null;
          completeGeneration(plan);
          patch({ preparation: null, preparationOffline: false });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (epoch !== accountEpoch || watcher !== watchEpoch) return;
        const response = await nutritionPlanClient.preparation(job.id);
        if (epoch !== accountEpoch || watcher !== watchEpoch) return;
        job = response.job;
        refreshBeforeDelivery = false;
        patch({ preparationOffline: false });
      } catch (error) {
        if (epoch !== accountEpoch || watcher !== watchEpoch) return;
        if (
          error instanceof ApiError &&
          ["NUTRITION_PLAN_GENERATION_IN_PROGRESS", "NUTRITION_JOB_NOT_READY"].includes(
            error.code ?? "",
          )
        ) {
          // The server may have paused/completed this job on another device.
          // Refresh in the main guarded try/catch so a failed read stays retryable.
          refreshBeforeDelivery = true;
          continue;
        }
        if (
          error instanceof ApiError &&
          error.status > 0 &&
          (![408, 429, 502, 503, 504].includes(error.status) ||
            error.code === "NUTRITION_RIGHT_EXHAUSTED")
        ) {
          patch({
            preparation: {
              ...job,
              status: "FAILED",
              errorCode: error.code ?? "NUTRITION_JOB_FAILED",
            },
            generating: false,
            generatingDuration: null,
          });
          pendingRequest = null;
          return;
        }
        patch({ preparationOffline: true });
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  } finally {
    if (epoch === accountEpoch && watchId === job.id && watcher === watchEpoch) watchId = null;
  }
}

function requestKey(payload: string): string {
  if (!pendingRequest || pendingRequest.payload !== payload)
    pendingRequest = { payload, key: crypto.randomUUID() };
  return pendingRequest.key;
}
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

function planPantryText(plan: NutritionPlanRecord | null): string | null {
  const value = plan?.dailyPlans?.planningContext?.pantryText?.trim();
  return value ? value.slice(0, 800) : null;
}

function mergeActivePlan(
  plans: NutritionPlanRecord[],
  plan: NutritionPlanRecord,
): NutritionPlanRecord[] {
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
    pantryDraft: planPantryText(plan) ?? state.pantryDraft,
  });
  return plan;
}

/**
 * Browser QA can inspect these anonymous measurements in Performance entries.
 * The second animation frame is only a post-update paint opportunity, not a
 * guarantee of visual completion on background tabs. No user data is recorded.
 */
function recordPlanDisplayTiming(startedAt: number): void {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") return;
  const responseAt = performance.now();
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      try {
        const frameAt = performance.now();
        performance.measure("diewish:nutrition-plan:request-ms", {
          start: startedAt,
          end: responseAt,
        });
        performance.measure("diewish:nutrition-plan:post-response-frame-ms", {
          start: responseAt,
          end: frameAt,
        });
      } catch {
        // Diagnostic instrumentation must never change meal-plan behavior.
      }
    });
  });
}

function failGeneration(error: unknown): never {
  patch({ generating: false, generatingDuration: null });
  throw error;
}

function assertNotGenerating(): void {
  if (state.generating) {
    throw new ApiError(
      "Nutrition plan generation is already in progress.",
      409,
      "NUTRITION_PLAN_GENERATION_IN_PROGRESS",
    );
  }
}

function requireSupportedSource(planId: string): SupportedNutritionPlanRecord {
  const source = state.plans.find((item) => item.id === planId) ?? state.activePlan;
  if (!source || !isSupportedNutritionPlanDuration(source.duration)) {
    throw new Error("This nutrition plan duration is no longer supported.");
  }
  return source as SupportedNutritionPlanRecord;
}

export const nutritionPlanStore = {
  getDurableMode(): boolean {
    return state.durable;
  },
  async hydrateFromBackend(): Promise<NutritionPlanRecord | null> {
    const epoch = accountEpoch;
    const previousActiveId = state.activePlan?.id;
    patch({ loading: true });
    try {
      const [{ plans }, capability] = await Promise.all([
        nutritionPlanClient.list(),
        nutritionPlanClient.capabilities().catch(() => ({ resumable: false })),
      ]);
      if (epoch !== accountEpoch) return null;
      // An older list response must not replace a plan generated meanwhile.
      if (state.activePlan?.id !== previousActiveId) {
        patch({ loading: false, hydrated: true });
        return state.activePlan;
      }
      const activePlan = chooseActive(plans);
      emit({
        ...state,
        plans,
        activePlan,
        hydrated: true,
        loading: false,
        pantryDraft: planPantryText(activePlan) ?? state.pantryDraft,
        durable: capability.resumable,
      });
      if (epoch !== accountEpoch) return null;
      patch({ durable: capability.resumable });
      if (capability.resumable) {
        const { job } = await nutritionPlanClient.currentPreparation();
        if (epoch !== accountEpoch) return null;
        if (job) {
          patch({
            preparation: job,
            generating: isPreparing(job),
            generatingDuration: isPreparing(job) ? job.duration : null,
          });
          void watchPreparation(job, epoch);
        }
      }
      return activePlan;
    } catch {
      // A failed concurrent read must not unlock an ongoing generation.
      if (epoch === accountEpoch) patch({ loading: false, hydrated: true });
      return state.activePlan;
    }
  },

  setPantryDraft(value: string): void {
    patch({ pantryDraft: value.slice(0, 800) });
  },

  async generate(
    duration: SupportedNutritionPlanDuration,
    pantryText = state.pantryDraft,
  ): Promise<NutritionPlanRecord | null> {
    assertNotGenerating();
    if (state.durable) {
      const epoch = accountEpoch;
      patch({ generating: true, generatingDuration: duration });
      try {
        const { job } = await nutritionPlanClient.startPreparation(
          duration,
          pantryText,
          requestKey(JSON.stringify({ duration, pantryText })),
        );
        if (epoch !== accountEpoch) throw new Error("Account changed");
        patch({
          preparation: job,
          generating: isPreparing(job),
          generatingDuration: isPreparing(job) ? job.duration : null,
        });
        void watchPreparation(job, epoch);
        // Existing callers only await acceptance; the server owns completion.
        return null;
      } catch (error) {
        if (epoch === accountEpoch) failGeneration(error);
        throw error;
      }
    }
    const startedAt = typeof performance !== "undefined" ? performance.now() : 0;
    patch({ generating: true, generatingDuration: duration });
    try {
      const { plan } = await nutritionPlanClient.generate(duration, pantryText);
      const result = completeGeneration(plan);
      recordPlanDisplayTiming(startedAt);
      return result;
    } catch (error) {
      return failGeneration(error);
    }
  },
  async pausePreparation(): Promise<void> {
    const job = state.preparation,
      epoch = accountEpoch;
    if (!job) return;
    const response = await nutritionPlanClient.pausePreparation(job.id);
    if (epoch !== accountEpoch) return;
    watchId = null;
    watchEpoch++;
    pendingRequest = null;
    patch({
      preparation: response.job,
      generating: false,
      generatingDuration: null,
      preparationOffline: false,
    });
  },
  async replaceMeal(
    plan: NutritionPlanRecord,
    dayNumber: number,
    mealIndex: number,
  ): Promise<void> {
    assertNotGenerating();
    const epoch = accountEpoch;
    patch({
      generating: true,
      generatingDuration: plan.duration as SupportedNutritionPlanDuration,
    });
    try {
      const { job } = await nutritionPlanClient.replaceMeal(
        plan,
        dayNumber,
        mealIndex,
        requestKey(JSON.stringify({ plan: plan.id, dayNumber, mealIndex })),
      );
      if (epoch !== accountEpoch) return;
      patch({ preparation: job });
      void watchPreparation(job, epoch);
    } catch (error) {
      if (epoch === accountEpoch) failGeneration(error);
      throw error;
    }
  },

  async regenerate(planId: string): Promise<NutritionPlanRecord | null> {
    assertNotGenerating();
    const source = requireSupportedSource(planId);
    if (state.durable)
      return this.generate(source.duration, planPantryText(source) ?? state.pantryDraft);
    patch({ generating: true, generatingDuration: source.duration });
    try {
      const { plan } = await nutritionPlanClient.regenerate(planId);
      return completeGeneration(plan);
    } catch (error) {
      return failGeneration(error);
    }
  },

  async refresh(
    planId: string,
    input: RefreshNutritionPlanInput,
  ): Promise<NutritionPlanRecord | null> {
    assertNotGenerating();
    const source = requireSupportedSource(planId);
    patch({ generating: true, generatingDuration: source.duration });
    if (state.durable) {
      const epoch = accountEpoch;
      try {
        const { job } = await nutritionPlanClient.revisePreparation(
          source,
          source.duration,
          input.mode,
          requestKey(JSON.stringify({ planId, input })),
          input.dayNumber,
        );
        if (epoch === accountEpoch) {
          patch({ preparation: job });
          void watchPreparation(job, epoch);
        }
        return null;
      } catch (error) {
        if (epoch === accountEpoch) return failGeneration(error);
        throw error;
      }
    }
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
  ): Promise<NutritionPlanRecord | null> {
    assertNotGenerating();
    const source = requireSupportedSource(planId);
    patch({ generating: true, generatingDuration: duration });
    if (state.durable) {
      const epoch = accountEpoch;
      try {
        const { job } = await nutritionPlanClient.revisePreparation(
          source,
          duration,
          "EXTEND",
          requestKey(JSON.stringify({ planId, duration })),
        );
        if (epoch === accountEpoch) {
          patch({ preparation: job });
          void watchPreparation(job, epoch);
        }
        return null;
      } catch (error) {
        if (epoch === accountEpoch) return failGeneration(error);
        throw error;
      }
    }
    try {
      const { plan } = await nutritionPlanClient.extend(planId, duration);
      return completeGeneration(plan);
    } catch (error) {
      return failGeneration(error);
    }
  },

  async shiftToday(planId: string, dayNumber: number): Promise<NutritionPlanRecord> {
    if (state.generating) throw new Error("Nutrition plan generation is already in progress.");
    const source = requireSupportedSource(planId);
    patch({ generating: true, generatingDuration: source.duration });
    try {
      const { plan } = await nutritionPlanClient.shiftToday(planId, dayNumber);
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
    accountEpoch++;
    watchEpoch++;
    watchId = null;
    pendingRequest = null;
    emit({ ...EMPTY_STATE });
  },
};

export function useNutritionPlan(): NutritionPlanState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
