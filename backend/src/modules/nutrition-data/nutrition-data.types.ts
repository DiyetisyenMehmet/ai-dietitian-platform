import type { MicronutrientValues } from "./micronutrients";

export type NutritionProviderId = "USDA" | "CNF" | "CIQUAL" | "COFID" | "OPEN_FOOD_FACTS" | "DIEWISH";

export type NutritionDataBasis = "PER_100_G" | "PER_SERVING";

export type ProductUsageType =
  | "DIRECT_CONSUMPTION"
  | "BREWING"
  | "BLENDING_AROMA"
  | "SPICE"
  | "COOKING_INGREDIENT"
  | "SAUCE"
  | "SWEETENER"
  | "PREPARATION_BASE"
  | "UNKNOWN";

export type ProductUsageBasis =
  | "SOURCE_PREPARATION"
  | "SOURCE_CATEGORY"
  | "CORROBORATED_PRODUCT_CONTEXT"
  | "INSUFFICIENT_EVIDENCE"
  | "INSUFFICIENT_DATA_QUALITY"
  | "CONFLICTING_EVIDENCE";

export interface ProductUsage {
  type: ProductUsageType;
  basis: ProductUsageBasis;
  evidence: string[];
}

export interface ProductCatalogNode {
  key: string;
  name: string;
}

export type ProductCatalogCategoryBasis = "SOURCE_CATEGORY" | "UNRESOLVED";
export type ProductCatalogFamilyBasis = "BRAND_PRODUCT_NAME" | "UNRESOLVED";
export type ProductCatalogVariantBasis = "BARCODE" | "PACKAGE_QUANTITY" | "UNRESOLVED";

export interface ProductCatalogIdentity {
  category: ProductCatalogNode | null;
  subcategory: ProductCatalogNode | null;
  brand: ProductCatalogNode | null;
  family: ProductCatalogNode | null;
  variant: (ProductCatalogNode & {
    barcode: string | null;
    packageQuantity: string | null;
  }) | null;
  /** Barcode belongs to the variant level; family identity remains independent from it. */
  barcode: string | null;
  derivation: {
    categoryBasis: ProductCatalogCategoryBasis;
    familyBasis: ProductCatalogFamilyBasis;
    variantBasis: ProductCatalogVariantBasis;
    evidence: string[];
  };
}

export type ProductLifecycleStatus =
  | "ACTIVE"
  | "OLD_VERSION"
  | "DISCONTINUED"
  | "REPLACED"
  | "UNKNOWN";

export interface ProductLifecycleEvidence {
  status: Exclude<ProductLifecycleStatus, "UNKNOWN">;
  sourceReference: string;
  effectiveAt?: string | null;
  replacedByBarcode?: string | null;
}

export interface ProductLifecycle {
  status: ProductLifecycleStatus;
  replacedBy: {
    barcode: string;
    variantKey: string | null;
  } | null;
  source: {
    provider: NutritionProviderId;
    reference: string;
    observedAt: string;
    effectiveAt: string | null;
  } | null;
}

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

export type NutritionReferenceState =
  | "AS_SOLD"
  | "PREPARED"
  | "LABEL_REFERENCE_UNSPECIFIED";

export interface AdditionalNutritionReference {
  basis: NutritionDataBasis;
  description: string;
  grams: number | null;
  preparationState: NutritionReferenceState;
  nutrients: NutrientValues;
}

export interface NutritionProvenance {
  provider: NutritionProviderId;
  externalId: string;
  retrievedAt: string;
  /** Basis used by the upstream/source nutrition declaration, not user consumption. */
  dataBasis: NutritionDataBasis;
  preparationState?: string | null;
  /** Optional source/recognition metadata. Never interpreted as product correctness probability. */
  confidence?: number;
  sourceReference?: string | null;
  /** Timestamp at which Diewish last successfully checked this provider record. */
  lastValidatedAt?: string | null;
  /** Stable server-side hash of the normalized provider payload, when persisted. */
  dataHash?: string | null;
  /** True only when provider refresh failed and a bounded stale cache fallback is being served. */
  stale?: boolean;
  /** Provider-declared update timestamp, when the upstream source exposes one. */
  providerUpdatedAt?: string | null;
  /** Raw provider category hints used only as usage evidence, not a Diewish taxonomy. */
  sourceCategories?: string[];
  /** Provider-declared preparation directions when the source exposes them. */
  preparationInstructions?: string | null;
  /** Explicit real-world lifecycle fact from a trusted existing source. */
  lifecycleEvidence?: ProductLifecycleEvidence | null;
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
  /** Extra label-declared references (for example an explicit prepared-product column). Never user consumption. */
  additionalNutritionReferences?: AdditionalNutritionReference[];
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
  /** Stored with the same canonical product record. Optional for legacy cache rows. */
  productUsage?: ProductUsage;
  /** Normalized catalog identity stored with the same product record. Optional for legacy rows. */
  productCatalog?: ProductCatalogIdentity;
  /** Real-world variant lifecycle. Independent from cache freshness/staleness. */
  productLifecycle?: ProductLifecycle;
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
