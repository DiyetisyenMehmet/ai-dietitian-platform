"use client";

import * as React from "react";

import {
  MEAL_SLOTS,
  type FoodItem,
  type Meal,
  type MealSlot,
  type NutritionTotals,
} from "@/domain/meals/types";
import {
  isIsoOnLocalDay,
  localDayKey,
  msUntilNextLocalDay,
  readinessFromCount,
  startOfLocalDay,
  type DailyDataReadiness,
} from "@/application/health/daily-data-readiness";
import { mealsClient, type MealLog, type MealLogType } from "@/infrastructure/tracking/meals-client";

/**
 * Meals store shared across routes via useSyncExternalStore. The backend is the
 * single source of truth; this cache contains no seeded/demo meals.
 *
 * A backend MealLog containing only mealType is reserved as an explicit,
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

function toFoodItem(log: MealLog, quantity = ""): FoodItem {
  return {
    id: log.id,
    name: log.name ?? "",
    quantity,
    calories: log.calories ?? 0,
    protein: log.proteinG ?? 0,
    carbs: log.carbsG ?? 0,
    fat: log.fatG ?? 0,
  };
}

let meals: Meal[] = emptyMeals();
let cacheDayKey = localDayKey();
let readiness: DailyDataReadiness = "UNKNOWN";
let sessionVersion = 0;
let writeVersion = 0;
const listeners = new Set<() => void>();
let rolloverTimer: ReturnType<typeof setTimeout> | null = null;

function entryCount(source: Meal[]): number {
  return source.reduce(
    (count, meal) => count + meal.foods.length + (meal.checkInId ? 1 : 0),
    0,
  );
}

function emit() {
  meals = [...meals];
  listeners.forEach((listener) => listener());
}

function ensureCurrentDay(): boolean {
  const current = localDayKey();
  if (cacheDayKey === current) return false;
  cacheDayKey = current;
  readiness = "UNKNOWN";
  meals = emptyMeals();
  return true;
}

function scheduleRollover(): void {
  if (typeof window === "undefined" || rolloverTimer !== null || listeners.size === 0) return;
  rolloverTimer = setTimeout(() => {
    rolloverTimer = null;
    if (ensureCurrentDay()) emit();
    scheduleRollover();
  }, msUntilNextLocalDay());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  scheduleRollover();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && rolloverTimer !== null) {
      clearTimeout(rolloverTimer);
      rolloverTimer = null;
    }
  };
}

function getSnapshot() {
  ensureCurrentDay();
  return meals;
}

function getReadinessSnapshot(): DailyDataReadiness {
  ensureCurrentDay();
  return readiness;
}

export interface AddFoodPayload {
  slot: MealSlot;
  time: string;
  food: Omit<FoodItem, "id">;
}

export const mealsStore = {
  async hydrateMealsFromBackend(): Promise<void> {
    const session = sessionVersion;
    const revision = writeVersion;
    const targetDay = localDayKey();
    if (cacheDayKey !== targetDay) {
      cacheDayKey = targetDay;
      readiness = "UNKNOWN";
      meals = emptyMeals();
      emit();
    }

    try {
      const { logs } = await mealsClient.listMeals(startOfLocalDay());
      if (session !== sessionVersion || revision !== writeVersion) return;
      if (localDayKey() !== targetDay) {
        ensureCurrentDay();
        emit();
        return;
      }

      const todayLogs = logs.filter((log) => isIsoOnLocalDay(log.loggedAt, targetDay));
      meals = MEAL_SLOTS.map(({ slot, label, defaultTime }) => {
        const slotLogs = todayLogs.filter((log) => SLOT_BY_MEAL_TYPE[log.mealType] === slot);
        const checkIn = slotLogs.find(isMealCheckIn) ?? null;
        return {
          slot,
          label,
          time: defaultTime,
          foods: slotLogs.filter((log) => !isMealCheckIn(log)).map((log) => toFoodItem(log)),
          isEaten: checkIn !== null,
          checkInId: checkIn?.id ?? null,
        };
      });
      readiness = readinessFromCount(todayLogs.length);
      emit();
    } catch {
      if (session !== sessionVersion || revision !== writeVersion) return;
      if (cacheDayKey === targetDay) {
        readiness = "UNKNOWN";
        emit();
      }
    }
  },

  async addFood({ slot, time, food }: AddFoodPayload): Promise<void> {
    const session = sessionVersion;
    ensureCurrentDay();
    const { log } = await mealsClient.logMeal({
      mealType: MEAL_TYPE_BY_SLOT[slot],
      name: food.name,
      calories: food.calories,
      proteinG: food.protein,
      carbsG: food.carbs,
      fatG: food.fat,
    });
    if (session !== sessionVersion) return;
    ensureCurrentDay();
    writeVersion++;
    if (!isIsoOnLocalDay(log.loggedAt, cacheDayKey)) return;

    meals = meals.map((meal) =>
      meal.slot === slot
        ? {
            ...meal,
            time: time || meal.time,
            foods: [...meal.foods, toFoodItem(log, food.quantity)],
          }
        : meal,
    );
    readiness = readiness === "UNKNOWN" ? "UNKNOWN" : "KNOWN";
    emit();
  },

  async markMealEaten(slot: MealSlot): Promise<void> {
    const session = sessionVersion;
    ensureCurrentDay();
    const current = meals.find((meal) => meal.slot === slot);
    if (current?.isEaten) return;

    const { log } = await mealsClient.logMeal({ mealType: MEAL_TYPE_BY_SLOT[slot] });
    if (session !== sessionVersion) return;
    ensureCurrentDay();
    writeVersion++;
    if (!isIsoOnLocalDay(log.loggedAt, cacheDayKey)) return;

    meals = meals.map((meal) =>
      meal.slot === slot ? { ...meal, isEaten: true, checkInId: log.id } : meal,
    );
    readiness = readiness === "UNKNOWN" ? "UNKNOWN" : "KNOWN";
    emit();
  },

  async unmarkMealEaten(slot: MealSlot): Promise<void> {
    const session = sessionVersion;
    ensureCurrentDay();
    const current = meals.find((meal) => meal.slot === slot);
    if (!current?.checkInId) return;

    await mealsClient.deleteMeal(current.checkInId);
    if (session !== sessionVersion) return;
    ensureCurrentDay();
    writeVersion++;
    meals = meals.map((meal) =>
      meal.slot === slot && meal.checkInId === current.checkInId
        ? { ...meal, isEaten: false, checkInId: null } : meal,
    );
    if (readiness !== "UNKNOWN") readiness = readinessFromCount(entryCount(meals));
    emit();
  },

  async updateFood(
    slot: MealSlot,
    foodId: string,
    patch: Partial<Omit<FoodItem, "id">>,
  ): Promise<void> {
    const session = sessionVersion;
    ensureCurrentDay();
    const { log } = await mealsClient.updateMeal(foodId, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.calories !== undefined ? { calories: patch.calories } : {}),
      ...(patch.protein !== undefined ? { proteinG: patch.protein } : {}),
      ...(patch.carbs !== undefined ? { carbsG: patch.carbs } : {}),
      ...(patch.fat !== undefined ? { fatG: patch.fat } : {}),
    });
    if (session !== sessionVersion) return;
    ensureCurrentDay();
    writeVersion++;

    meals = meals.map((meal) =>
      meal.slot === slot
        ? {
            ...meal,
            foods: meal.foods.map((food) =>
              food.id === foodId
                ? toFoodItem(log, patch.quantity !== undefined ? patch.quantity : food.quantity)
                : food,
            ),
          }
        : meal,
    );
    emit();
  },

  async deleteFood(slot: MealSlot, foodId: string): Promise<void> {
    const session = sessionVersion;
    ensureCurrentDay();
    await mealsClient.deleteMeal(foodId);
    if (session !== sessionVersion) return;
    ensureCurrentDay();
    writeVersion++;
    meals = meals.map((meal) =>
      meal.slot === slot ? { ...meal, foods: meal.foods.filter((food) => food.id !== foodId) } : meal,
    );
    if (readiness !== "UNKNOWN") readiness = readinessFromCount(entryCount(meals));
    emit();
  },

  reset() {
    sessionVersion++;
    writeVersion++;
    cacheDayKey = localDayKey();
    readiness = "UNKNOWN";
    meals = emptyMeals();
    emit();
  },
};

export function useMeals(): Meal[] {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useMealsReadiness(): DailyDataReadiness {
  return React.useSyncExternalStore(subscribe, getReadinessSnapshot, getReadinessSnapshot);
}

export function computeTotals(source: Meal[]): NutritionTotals {
  return source.reduce<NutritionTotals>(
    (acc, meal) => {
      for (const food of meal.foods) {
        acc.calories += food.calories;
        acc.protein += food.protein;
        acc.carbs += food.carbs;
        acc.fat += food.fat;
      }
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function mealTotals(meal: Meal): NutritionTotals {
  return computeTotals([meal]);
}
