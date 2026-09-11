import { apiRequest } from "@/infrastructure/api/http-client";
import type { NormalizedNutritionScanDto } from "@/infrastructure/nutrition/nutrition-client";

export interface NutrientValuesDto {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydratesG: number | null;
  fatG: number | null;
  saturatedFatG: number | null;
  sugarsG: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
  saltG: number | null;
}

export interface FoodScanIngredientDto {
  name: string;
  estimatedGrams: number | null;
  confidence: number;
  optional: boolean;
  included: boolean;
  matchedFood: {
    externalId: string;
    provider: "USDA" | "OPEN_FOOD_FACTS" | "DIEWISH";
    displayNameTr: string;
    confidence: number;
  } | null;
  nutrients: NutrientValuesDto | null;
}

export interface FoodScanNutritionResolutionDto {
  method: "VERIFIED_SOURCE" | "COMPONENT_AGGREGATE" | "AI_ESTIMATE" | "UNAVAILABLE";
  providers: Array<"USDA" | "OPEN_FOOD_FACTS" | "DIEWISH">;
  confidence: number;
  estimated: boolean;
  note: string;
}

export interface FoodScanResultDto {
  isFood: boolean;
  confidence: number;
  reason: string;
  dishName: string;
  estimatedPortion: string;
  estimatedGrams: number | null;
  ingredients: FoodScanIngredientDto[];
  totals: NutrientValuesDto;
  disclaimer: string;
  nutritionResolution?: FoodScanNutritionResolutionDto;
}

export type MealTypeDto = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";

export const foodScanClient = {
  analyze(file: File) {
    const form = new FormData();
    form.append("file", file, file.name);
    return apiRequest<{ analysis: FoodScanResultDto; scan: NormalizedNutritionScanDto }>({
      path: "/food-scan/analyze",
      method: "POST",
      auth: true,
      body: form,
    });
  },

  analyzeByName(foodName: string, grams: number) {
    return apiRequest<{ analysis: FoodScanResultDto; scan: NormalizedNutritionScanDto }>({
      path: "/food-scan/analyze-by-name",
      method: "POST",
      auth: true,
      body: JSON.stringify({ foodName, grams }),
    });
  },

  recalculate(
    ingredients: Array<{ name: string; grams: number; included: boolean }>,
    targetGrams?: number,
  ) {
    return apiRequest<{
      analysis: Pick<FoodScanResultDto, "ingredients" | "totals" | "estimatedGrams">;
    }>({
      path: "/food-scan/recalculate",
      method: "POST",
      auth: true,
      body: JSON.stringify({ ingredients, ...(targetGrams === undefined ? {} : { targetGrams }) }),
    });
  },

  logMeal(mealType: MealTypeDto, analysis: FoodScanResultDto) {
    return apiRequest<{ log: { id: string } }>({
      path: "/tracking/meals",
      method: "POST",
      auth: true,
      body: JSON.stringify({
        mealType,
        name: analysis.dishName,
        calories: analysis.totals.energyKcal ?? undefined,
        proteinG: analysis.totals.proteinG ?? undefined,
        carbsG: analysis.totals.carbohydratesG ?? undefined,
        fatG: analysis.totals.fatG ?? undefined,
        sodiumMg: analysis.totals.sodiumMg ?? undefined,
        sugarG: analysis.totals.sugarsG ?? undefined,
      }),
    });
  },
} as const;
