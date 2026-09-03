/** The four meal slots tracked in a single day. */
export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

/** A single logged food entry within a meal. */
export interface FoodItem {
  id: string;
  name: string;
  /** Human-readable serving, e.g. "100 g" or "1 porsiyon". */
  quantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** A meal slot with its logged foods, scheduled time and explicit check-in. */
export interface Meal {
  slot: MealSlot;
  label: string;
  /** Local time in HH:MM (24h). */
  time: string;
  foods: FoodItem[];
  /** Explicit user confirmation that this meal was eaten today. */
  isEaten: boolean;
  /** Backend id of the bare MealLog used as the reversible check-in. */
  checkInId: string | null;
}

/** A searchable food from the placeholder catalog (per stated serving). */
export interface FoodCatalogItem {
  id: string;
  name: string;
  serving: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Aggregated macro/calorie totals across meals. */
export interface NutritionTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Legacy fallback goals; active-plan targets are used by production dashboard surfaces. */
export const NUTRITION_GOALS: NutritionTotals = {
  calories: 2200,
  protein: 120,
  carbs: 260,
  fat: 70,
};

/** Ordered slot metadata for consistent rendering. */
export const MEAL_SLOTS: ReadonlyArray<{ slot: MealSlot; label: string; defaultTime: string }> = [
  { slot: "breakfast", label: "Kahvaltı", defaultTime: "08:00" },
  { slot: "lunch", label: "Öğle Yemeği", defaultTime: "13:00" },
  { slot: "dinner", label: "Akşam Yemeği", defaultTime: "19:00" },
  { slot: "snack", label: "Atıştırmalık", defaultTime: "16:00" },
] as const;
