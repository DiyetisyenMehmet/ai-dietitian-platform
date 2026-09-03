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
 * Meals store shared across routes via useSyncExternalStore. The backend is the
 * single source of truth; this cache contains no seeded/demo meals.
 *
 * A backend MealLog containing only `mealType` is reserved as an explicit,
 * reversible "I ate this meal" check-in. It is never rendered as a food and
 * never contributes fake calories/macros.
 */

function emptyMeals(): Meal[] {
  return MEAL_SLOTS.map(({ slot, label, defaultTime }) => ({
    slot,
    label,
    time: defaultTime,
    foods: [],
    isEaten: false,
    checkInId: null,
  }));
}

const SLOT_BY_MEAL_TYPE: Record<MealLogType, MealSlot> = {
  BREAKFAST: "breakfast",
  LUNCH: "lunch",
  DINNER: "dinner",
  SNACK: "snack",
};

const MEAL_TYPE_BY_SLOT: Record<MealSlot, MealLogType> = {
  breakfast: "BREAKFAST",
  lunch: "LUNCH",
  dinner: "DINNER",
  snack: "SNACK",
};

function isMealCheckIn(log: MealLog): boolean {
  return (
    log.name === null &&
    log.calories === null &&
    log.proteinG === null &&
    log.carbsG === null &&
    log.fatG === null &&
    log.sodiumMg === null &&
    log.sugarG === null
  );
}

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
  async hydrateMealsFromBackend(): Promise<void> {
    try {
      const { logs } = await mealsClient.listMeals(startOfToday());
      meals = MEAL_SLOTS.map(({ slot, label, defaultTime }) => {
        const slotLogs = logs.filter((log) => SLOT_BY_MEAL_TYPE[log.mealType] === slot);
        const checkIn = slotLogs.find(isMealCheckIn) ?? null;
        return {
          slot,
          label,
          time: defaultTime,
          foods: slotLogs.filter((log) => !isMealCheckIn(log)).map(toFoodItem),
          isEaten: checkIn !== null,
          checkInId: checkIn?.id ?? null,
        };
      });
      emit();
    } catch {
      // Offline/transient failure: keep last known cache and retry later.
    }
  },

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

  /** Persists a bare MealLog as the explicit "I ate this meal" check-in. */
  async markMealEaten(slot: MealSlot): Promise<void> {
    const current = meals.find((meal) => meal.slot === slot);
    if (current?.isEaten) return;

    const { log } = await mealsClient.logMeal({ mealType: MEAL_TYPE_BY_SLOT[slot] });
    meals = meals.map((meal) =>
      meal.slot === slot ? { ...meal, isEaten: true, checkInId: log.id } : meal,
    );
    emit();
  },

  /** Removes only the explicit check-in; food records are left untouched. */
  async unmarkMealEaten(slot: MealSlot): Promise<void> {
    const current = meals.find((meal) => meal.slot === slot);
    if (!current?.checkInId) return;

    await mealsClient.deleteMeal(current.checkInId);
    meals = meals.map((meal) =>
      meal.slot === slot ? { ...meal, isEaten: false, checkInId: null } : meal,
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

  /** Persist-first deletion prevents removed food from reappearing after refresh. */
  async deleteFood(slot: MealSlot, foodId: string): Promise<void> {
    await mealsClient.deleteMeal(foodId);
    meals = meals.map((meal) =>
      meal.slot === slot ? { ...meal, foods: meal.foods.filter((f) => f.id !== foodId) } : meal,
    );
    emit();
  },

  reset() {
    meals = emptyMeals();
    emit();
  },
};

export function useMeals(): Meal[] {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

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

export function mealTotals(meal: Meal): NutritionTotals {
  return computeTotals([meal]);
}
