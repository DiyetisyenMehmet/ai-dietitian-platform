import { calculatePortion } from "./nutrition-calculator";
import type { CanonicalFood, NutrientValues, NutritionProvenance } from "./nutrition-data.types";

export type NutritionScanType = "PHOTO" | "BARCODE" | "NUTRITION_LABEL";

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

export interface NormalizedNutritionScanResult {
  scanType: NutritionScanType;
  identity: {
    name: string;
    brand: string | null;
    barcode: string | null;
    imageUrl: string | null;
  };
  serving: {
    description: string | null;
    grams: number | null;
    confidence: number | null;
  };
  nutrients: {
    per100g: NutrientValues | null;
    perServing: NutrientValues;
    estimated: boolean;
  };
  ingredients: NormalizedScanIngredient[];
  provenance: {
    nutrition: NutritionProvenance[];
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

export function toBarcodeScanResult(food: CanonicalFood): NormalizedNutritionScanResult {
  const servingGrams = food.serving?.gramWeight && food.serving.gramWeight > 0 ? food.serving.gramWeight : 100;
  const perServing = food.nutrientsPerServing ?? calculatePortion(food.nutrientsPer100g, servingGrams).nutrients;
  return {
    scanType: "BARCODE",
    identity: { name: food.displayNameTr || food.name, brand: food.brand, barcode: food.barcode, imageUrl: food.imageUrl },
    serving: { description: food.serving?.description ?? (servingGrams === 100 ? "100 g" : `${servingGrams} g`), grams: servingGrams, confidence: 1 },
    nutrients: { per100g: food.nutrientsPer100g, perServing, estimated: false },
    ingredients: food.ingredients.map((name) => ({ name, grams: null, included: true, confidence: 1, optional: false, nutritionSource: null })),
    provenance: { nutrition: [food.provenance], recognition: "BARCODE_EXACT" },
    product: productBlock(food),
    disclaimer: food.provenance.stale ? "Ürün kaynağı geçici olarak doğrulanamadığı için son bilinen önbellek verisi gösteriliyor." : null,
  };
}

export function toNutritionLabelScanResult(food: CanonicalFood): NormalizedNutritionScanResult {
  const result = toBarcodeScanResult(food);
  return {
    ...result,
    scanType: "NUTRITION_LABEL",
    provenance: { nutrition: [food.provenance], recognition: "OCR_ESTIMATED" },
    disclaimer: "Besin etiketi görselden okunmuş ve kullanıcı tarafından doğrulanmıştır. Bu kayıt yalnız bu kullanıcı için saklanır; global doğrulanmış ürün verisi olarak paylaşılmaz.",
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
    serving: { description: scan.estimatedPortion, grams: scan.estimatedGrams, confidence: Math.max(0, Math.min(1, scan.confidence / 100)) },
    nutrients: { per100g: null, perServing: scan.totals, estimated: true },
    ingredients: scan.ingredients.map((item) => ({
      name: item.name,
      grams: item.estimatedGrams,
      included: item.included,
      confidence: Math.max(0, Math.min(1, item.confidence / 100)),
      optional: item.optional,
      nutritionSource: item.matchedFood,
    })),
    provenance: { nutrition, recognition: "AI_ESTIMATED" },
    product: null,
    disclaimer: scan.disclaimer,
  };
}
