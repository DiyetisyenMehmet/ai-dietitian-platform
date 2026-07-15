/**
 * Deterministic meal-timing engine.
 *
 * Chooses a number of daily meals and their recommended times / calorie shares
 * based on the weight goal. A muscle-/weight-gain goal favors an extra snack to
 * distribute a calorie surplus; other goals use three balanced main meals plus
 * a light snack. These are general structuring guidelines, not medical advice.
 */

import type { MealSlot, MealTimingRecommendation, WeightGoal } from "../types";

/** Three main meals plus a light afternoon snack (default structure). */
const STANDARD_SLOTS: MealSlot[] = [
  { name: "Breakfast", time: "08:00", calorieShare: 0.3 },
  { name: "Lunch", time: "13:00", calorieShare: 0.35 },
  { name: "Snack", time: "16:30", calorieShare: 0.1 },
  { name: "Dinner", time: "19:30", calorieShare: 0.25 },
];

/** Three main meals plus two snacks to spread a calorie surplus (gain goal). */
const GAIN_SLOTS: MealSlot[] = [
  { name: "Breakfast", time: "08:00", calorieShare: 0.25 },
  { name: "Morning Snack", time: "10:30", calorieShare: 0.1 },
  { name: "Lunch", time: "13:00", calorieShare: 0.3 },
  { name: "Afternoon Snack", time: "16:30", calorieShare: 0.1 },
  { name: "Dinner", time: "19:30", calorieShare: 0.25 },
];

/**
 * Resolves the recommended meal timing for a weight goal.
 *
 * @param goal - The nutritional weight goal.
 * @returns The meal-timing recommendation (slots + count).
 */
export function calculateMealTiming(goal: WeightGoal): MealTimingRecommendation {
  const slots = goal === "GAIN_WEIGHT" ? GAIN_SLOTS : STANDARD_SLOTS;
  return { mealsPerDay: slots.length, slots: slots.map((slot) => ({ ...slot })) };
}
