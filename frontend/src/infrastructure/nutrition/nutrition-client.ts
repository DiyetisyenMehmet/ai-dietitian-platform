import { apiRequest } from "@/infrastructure/api/http-client";

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

export type MealTypeDto = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";

export interface NutritionProvenanceDto {
  provider: "USDA" | "OPEN_FOOD_FACTS" | "DIEWISH";
  externalId: string;
  retrievedAt: string;
  dataBasis: "PER_100_G" | "PER_SERVING";
  preparationState?: string | null;
  confidence: number;
  sourceReference?: string | null;
  lastValidatedAt?: string | null;
  dataHash?: string | null;
  stale?: boolean;
  providerUpdatedAt?: string | null;
}

export interface CanonicalFoodDto {
  externalId: string;
  provider: "USDA" | "OPEN_FOOD_FACTS" | "DIEWISH";
  name: string;
  displayNameTr: string;
  brand: string | null;
  barcode: string | null;
  imageUrl: string | null;
  quantity: string | null;
  serving: { amount: number; unit: string; gramWeight: number | null; description?: string | null } | null;
  nutrientsPer100g: NutrientValuesDto;
  nutrientsPerServing?: NutrientValuesDto | null;
  ingredients: string[];
  allergens: string[];
  additives: string[];
  labels: string[];
  vegan: boolean | null;
  vegetarian: boolean | null;
  glutenFree: boolean | null;
  nutriScore: string | null;
  novaGroup: number | null;
  provenance: NutritionProvenanceDto;
}

export interface NormalizedNutritionScanDto {
  scanType: "PHOTO" | "BARCODE" | "NUTRITION_LABEL";
  identity: {
    name: string;
    brand: string | null;
    barcode: string | null;
    imageUrl: string | null;
  };
  serving: { description: string | null; grams: number | null; confidence: number | null };
  nutrients: {
    per100g: NutrientValuesDto | null;
    perServing: NutrientValuesDto;
    estimated: boolean;
  };
  ingredients: Array<{
    name: string;
    grams: number | null;
    included: boolean;
    confidence: number;
    optional: boolean;
    nutritionSource: { provider: string; externalId: string; confidence: number } | null;
  }>;
  provenance: {
    nutrition: NutritionProvenanceDto[];
    recognition: "AI_ESTIMATED" | "BARCODE_EXACT" | "OCR_ESTIMATED";
  };
  product: {
    quantity: string | null;
    allergens: string[];
    additives: string[];
    labels: string[];
    vegan: boolean | null;
    vegetarian: boolean | null;
    glutenFree: boolean | null;
    nutriScore: string | null;
    novaGroup: number | null;
  } | null;
  disclaimer: string | null;
}

export interface PackageLabelDraftDto {
  productName: string | null;
  brand: string | null;
  quantity: string | null;
  basis: "PER_100_G" | "PER_SERVING" | null;
  servingGrams: number | null;
  energyKj: number | null;
  nutrients: NutrientValuesDto;
  ingredients: string[];
  allergens: string[];
  confidence: number;
  warnings: string[];
}

export interface BarcodeHistoryDto {
  barcode: string;
  provider: string | null;
  productName: string | null;
  food: CanonicalFoodDto | null;
  scannedAt: string;
}

export interface NutritionAttentionFlagDto {
  code:
    | "HIGH_SUGARS"
    | "HIGH_SATURATED_FAT"
    | "HIGH_SALT"
    | "HIGH_ENERGY_DENSITY"
    | "PORTION_HIGH_SODIUM"
    | "PORTION_HIGH_SUGARS";
  severity: "INFO" | "WATCH";
  basis: "PER_100_G" | "PORTION";
  message: string;
}

export interface PersonalizationContextDto {
  nutrients: NutrientValuesDto;
  metrics: {
    contribution: {
      caloriesPercent: number | null;
      proteinPercent: number | null;
      carbohydratesPercent: number | null;
      fatPercent: number | null;
    };
    remainingAfter: {
      calories: number | null;
      proteinG: number | null;
      carbohydratesG: number | null;
      fatG: number | null;
    };
    portionFit: "LOW" | "BALANCED" | "HIGH" | "UNKNOWN";
    satiety: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
    lines: string[];
  } | null;
  profileContextUsed: boolean;
  activePlanUsed: boolean;
  dietaryCompatibility: "COMPATIBLE" | "INCOMPATIBLE" | "UNKNOWN";
  allergenDataComplete: boolean;
  warnings: string[];
  attentionFlags: NutritionAttentionFlagDto[];
  windowHours: number;
}

export interface PersonalizationDto extends PersonalizationContextDto {
  grams: number;
}

export interface ComparisonDto {
  source: {
    food: { displayNameTr: string; provider: string };
    grams: number;
    nutrients: NutrientValuesDto;
  };
  comparisons: Array<{
    food: { externalId: string; provider: string; displayNameTr: string };
    servingGrams: number;
    targetCalories: number;
    nutrients: NutrientValuesDto;
    differenceFromSource: Partial<Record<keyof NutrientValuesDto, number>>;
    dietaryCompatibility: "COMPATIBLE" | "INCOMPATIBLE" | "UNKNOWN";
    allergenDataComplete: boolean;
  }>;
  warning: string;
}

export const nutritionClient = {
  barcode(barcode: string) {
    return apiRequest<{
      found: boolean;
      food: CanonicalFoodDto | null;
      scan: NormalizedNutritionScanDto | null;
    }>({
      path: `/nutrition/barcode/${encodeURIComponent(barcode)}`,
      method: "GET",
      auth: true,
    });
  },

  extractPackageLabel(barcode: string, file: File) {
    const form = new FormData();
    form.append("file", file, file.name);
    return apiRequest<{ draft: PackageLabelDraftDto }>({
      path: `/nutrition/barcode/${encodeURIComponent(barcode)}/label-extract`,
      method: "POST",
      auth: true,
      body: form,
    });
  },

  confirmPackageLabel(barcode: string, draft: PackageLabelDraftDto) {
    return apiRequest<{ food: CanonicalFoodDto; scan: NormalizedNutritionScanDto }>({
      path: `/nutrition/barcode/${encodeURIComponent(barcode)}/confirm-label`,
      method: "POST",
      auth: true,
      body: JSON.stringify(draft),
    });
  },

  history(limit = 12) {
    return apiRequest<{ scans: BarcodeHistoryDto[] }>({
      path: `/nutrition/history?limit=${limit}`,
      method: "GET",
      auth: true,
    });
  },

  favorites(limit = 50) {
    return apiRequest<{
      favorites: Array<{
        barcode: string;
        productName: string | null;
        food: CanonicalFoodDto | null;
        createdAt: string;
      }>;
    }>({
      path: `/nutrition/favorites?limit=${limit}`,
      method: "GET",
      auth: true,
    });
  },

  setFavorite(barcode: string, favorite: boolean) {
    return apiRequest<{ favorite: boolean; food: CanonicalFoodDto | null }>({
      path: `/nutrition/barcode/${encodeURIComponent(barcode)}/favorite`,
      method: "POST",
      auth: true,
      body: JSON.stringify({ favorite }),
    });
  },

  personalize(barcode: string, grams: number) {
    return apiRequest<{ personalization: PersonalizationDto }>({
      path: "/nutrition/personalize",
      method: "POST",
      auth: true,
      body: JSON.stringify({ barcode, grams }),
    });
  },

  personalizeNutrients(nutrients: NutrientValuesDto) {
    return apiRequest<{ personalization: PersonalizationContextDto }>({
      path: "/nutrition/personalize-nutrients",
      method: "POST",
      auth: true,
      body: JSON.stringify({ nutrients }),
    });
  },

  compare(barcode: string, grams: number) {
    return apiRequest<{ comparison: ComparisonDto }>({
      path: "/nutrition/compare",
      method: "POST",
      auth: true,
      body: JSON.stringify({ barcode, grams }),
    });
  },

  logMeal(mealType: MealTypeDto, food: CanonicalFoodDto, personalization: PersonalizationDto) {
    const n = personalization.nutrients;
    return apiRequest<{ log: { id: string } }>({
      path: "/tracking/meals",
      method: "POST",
      auth: true,
      body: JSON.stringify({
        mealType,
        name: food.displayNameTr || food.name,
        calories: n.energyKcal ?? undefined,
        proteinG: n.proteinG ?? undefined,
        carbsG: n.carbohydratesG ?? undefined,
        fatG: n.fatG ?? undefined,
        sodiumMg: n.sodiumMg ?? undefined,
        sugarG: n.sugarsG ?? undefined,
      }),
    });
  },
} as const;
