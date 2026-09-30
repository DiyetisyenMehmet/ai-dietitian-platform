import type { MicronutrientValues } from "./micronutrients";

export type NutritionProviderId = "USDA" | "CNF" | "CIQUAL" | "COFID" | "OPEN_FOOD_FACTS" | "DIEWISH";

export type NutritionDataBasis = "PER_100_G" | "PER_SERVING";

export const CORE_NUTRIENT_KEYS = [
  "energyKcal",
  "proteinG",
  "carbohydratesG",
  "fatG",
  "saturatedFatG",
  "sugarsG",
  "fiberG",
  "sodiumMg",
  "saltG",
] as const;

export type CoreNutrientKey = (typeof CORE_NUTRIENT_KEYS)[number];
export type NutrientKey = CoreNutrientKey;

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
  micronutrients?: MicronutrientValues | null;
}

export interface NutritionProvenance {
  provider: NutritionProviderId;
  externalId: string;
  retrievedAt: string;
  /** Basis used by the upstream/source nutrition declaration, not user consumption. */
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

export type AllergenDataPresence = "DECLARED" | "MISSING";

export interface AllergenEvidence {
  ingredientList: AllergenDataPresence;
  allergenDeclaration: AllergenDataPresence;
  /** Source-declared "may contain", trace, or shared-facility statements only. */
  crossContaminationWarnings: string[];
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
  /** Package/net quantity printed or declared for the whole product. Never consumption. */
  quantity: string | null;
  /** Provider-declared reference serving. Never interpreted as the user's consumed amount. */
  serving: FoodServing | null;
  nutrientsPer100g: NutrientValues;
  /** Provider-declared per-serving values when supplied upstream; never inferred here. */
  nutrientsPerServing?: NutrientValues | null;
  ingredients: string[];
  allergens: string[];
  /** Optional for legacy/cache rows. Missing evidence is treated as UNKNOWN, never safe. */
  allergenEvidence?: AllergenEvidence;
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
