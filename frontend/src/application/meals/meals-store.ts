"use client";

import * as React from "react";

import {
  MEAL_SLOTS,
  type FoodItem,
  type Meal,
  type MealSlot,
  type NutritionTotals,
} from "@/domain/meals/types";

/**
 * Lightweight in-memory meals store shared across routes via useSyncExternalStore.
 * Stands in for a backend/global data layer with no external dependencies; state
 * lives for the browser session only (placeholder behavior).
 */

let uid = 0;
const nextId = () => `food-${Date.now()}-${uid++}`;

function seed(): Meal[] {
  return [
    {
      slot: "breakfast",
      label: "Kahvaltı",
      time: "08:15",
      foods: [
        {
          id: nextId(),
          name: "Yulaf Ezmesi",
          quantity: "40 g",
          calories: 150,
          protein: 5,
          carbs: 27,
          fat: 3,
        },
        {
          id: nextId(),
          name: "Yoğurt (yağlı)",
          quantity: "150 g",
          calories: 90,
          protein: 8,
          carbs: 7,
          fat: 5,
        },
        {
          id: nextId(),
          name: "Muz",
          quantity: "1 orta boy",
          calories: 105,
          protein: 1,
          carbs: 27,
          fat: 0,
        },
      ],
    },
    {
      slot: "lunch",
      label: "Öğle Yemeği",
      time: "13:00",
      foods: [
        {
          id: nextId(),
          name: "Izgara Tavuk Göğsü",
          quantity: "100 g",
          calories: 165,
          protein: 31,
          carbs: 0,
          fat: 4,
        },
        {
          id: nextId(),
          name: "Pirinç Pilavı",
          quantity: "150 g",
          calories: 205,
          protein: 4,
          carbs: 44,
          fat: 1,
        },
        {
          id: nextId(),
          name: "Mevsim Salata",
          quantity: "1 porsiyon",
          calories: 70,
          protein: 2,
          carbs: 9,
          fat: 3,
        },
      ],
    },
    { slot: "dinner", label: "Akşam Yemeği", time: "19:30", foods: [] },
    {
      slot: "snack",
      label: "Atıştırmalık",
      time: "16:00",
      foods: [
        {
          id: nextId(),
          name: "Badem",
          quantity: "30 g",
          calories: 180,
          protein: 6,
          carbs: 6,
          fat: 15,
        },
      ],
    },
  ];
}

let meals: Meal[] = seed();
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
  addFood({ slot, time, food }: AddFoodPayload) {
    meals = meals.map((meal) =>
      meal.slot === slot
        ? { ...meal, time: time || meal.time, foods: [...meal.foods, { ...food, id: nextId() }] }
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
