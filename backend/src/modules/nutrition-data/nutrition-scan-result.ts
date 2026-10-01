import { assessBarcodeFoodQuality } from "./barcode-quality";
import { calculatePortion } from "./nutrition-calculator";
import type { CanonicalFood, NutrientValues, NutritionDataBasis, NutritionProvenance } from "./nutrition-data.types";

export type NutritionScanType = "PHOTO" | "BARCODE" | "NUTRITION_LABEL";
export type BarcodeDataQualityStatus = "QUALITY_ACCEPTED" | "QUALITY_PARTIAL";

export interface NormalizedScanIngredient {
  name: string;
  grams: number | null;
  included: boolean;
  confidence: number;
  optional: boolean;
  nutritionSource: {
    provider: string;
    externalId: string;
    confidence: number;
  } | null;
}

export interface NutritionReference {
  basis: NutritionDataBasis;
  description: string;
  grams: number | null;
}

export interface NormalizedNutritionScanResult {
  scanType: NutritionScanType;
  identity: {
    name: string;
    brand: string | null;
    barcode: string | null;
    imageUrl: string | null;
  };
  /** Source/reference serving only. For barcode products this is never user consumption. */
  serving: {
    description: string | null;
    grams: number | null;
    confidence: number | null;
  };
  /** Explicit nutrition declaration basis, separate from package quantity and consumed amount. */
  nutritionReference: NutritionReference;
  /** Additional label-declared nutrition references. These are never consumed amounts. */
  additionalNutritionReferences: Array<{
    basis: NutritionDataBasis;
    description: string;
    grams: number | null;
    preparationState: string;
    nutrients: NutrientValues;
  }>;
  nutrients: {
    per100g: NutrientValues | null;
    perServing: NutrientValues;
    /** Nutrients corresponding exactly to nutritionReference. */
    reference: NutrientValues;
    estimated: boolean;
  };
  ingredients: NormalizedScanIngredient[];
  provenance: {
    nutrition: NutritionProvenance[];
    recognition: "AI_ESTIMATED" | "BARCODE_EXACT" | "OCR_ESTIMATED";
  };
  /** Product data quality. Internal numeric score is deliberately not exposed to clients. */
  dataQuality: {
    status: BarcodeDataQualityStatus;
    level: "HIGH" | "MEDIUM" | "LOW";
    issues: string[];
  } | null;
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

export interface PhotoScanLike {
  dishName: string;
  confidence: number;
  estimatedPortion: string;
  estimatedGrams: number | null;
  totals: NutrientValues;
  disclaimer: string;
  ingredients: Array<{
    name: string;
    estimatedGrams: number | null;
    included: boolean;
    confidence: number;
    optional: boolean;
    matchedFood: { provider: string; externalId: string; confidence: number } | null;
  }>;
}

function productBlock(food: CanonicalFood) {
  return {
    quantity: food.quantity,
    allergens: food.allergens,
    additives: food.additives,
    labels: food.labels,
    vegan: food.vegan,
    vegetarian: food.vegetarian,
    glutenFree: food.glutenFree,
    nutriScore: food.nutriScore,
    novaGroup: food.novaGroup,
  };
}

function nutritionReferenceDescription(
  food: CanonicalFood,
  basis: NutritionDataBasis,
  sourceServingGrams: number | null,
): string {
  const state = food.provenance.preparationState;
  if (basis === "PER_SERVING") {
    const base = food.serving?.description?.trim()
      || (sourceServingGrams ? `${sourceServingGrams} g` : "Kaynak porsiyon");
    if (state === "PREPARED") return `${base} hazırlanmış ürün`;
    if (state === "AS_SOLD") return `${base} hazırlanma öncesi ürün`;
    if (state === "LABEL_REFERENCE_UNSPECIFIED") return `${base} etiket referansı (hazırlanmış ürün olarak yorumlanmaz)`;
    return base;
  }
  if (state === "PREPARED") return "100 g hazırlanmış ürün";
  if (state === "AS_SOLD") return "100 g hazırlanma öncesi ürün";
  if (state === "LABEL_REFERENCE_UNSPECIFIED") return "100 g etiket referansı (hazırlanmış ürün olarak yorumlanmaz)";
  return "100 g";
}

export function toBarcodeScanResult(food: CanonicalFood): NormalizedNutritionScanResult {
  const qualityAssessment = assessBarcodeFoodQuality(food, food.barcode ?? "");
  const dataQuality = {
    status: qualityAssessment.tier === "STRONG"
      ? "QUALITY_ACCEPTED" as const
      : "QUALITY_PARTIAL" as const,
    level: qualityAssessment.trustLevel,
    issues: [...qualityAssessment.issues],
  };
  const sourceServingGrams =
    food.serving?.gramWeight && food.serving.gramWeight > 0 ? food.serving.gramWeight : null;
  // A provider serving is reference metadata only. When the provider did not
  // publish per-serving nutrients, deriving them is allowed only for that
  // declared reference serving and never creates a consumed amount.
  const perServing = food.nutrientsPerServing
    ?? (sourceServingGrams
      ? calculatePortion(food.nutrientsPer100g, sourceServingGrams).nutrients
      : food.nutrientsPer100g);
  const nutritionReference: NutritionReference =
    food.provenance.dataBasis === "PER_SERVING"
      ? {
          basis: "PER_SERVING",
          description: nutritionReferenceDescription(food, "PER_SERVING", sourceServingGrams),
          grams: sourceServingGrams,
        }
      : {
          basis: "PER_100_G",
          description: nutritionReferenceDescription(food, "PER_100_G", sourceServingGrams),
          grams: 100,
        };
  const referenceNutrients =
    nutritionReference.basis === "PER_SERVING" && food.nutrientsPerServing
      ? food.nutrientsPerServing
      : food.nutrientsPer100g;
  return {
    scanType: "BARCODE",
    identity: {
      name: food.displayNameTr || food.name,
      brand: food.brand,
      barcode: food.barcode,
      imageUrl: food.imageUrl,
    },
    serving: {
      description: food.serving?.description ?? null,
      grams: sourceServingGrams,
      confidence: sourceServingGrams !== null || food.serving?.description ? 1 : null,
    },
    nutritionReference,
    additionalNutritionReferences: (food.additionalNutritionReferences ?? []).map((reference) => ({
      basis: reference.basis,
      description: reference.description,
      grams: reference.grams,
      preparationState: reference.preparationState,
      nutrients: reference.nutrients,
    })),
    nutrients: {
      per100g: food.nutrientsPer100g,
      perServing,
      reference: referenceNutrients,
      estimated: false,
    },
    ingredients: food.ingredients.map((name) => ({
      name,
      grams: null,
      included: true,
      confidence: 1,
      optional: false,
      nutritionSource: null,
    })),
    provenance: { nutrition: [food.provenance], recognition: "BARCODE_EXACT" },
    dataQuality,
    product: productBlock(food),
    disclaimer: [
      food.provenance.stale
        ? "Ürün kaynağı geçici olarak doğrulanamadığı için son bilinen önbellek verisi gösteriliyor."
        : null,
    ].filter((value): value is string => Boolean(value)).join(" ") || null,
  };
}

export function toNutritionLabelScanResult(food: CanonicalFood): NormalizedNutritionScanResult {
  const result = toBarcodeScanResult(food);
  return {
    ...result,
    scanType: "NUTRITION_LABEL",
    provenance: { nutrition: [food.provenance], recognition: "OCR_ESTIMATED" },
    disclaimer: [
      "Besin etiketi görselden okunmuş ve kullanıcı tarafından doğrulanmıştır. Bu kayıt yalnız bu kullanıcı için saklanır; global doğrulanmış ürün verisi olarak paylaşılmaz.",
      food.provenance.preparationState === "LABEL_REFERENCE_UNSPECIFIED"
        ? "Ana etiket referansı hazırlanmış içecek/ürün değeri olarak yorumlanmaz; yalnız ambalajda açıkça belirtilen hazırlanmış değerler ayrı referans olarak gösterilir."
        : null,
      result.disclaimer,
    ].filter((value): value is string => Boolean(value)).join(" "),
  };
}

export function toPhotoScanResult(scan: PhotoScanLike): NormalizedNutritionScanResult {
  const nutrition = scan.ingredients
    .filter((item) => item.matchedFood)
    .map((item) => ({
      provider: item.matchedFood!.provider as NutritionProvenance["provider"],
      externalId: item.matchedFood!.externalId,
      retrievedAt: new Date().toISOString(),
      dataBasis: "PER_SERVING" as const,
      confidence: item.matchedFood!.confidence,
    }));
  return {
    scanType: "PHOTO",
    identity: { name: scan.dishName, brand: null, barcode: null, imageUrl: null },
    serving: {
      description: scan.estimatedPortion,
      grams: scan.estimatedGrams,
      confidence: Math.max(0, Math.min(1, scan.confidence / 100)),
    },
    nutritionReference: {
      basis: "PER_SERVING",
      description: scan.estimatedPortion || "Taranan porsiyon",
      grams: scan.estimatedGrams,
    },
    additionalNutritionReferences: [],
    nutrients: {
      per100g: null,
      perServing: scan.totals,
      reference: scan.totals,
      estimated: true,
    },
    ingredients: scan.ingredients.map((item) => ({
      name: item.name,
      grams: item.estimatedGrams,
      included: item.included,
      confidence: Math.max(0, Math.min(1, item.confidence / 100)),
      optional: item.optional,
      nutritionSource: item.matchedFood,
    })),
    provenance: { nutrition, recognition: "AI_ESTIMATED" },
    dataQuality: null,
    product: null,
    disclaimer: scan.disclaimer,
  };
}
