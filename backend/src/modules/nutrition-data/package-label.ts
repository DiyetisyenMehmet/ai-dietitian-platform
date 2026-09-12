import { ApiError } from "../../utils/api-error";
import { calculatePortion } from "./nutrition-calculator";
import { normalizeBarcode } from "./barcode";
import { EMPTY_NUTRIENTS, type CanonicalFood, type NutrientValues } from "./nutrition-data.types";

export type PackageLabelBasis = "PER_100_G" | "PER_SERVING";

export interface PackageLabelDraft {
  productName: string | null;
  brand: string | null;
  quantity: string | null;
  basis: PackageLabelBasis | null;
  servingGrams: number | null;
  energyKj: number | null;
  nutrients: NutrientValues;
  ingredients: string[];
  allergens: string[];
  confidence: number;
  warnings: string[];
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, max) : null;
}

function numberOrNull(value: unknown, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) return null;
  return Math.round(parsed * 100) / 100;
}

function positiveOrNull(value: unknown, max: number): number | null {
  const parsed = numberOrNull(value, max);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function stringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => text(item, maxLength))
    .filter((item): item is string => Boolean(item)))]
    .slice(0, maxItems);
}

function nutrientsFromUnknown(value: unknown): NutrientValues {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    energyKcal: numberOrNull(record.energyKcal, 10_000),
    proteinG: numberOrNull(record.proteinG, 1_000),
    carbohydratesG: numberOrNull(record.carbohydratesG, 1_000),
    fatG: numberOrNull(record.fatG, 1_000),
    saturatedFatG: numberOrNull(record.saturatedFatG, 1_000),
    sugarsG: numberOrNull(record.sugarsG, 1_000),
    fiberG: numberOrNull(record.fiberG, 1_000),
    sodiumMg: numberOrNull(record.sodiumMg, 100_000),
    saltG: numberOrNull(record.saltG, 1_000),
  };
}

export function normalizePackageLabelDraft(value: unknown): PackageLabelDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw ApiError.badRequest("Besin etiketi sonucu geçersiz.");
  }
  const record = value as Record<string, unknown>;
  const basis = record.basis === "PER_100_G" || record.basis === "PER_SERVING"
    ? record.basis
    : null;
  const confidenceRaw = Number(record.confidence);
  return {
    productName: text(record.productName, 120),
    brand: text(record.brand, 120),
    quantity: text(record.quantity, 120),
    basis,
    servingGrams: positiveOrNull(record.servingGrams, 5_000),
    energyKj: numberOrNull(record.energyKj, 50_000),
    nutrients: nutrientsFromUnknown(record.nutrients),
    ingredients: stringArray(record.ingredients, 80, 200),
    allergens: stringArray(record.allergens, 40, 120),
    confidence: Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0,
    warnings: stringArray(record.warnings, 20, 300),
  };
}

function fillEnergyAndSalt(input: PackageLabelDraft): NutrientValues {
  const nutrients: NutrientValues = { ...input.nutrients };
  if (nutrients.energyKcal === null && input.energyKj !== null) {
    nutrients.energyKcal = Math.round((input.energyKj / 4.184) * 100) / 100;
  }
  if (nutrients.sodiumMg === null && nutrients.saltG !== null) {
    nutrients.sodiumMg = Math.round(nutrients.saltG * 400 * 100) / 100;
  }
  if (nutrients.saltG === null && nutrients.sodiumMg !== null) {
    nutrients.saltG = Math.round((nutrients.sodiumMg / 400) * 1000) / 1000;
  }
  return nutrients;
}

function hasUsefulCore(nutrients: NutrientValues): boolean {
  const macros = [nutrients.proteinG, nutrients.carbohydratesG, nutrients.fatG]
    .filter((value) => value !== null).length;
  return nutrients.energyKcal !== null && macros >= 2;
}

function scaledTo100g(nutrients: NutrientValues, servingGrams: number): NutrientValues {
  const factor = 100 / servingGrams;
  const result = { ...EMPTY_NUTRIENTS };
  for (const key of Object.keys(result) as (keyof NutrientValues)[]) {
    const value = nutrients[key];
    result[key] = value === null ? null : Math.round(value * factor * 100) / 100;
  }
  return result;
}

export function buildUserConfirmedPackageLabelFood(
  barcodeInput: string,
  input: PackageLabelDraft,
): CanonicalFood {
  const barcode = normalizeBarcode(barcodeInput);
  if (!barcode) throw ApiError.badRequest("Geçersiz veya desteklenmeyen barkod.");
  const draft = normalizePackageLabelDraft(input);
  const productName = draft.productName?.trim();
  if (!productName || productName.length < 2) {
    throw ApiError.badRequest("Ürün adını etiketten doğrulamalısın.");
  }
  if (!draft.basis) throw ApiError.badRequest("Besin değerlerinin 100 g mı porsiyon mu olduğunu doğrulamalısın.");
  if (draft.basis === "PER_SERVING" && !draft.servingGrams) {
    throw ApiError.badRequest("Porsiyon bazlı etikette porsiyon gramı gereklidir.");
  }

  const declared = fillEnergyAndSalt(draft);
  const per100g = draft.basis === "PER_SERVING"
    ? scaledTo100g(declared, draft.servingGrams!)
    : declared;
  if (!hasUsefulCore(per100g)) {
    throw ApiError.badRequest("Etiketten enerji ve en az iki temel makroyu doğrulamalısın.");
  }
  if (per100g.sugarsG !== null && per100g.carbohydratesG !== null && per100g.sugarsG > per100g.carbohydratesG + 0.5) {
    throw ApiError.badRequest("Şeker değeri karbonhidrattan yüksek olamaz; etiketi kontrol et.");
  }
  if (per100g.saturatedFatG !== null && per100g.fatG !== null && per100g.saturatedFatG > per100g.fatG + 0.5) {
    throw ApiError.badRequest("Doymuş yağ toplam yağdan yüksek olamaz; etiketi kontrol et.");
  }

  const now = new Date().toISOString();
  const serving = draft.servingGrams
    ? { amount: 1, unit: "serving", gramWeight: draft.servingGrams, description: `${draft.servingGrams} g` }
    : null;
  return {
    externalId: `user-label:${barcode}`,
    provider: "DIEWISH",
    name: productName,
    displayNameTr: productName,
    brand: draft.brand,
    barcode,
    imageUrl: null,
    quantity: draft.quantity,
    serving,
    nutrientsPer100g: per100g,
    nutrientsPerServing: serving
      ? (draft.basis === "PER_SERVING" ? declared : calculatePortion(per100g, serving.gramWeight!).nutrients)
      : null,
    ingredients: draft.ingredients,
    allergens: draft.allergens,
    additives: [],
    labels: ["user-confirmed-package-label"],
    vegan: null,
    vegetarian: null,
    glutenFree: null,
    nutriScore: null,
    novaGroup: null,
    provenance: {
      provider: "DIEWISH",
      externalId: `user-label:${barcode}`,
      retrievedAt: now,
      dataBasis: "PER_100_G",
      confidence: 0.9,
      sourceReference: "USER_CONFIRMED_PACKAGE_LABEL",
      lastValidatedAt: now,
      stale: false,
    },
  };
}
