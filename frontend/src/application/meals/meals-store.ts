"use client";

import * as React from "react";

import {
  MEAL_SLOTS,
  type FoodItem,
  type Meal,
  type MealSlot,
  type NutritionTotals,
} from "@/domain/meals/types";
import { mealsClient, type MealLog, type MealLogType } from "@/infrastructure/tracking/meals-client";

/**
 * Meals store shared across routes via useSyncExternalStore.
 *
 * The backend is the single source of truth (Sprint 21.3B): today's meals are
 * hydrated from the `/api/tracking/meals` logs on login / app startup / refresh
 * via `hydrateMealsFromBackend`. This store is a cache only — it holds no
 * seeded/demo meals; it starts as empty slots and reflects only what the
 * backend returns.
 */

/** Empty (foodless) meal slots — the cache's initial, pre-hydration state. */
function emptyMeals(): Meal[] {
  return MEAL_SLOTS.map(({ slot, label, defaultTime }) => ({
    slot,
    label,
    time: defaultTime,
    foods: [],
  }));
}

/** Maps a backend meal-type enum to the client-side meal slot. */
const SLOT_BY_MEAL_TYPE: Record<MealLogType, MealSlot> = {
  BREAKFAST: "breakfast",
  LUNCH: "lunch",
  DINNER: "dinner",
  SNACK: "snack",
};

/** Maps a client-side meal slot to the backend meal-type enum. */
const MEAL_TYPE_BY_SLOT: Record<MealSlot, MealLogType> = {
  breakfast: "BREAKFAST",
  lunch: "LUNCH",
  dinner: "DINNER",
  snack: "SNACK",
};

/** Converts a persisted backend meal log into a client-side food entry. */
function toFoodItem(log: MealLog): FoodItem {
  return {
    id: log.id,
    name: log.name ?? "",
    quantity: "",
    calories: log.calories ?? 0,
    protein: log.proteinG ?? 0,
    carbs: log.carbsG ?? 0,
    fat: log.fatG ?? 0,
  };
}

/** Start of today (local) — the window used to fetch "today's" meal logs. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

let meals: Meal[] = emptyMeals();
const listeners = new Set<() => void>();

function emit() {
  meals = [...meals];
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return meals;
}

export interface AddFoodPayload {
  slot: MealSlot;
  time: string;
  food: Omit<FoodItem, "id">;
}

export const mealsStore = {
  /**
   * Hydrates today's meals from the backend logs (single source of truth).
   * Called on login / app startup / refresh. Best-effort: on a transient
   * failure the last known cache is kept and retried on next mount.
   */
  async hydrateMealsFromBackend(): Promise<void> {
    try {
      const { logs } = await mealsClient.listMeals(startOfToday());
      meals = MEAL_SLOTS.map(({ slot, label, defaultTime }) => ({
        slot,
        label,
        time: defaultTime,
        foods: logs.filter((log) => SLOT_BY_MEAL_TYPE[log.mealType] === slot).map(toFoodItem),
      }));
      emit();
    } catch {
      // Offline / transient failure: keep the last known cache.
    }
  },
  /**
   * Persists a new food entry to the backend FIRST (single source of truth),
   * then updates the cache from the persisted record. No optimistic update:
   * throws on failure so the caller can surface an error and avoid showing a
   * meal that was never saved. The store never generates its own meal data —
   * the created entry uses the backend `id` and persisted macros; only the
   * display-only `quantity` (not part of the backend contract) is kept from
   * the user's input.
   */
  async addFood({ slot, time, food }: AddFoodPayload): Promise<void> {
    const { log } = await mealsClient.logMeal({
      mealType: MEAL_TYPE_BY_SLOT[slot],
      name: food.name,
      calories: food.calories,
      proteinG: food.protein,
      carbsG: food.carbs,
      fatG: food.fat,
    });
    meals = meals.map((meal) =>
      meal.slot === slot
        ? {
            ...meal,
            time: time || meal.time,
            foods: [...meal.foods, { ...toFoodItem(log), quantity: food.quantity }],
          }
        : meal,
    );
    emit();
  },
  updateFood(slot: MealSlot, foodId: string, patch: Partial<Omit<FoodItem, "id">>) {
    meals = meals.map((meal) =>
      meal.slot === slot
        ? { ...meal, foods: meal.foods.map((f) => (f.id === foodId ? { ...f, ...patch } : f)) }
        : meal,
    );
    emit();
  },
  deleteFood(slot: MealSlot, foodId: string) {
    meals = meals.map((meal) =>
      meal.slot === slot ? { ...meal, foods: meal.foods.filter((f) => f.id !== foodId) } : meal,
    );
    emit();
  },
  reset() {
    meals = MEAL_SLOTS.map(({ slot, label, defaultTime }) => ({
      slot,
      label,
      time: defaultTime,
      foods: [],
    }));
    emit();
  },
};

/** Subscribe to the shared meals list. */
export function useMeals(): Meal[] {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Compute macro/calorie totals across all meals (or a subset). */
export function computeTotals(source: Meal[]): NutritionTotals {
  return source.reduce<NutritionTotals>(
    (acc, meal) => {
      for (const f of meal.foods) {
        acc.calories += f.calories;
        acc.protein += f.protein;
        acc.carbs += f.carbs;
        acc.fat += f.fat;
      }
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

/** Compute totals for a single meal. */
export function mealTotals(meal: Meal): NutritionTotals {
  return computeTotals([meal]);
}
