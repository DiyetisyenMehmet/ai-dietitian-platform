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
  ingredients: string[];
  allergens: string[];
  additives: string[];
  labels: string[];
  vegan: boolean | null;
  vegetarian: boolean | null;
  glutenFree: boolean | null;
  nutriScore: string | null;
  novaGroup: number | null;
  provenance: {
    provider: string;
    externalId: string;
    retrievedAt: string;
    dataBasis: string;
    confidence: number;
    sourceReference?: string | null;
  };
}

export interface BarcodeHistoryDto {
  barcode: string;
  provider: string | null;
  productName: string | null;
  food: CanonicalFoodDto | null;
  scannedAt: string;
}

export const nutritionClient = {
  barcode(barcode: string) {
    return apiRequest<{ found: boolean; food: CanonicalFoodDto | null }>({
      path: `/nutrition/barcode/${encodeURIComponent(barcode)}`,
      method: "GET",
      auth: true,
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
    return apiRequest<{ favorites: Array<{ barcode: string; productName: string | null; food: CanonicalFoodDto | null; createdAt: string }> }>({
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
} as const;
