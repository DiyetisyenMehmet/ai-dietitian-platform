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
import {
  mealsClient,
  type MealLog,
  type MealLogType,
} from "@/infrastructure/tracking/meals-client";

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

function isMissingAmount(value: number | null): boolean {
  return typeof value !== "number" || !Number.isFinite(value) || value < 0;
}

function amountOrZero(value: number | null): number {
  return isMissingAmount(value) ? 0 : value!;
}

function toFoodItem(log: MealLog, quantity = ""): FoodItem {
  return {
    id: log.id,
    name: log.name ?? "",
    quantity,
    calories: amountOrZero(log.calories),
    protein: amountOrZero(log.proteinG),
    carbs: amountOrZero(log.carbsG),
    fat: amountOrZero(log.fatG),
    missingNutrition: {
      calories: isMissingAmount(log.calories),
      protein: isMissingAmount(log.proteinG),
      carbs: isMissingAmount(log.carbsG),
      fat: isMissingAmount(log.fatG),
    },
  };
}

let meals: Meal[] = emptyMeals();
let cacheDayKey = localDayKey();
let readiness: DailyDataReadiness = "UNKNOWN";
let sessionVersion = 0;
let writeVersion = 0;
const listeners = new Set<() => void>();
const checkInWrites = new Map<string, Promise<void>>();
let rolloverTimer: ReturnType<typeof setTimeout> | null = null;

function entryCount(source: Meal[]): number {
  return source.reduce((count, meal) => count + meal.foods.length + (meal.checkInId ? 1 : 0), 0);
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
  dayKey?: string;
  food: Omit<FoodItem, "id">;
}

export const mealsStore = {
  getSnapshot,
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
          recordedAt: slotLogs
            .map((log) => log.loggedAt)
            .sort()
            .at(-1),
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

  async addFood({ slot, time, dayKey, food }: AddFoodPayload): Promise<void> {
    const session = sessionVersion;
    ensureCurrentDay();
    if (dayKey && dayKey !== cacheDayKey) throw new Error("Kayıt günü değişti");
    const consumed = new Date();
    const [hour, minute] = time.split(":").map(Number);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Geçersiz tüketim saati");
    consumed.setHours(hour, minute, 0, 0);
    if (consumed.getTime() > Date.now()) throw new Error("Tüketim saati gelecekte olamaz");
    const { log } = await mealsClient.logMeal({
      loggedAt: consumed.toISOString(),
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
            recordedAt: log.loggedAt,
            foods: [...meal.foods, toFoodItem(log, food.quantity)],
          }
        : meal,
    );
    readiness = readiness === "UNKNOWN" ? "UNKNOWN" : "KNOWN";
    emit();
  },

  markMealEaten(slot: MealSlot): Promise<void> {
    const key = `${sessionVersion}:${localDayKey()}:${slot}`;
    const current = checkInWrites.get(key);
    if (current) return current;
    const request = mealsStore.persistMealCheckIn(slot).finally(() => checkInWrites.delete(key));
    checkInWrites.set(key, request);
    return request;
  },

  async persistMealCheckIn(slot: MealSlot): Promise<void> {
    const session = sessionVersion;
    ensureCurrentDay();
    const targetDay = cacheDayKey;
    const current = meals.find((meal) => meal.slot === slot);
    if (current?.isEaten) return;

    let log: MealLog;
    // A refresh/retry observes an existing confirmation before another POST.
    // This is not a substitute for server-side atomic idempotency across devices.
    const existing =
      readiness === "UNKNOWN"
        ? undefined
        : await mealsClient
            .listMeals(startOfLocalDay())
            .then(({ logs }) =>
              logs.find(
                (entry) =>
                  entry.mealType === MEAL_TYPE_BY_SLOT[slot] &&
                  isIsoOnLocalDay(entry.loggedAt, targetDay) &&
                  isMealCheckIn(entry),
              ),
            );
    if (session !== sessionVersion || localDayKey() !== targetDay) return;
    try {
      if (existing) log = existing;
      else ({ log } = await mealsClient.logMeal({ mealType: MEAL_TYPE_BY_SLOT[slot] }));
    } catch (error) {
      if (session !== sessionVersion || localDayKey() !== targetDay) return;
      const { logs } = await mealsClient.listMeals(startOfLocalDay());
      const confirmed = logs.find(
        (entry) =>
          entry.mealType === MEAL_TYPE_BY_SLOT[slot] &&
          isIsoOnLocalDay(entry.loggedAt, targetDay) &&
          isMealCheckIn(entry),
      );
      if (!confirmed) throw error;
      log = confirmed;
    }
    if (session !== sessionVersion) return;
    ensureCurrentDay();
    writeVersion++;
    if (!isIsoOnLocalDay(log.loggedAt, cacheDayKey)) return;

    meals = meals.map((meal) =>
      meal.slot === slot
        ? { ...meal, isEaten: true, checkInId: log.id, recordedAt: log.loggedAt }
        : meal,
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
        ? { ...meal, isEaten: false, checkInId: null }
        : meal,
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
      meal.slot === slot
        ? { ...meal, foods: meal.foods.filter((food) => food.id !== foodId) }
        : meal,
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

/** Presentation-only completeness flags; do not alter the persisted nutrition sums. */
export function findMissingNutrition(source: Meal[]): Record<keyof NutritionTotals, boolean> {
  const foods = source.flatMap((meal) => meal.foods);
  return {
    calories: foods.some((food) => food.missingNutrition?.calories === true),
    protein: foods.some((food) => food.missingNutrition?.protein === true),
    carbs: foods.some((food) => food.missingNutrition?.carbs === true),
    fat: foods.some((food) => food.missingNutrition?.fat === true),
  };
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
