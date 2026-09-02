export interface FoodScanItem {
  name: string;
  /** Human-readable visual portion estimate, e.g. "yaklaşık 1 kase". */
  estimatedPortion: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

export interface FoodScanNutritionTotals {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

/**
 * Provider-agnostic result of food-image classification + visual estimation.
 * Values are estimates only; the user must be able to review them before any
 * meal-log persistence is attempted.
 */
export interface FoodScanResult {
  isFood: boolean;
  /** 0..100 confidence that the image contains analyzable food/beverage. */
  confidence: number;
  reason: string;
  items: FoodScanItem[];
  totals: FoodScanNutritionTotals | null;
  disclaimer: string;
}
