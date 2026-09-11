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

export type FoodScanNutritionResolutionMethod =
  | "VERIFIED_SOURCE"
  | "COMPONENT_AGGREGATE"
  | "AI_ESTIMATE"
  | "UNAVAILABLE";

export interface FoodScanNutritionResolution {
  method: FoodScanNutritionResolutionMethod;
  /** Verified upstream providers that contributed facts. Empty for AI estimates. */
  providers: NutritionProviderId[];
  /** 0..1 confidence for the nutrition resolution itself, not visual recognition. */
  confidence: number;
  estimated: boolean;
  note: string;
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
  /** Added after deterministic resolution; AI_ESTIMATE is never a verified source. */
  nutritionResolution?: FoodScanNutritionResolution;
}

export interface FoodScanIngredientCorrection {
  name: string;
  grams: number;
  included: boolean;
}

export interface FoodScanRecalculationResult {
  ingredients: ResolvedFoodScanIngredient[];
  totals: NutrientValues;
  /** Sum of included corrected ingredients after optional deterministic scaling. */
  estimatedGrams: number;
}
