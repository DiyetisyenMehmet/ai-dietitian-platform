import type { NutrientValues, NutritionProviderId } from "../nutrition-data/nutrition-data.types";

export interface FoodVisionIngredientCandidate {
  name: string;
  estimatedGrams: number | null;
  /** 0..100 visual confidence for this ingredient being present. */
  confidence: number;
  /** True when the ingredient is plausible but not visually certain. */
  optional: boolean;
}

/** Provider output: recognition/portion decomposition only. No nutrient numbers. */
export interface FoodVisionResult {
  isFood: boolean;
  confidence: number;
  reason: string;
  dishName: string | null;
  estimatedPortion: string | null;
  estimatedGrams: number | null;
  ingredients: FoodVisionIngredientCandidate[];
  disclaimer: string;
}

export interface ResolvedFoodScanIngredient extends FoodVisionIngredientCandidate {
  included: boolean;
  matchedFood: {
    externalId: string;
    provider: NutritionProviderId;
    displayNameTr: string;
    confidence: number;
  } | null;
  nutrients: NutrientValues | null;
}

export interface FoodScanResult {
  isFood: boolean;
  confidence: number;
  reason: string;
  dishName: string;
  estimatedPortion: string;
  estimatedGrams: number | null;
  ingredients: ResolvedFoodScanIngredient[];
  totals: NutrientValues;
  disclaimer: string;
}

export interface FoodScanIngredientCorrection {
  name: string;
  grams: number;
  included: boolean;
}
