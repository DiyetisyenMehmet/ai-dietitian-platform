export type NutritionProviderId = "USDA" | "OPEN_FOOD_FACTS" | "DIEWISH";

export type NutritionDataBasis = "PER_100_G" | "PER_SERVING";

export type NutrientKey =
  | "energyKcal"
  | "proteinG"
  | "carbohydratesG"
  | "fatG"
  | "saturatedFatG"
  | "sugarsG"
  | "fiberG"
  | "sodiumMg"
  | "saltG";

export interface NutrientValues {
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

export interface NutritionProvenance {
  provider: NutritionProviderId;
  externalId: string;
  retrievedAt: string;
  dataBasis: NutritionDataBasis;
  preparationState?: string | null;
  confidence: number;
  sourceReference?: string | null;
  /** Timestamp at which Diewish last successfully checked this provider record. */
  lastValidatedAt?: string | null;
  /** Stable server-side hash of the normalized provider payload, when persisted. */
  dataHash?: string | null;
  /** True only when provider refresh failed and a bounded stale cache fallback is being served. */
  stale?: boolean;
  /** Provider-declared update timestamp, when the upstream source exposes one. */
  providerUpdatedAt?: string | null;
}

export interface FoodServing {
  amount: number;
  unit: string;
  gramWeight: number | null;
  description?: string | null;
}

export interface CanonicalFood {
  externalId: string;
  provider: NutritionProviderId;
  name: string;
  displayNameTr: string;
  brand: string | null;
  barcode: string | null;
  imageUrl: string | null;
  quantity: string | null;
  serving: FoodServing | null;
  nutrientsPer100g: NutrientValues;
  ingredients: string[];
  allergens: string[];
  additives: string[];
  labels: string[];
  vegan: boolean | null;
  vegetarian: boolean | null;
  glutenFree: boolean | null;
  nutriScore: string | null;
  novaGroup: number | null;
  provenance: NutritionProvenance;
}

export interface FoodSearchResult {
  foods: CanonicalFood[];
  provider: NutritionProviderId;
}

export interface NutritionProvider {
  readonly id: NutritionProviderId;
  search(query: string, limit?: number): Promise<CanonicalFood[]>;
  getByExternalId(externalId: string): Promise<CanonicalFood | null>;
  getByBarcode?(barcode: string): Promise<CanonicalFood | null>;
}

export interface PortionNutrition {
  grams: number;
  nutrients: NutrientValues;
}

export interface ComparisonCandidate {
  food: CanonicalFood;
  targetCalories: number;
  servingGrams: number | null;
  nutrients: NutrientValues | null;
}

export const EMPTY_NUTRIENTS: NutrientValues = {
  energyKcal: null,
  proteinG: null,
  carbohydratesG: null,
  fatG: null,
  saturatedFatG: null,
  sugarsG: null,
  fiberG: null,
  sodiumMg: null,
  saltG: null,
};
