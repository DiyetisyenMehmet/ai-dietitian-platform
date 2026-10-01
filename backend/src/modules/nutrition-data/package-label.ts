import { ApiError } from "../../utils/api-error";
import { calculatePortion } from "./nutrition-calculator";
import { normalizeBarcode } from "./barcode";
import { withProductCatalog } from "./product-catalog";
import { withProductLifecycle } from "./product-lifecycle";
import { withProductUsage } from "./product-usage";
import {
  CORE_NUTRIENT_KEYS,
  EMPTY_NUTRIENTS,
  type AdditionalNutritionReference,
  type CanonicalFood,
  type NutrientValues,
  type NutritionReferenceState,
  type ProductUsageType,
} from "./nutrition-data.types";

export type PackageLabelBasis = "PER_100_G" | "PER_SERVING";
export type PackageLabelReferenceState = "AS_SOLD" | "PREPARED";

export interface PackageLabelNutritionReferenceDraft {
  basis: PackageLabelBasis | null;
  servingGrams: number | null;
  energyKj: number | null;
  nutrients: NutrientValues;
}

export interface PackageLabelDraft {
  productName: string | null;
  brand: string | null;
  quantity: string | null;
  /** Verbatim visible product type/description; never inferred from unseen context. */
  productTypeText?: string | null;
  /** Verbatim visible preparation directions; null when not printed/readable. */
  preparationInstructions?: string | null;
  /** Only set when the nutrition panel explicitly says as-sold/dry or prepared. */
  referenceState?: PackageLabelReferenceState | null;
  basis: PackageLabelBasis | null;
  servingGrams: number | null;
  energyKj: number | null;
  nutrients: NutrientValues;
  /** Separate explicit prepared-product nutrition column, when actually printed. */
  preparedReference?: PackageLabelNutritionReferenceDraft | null;
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

function normalizeNutritionReferenceDraft(value: unknown): PackageLabelNutritionReferenceDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const basis = record.basis === "PER_100_G" || record.basis === "PER_SERVING"
    ? record.basis
    : null;
  const draft: PackageLabelNutritionReferenceDraft = {
    basis,
    servingGrams: positiveOrNull(record.servingGrams, 5_000),
    energyKj: numberOrNull(record.energyKj, 50_000),
    nutrients: nutrientsFromUnknown(record.nutrients),
  };
  const hasVisibleValue =
    draft.energyKj !== null ||
    CORE_NUTRIENT_KEYS.some((key) => draft.nutrients[key] !== null);
  return basis || hasVisibleValue ? draft : null;
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
  const referenceState =
    record.referenceState === "AS_SOLD" || record.referenceState === "PREPARED"
      ? record.referenceState
      : null;
  return {
    productName: text(record.productName, 120),
    brand: text(record.brand, 120),
    quantity: text(record.quantity, 120),
    productTypeText: text(record.productTypeText, 160),
    preparationInstructions: text(record.preparationInstructions, 500),
    referenceState,
    basis,
    servingGrams: positiveOrNull(record.servingGrams, 5_000),
    energyKj: numberOrNull(record.energyKj, 50_000),
    nutrients: nutrientsFromUnknown(record.nutrients),
    preparedReference: normalizeNutritionReferenceDraft(record.preparedReference),
    ingredients: stringArray(record.ingredients, 80, 200),
    allergens: stringArray(record.allergens, 40, 120),
    confidence: Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0,
    warnings: stringArray(record.warnings, 20, 300),
  };
}

function normalizeDeclaredNutrients(input: Pick<PackageLabelDraft, "nutrients" | "energyKj">): NutrientValues {
  const nutrients: NutrientValues = { ...input.nutrients };
  // kJ -> kcal is only a unit normalization of the same visible energy fact.
  // Salt and sodium are deliberately not synthesized from one another: if one
  // is absent on the label it remains null.
  if (nutrients.energyKcal === null && input.energyKj !== null) {
    nutrients.energyKcal = Math.round((input.energyKj / 4.184) * 100) / 100;
  }
  return nutrients;
}

function isCrossContaminationWarning(value: string): boolean {
  const normalized = value.toLocaleLowerCase("tr-TR");
  return /eser|içerebilir|icerebilir|aynı tesiste|ayni tesiste|may contain|traces?|shared facility|same facility|processed in/.test(normalized);
}

export type PackageLabelValidationProfile =
  | "SALT"
  | "OIL"
  | "SWEETENER"
  | "BREWING"
  | "SPICE"
  | "PREPARATION_BASE"
  | "DIRECT_CONSUMPTION"
  | "UNKNOWN";

function isKnown(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function macroKnownCount(nutrients: NutrientValues): number {
  return [nutrients.proteinG, nutrients.carbohydratesG, nutrients.fatG]
    .filter(isKnown).length;
}

function hasAnyDeclaredNutrient(nutrients: NutrientValues): boolean {
  return CORE_NUTRIENT_KEYS.some((key) => isKnown(nutrients[key]));
}

function normalizedEvidence(value: string | null | undefined): string {
  return (value ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[_:/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasExplicitSaltType(draft: PackageLabelDraft): boolean {
  const typeText = normalizedEvidence(draft.productTypeText);
  if (!typeText) return false;
  return /\b(tuz|deniz tuzu|kaya tuzu|sofra tuzu|salt|sea salt|rock salt|table salt|sodium chloride)\b/i.test(typeText);
}

export function resolvePackageLabelValidationProfile(
  food: CanonicalFood,
  draft: PackageLabelDraft,
): PackageLabelValidationProfile {
  if (hasExplicitSaltType(draft)) return "SALT";

  const category = food.productCatalog?.category?.key ?? null;
  const usage = food.productUsage?.type ?? "UNKNOWN";

  if (category === "oils") return "OIL";
  if (category === "sweeteners" || usage === "SWEETENER") return "SWEETENER";
  if (usage === "BREWING" || usage === "BLENDING_AROMA") return "BREWING";
  if (usage === "SPICE" || category === "spices-seasonings") return "SPICE";
  if (usage === "PREPARATION_BASE") return "PREPARATION_BASE";
  if (usage === "DIRECT_CONSUMPTION") return "DIRECT_CONSUMPTION";
  return "UNKNOWN";
}

function validateLogicalNutrition(nutrients: NutrientValues): void {
  if (
    isKnown(nutrients.sugarsG) &&
    isKnown(nutrients.carbohydratesG) &&
    nutrients.sugarsG > nutrients.carbohydratesG + 0.5
  ) {
    throw ApiError.badRequest("Şeker değeri karbonhidrattan yüksek olamaz; etiketi kontrol et.");
  }
  if (
    isKnown(nutrients.saturatedFatG) &&
    isKnown(nutrients.fatG) &&
    nutrients.saturatedFatG > nutrients.fatG + 0.5
  ) {
    throw ApiError.badRequest("Doymuş yağ toplam yağdan yüksek olamaz; etiketi kontrol et.");
  }
  if (
    isKnown(nutrients.sodiumMg) &&
    isKnown(nutrients.saltG) &&
    (nutrients.sodiumMg > 0 || nutrients.saltG > 0)
  ) {
    const expectedSalt = nutrients.sodiumMg * 0.0025;
    const denominator = Math.max(expectedSalt, nutrients.saltG, 0.1);
    if (Math.abs(expectedSalt - nutrients.saltG) / denominator > 0.4) {
      throw ApiError.badRequest("Tuz ve sodyum değerleri birbiriyle uyumlu görünmüyor; etiketi kontrol et.");
    }
  }
}

export function validatePackageLabelNutrition(
  food: CanonicalFood,
  draft: PackageLabelDraft,
  nutrients: NutrientValues,
): PackageLabelValidationProfile {
  const profile = resolvePackageLabelValidationProfile(food, draft);
  switch (profile) {
    case "SALT":
      if (!((isKnown(nutrients.saltG) && nutrients.saltG > 0) || (isKnown(nutrients.sodiumMg) && nutrients.sodiumMg > 0))) {
        throw ApiError.badRequest("Tuz ürününde etiketten tuz veya sodyum değerini doğrulamalısın.");
      }
      break;
    case "OIL":
      if (!isKnown(nutrients.energyKcal) || !isKnown(nutrients.fatG)) {
        throw ApiError.badRequest("Yağ ürününde etiketten enerji ve yağ değerini doğrulamalısın.");
      }
      break;
    case "SWEETENER":
      if (!isKnown(nutrients.energyKcal) || !isKnown(nutrients.carbohydratesG)) {
        throw ApiError.badRequest("Şeker veya tatlandırıcı ürününde etiketten enerji ve karbonhidrat değerini doğrulamalısın.");
      }
      break;
    case "BREWING":
    case "SPICE":
      if (!hasAnyDeclaredNutrient(nutrients)) {
        throw ApiError.badRequest("Bu ürün türünde etikette görünen en az bir besin değerini doğrulamalısın.");
      }
      break;
    case "PREPARATION_BASE":
      if (!isKnown(nutrients.energyKcal) || macroKnownCount(nutrients) < 1) {
        throw ApiError.badRequest("Hazırlanarak tüketilen üründe enerji ve en az bir temel makroyu doğrulamalısın.");
      }
      break;
    case "DIRECT_CONSUMPTION":
    case "UNKNOWN":
      if (!isKnown(nutrients.energyKcal) || macroKnownCount(nutrients) < 2) {
        throw ApiError.badRequest("Etiketten enerji ve en az iki temel makroyu doğrulamalısın.");
      }
      break;
  }

  validateLogicalNutrition(nutrients);
  return profile;
}

function scaledTo100g(nutrients: NutrientValues, servingGrams: number): NutrientValues {
  const factor = 100 / servingGrams;
  const result: NutrientValues = { ...EMPTY_NUTRIENTS };
  for (const key of CORE_NUTRIENT_KEYS) {
    const value = nutrients[key];
    result[key] = value === null ? null : Math.round(value * factor * 100) / 100;
  }
  return result;
}

function preparedNutritionReference(
  input: PackageLabelNutritionReferenceDraft | null | undefined,
): AdditionalNutritionReference | null {
  if (!input) return null;
  if (!input.basis) {
    throw ApiError.badRequest("Hazırlanmış ürün besin referansının 100 g mı porsiyon mu olduğunu doğrulamalısın.");
  }
  if (input.basis === "PER_SERVING" && !input.servingGrams) {
    throw ApiError.badRequest("Hazırlanmış ürün porsiyon referansında porsiyon gramı gereklidir.");
  }

  const nutrients = normalizeDeclaredNutrients(input);
  if (!hasAnyDeclaredNutrient(nutrients)) {
    throw ApiError.badRequest("Hazırlanmış ürün için görünen besin değerlerini doğrulamalısın.");
  }
  validateLogicalNutrition(nutrients);

  const grams = input.basis === "PER_100_G" ? 100 : input.servingGrams;
  return {
    basis: input.basis,
    description: input.basis === "PER_100_G"
      ? "100 g hazırlanmış ürün"
      : `${input.servingGrams} g hazırlanmış ürün porsiyonu`,
    grams: grams ?? null,
    preparationState: "PREPARED",
    nutrients,
  };
}

function primaryPreparationState(
  draft: PackageLabelDraft,
  usageType: ProductUsageType | undefined,
): NutritionReferenceState | null {
  if (draft.referenceState === "AS_SOLD" || draft.referenceState === "PREPARED") {
    return draft.referenceState;
  }
  if (usageType === "BREWING" || usageType === "BLENDING_AROMA" || usageType === "PREPARATION_BASE") {
    return "LABEL_REFERENCE_UNSPECIFIED";
  }
  return null;
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

  const declared = normalizeDeclaredNutrients(draft);
  const per100g = draft.basis === "PER_SERVING"
    ? scaledTo100g(declared, draft.servingGrams!)
    : declared;
  const now = new Date().toISOString();
  const serving = draft.servingGrams
    ? { amount: 1, unit: "serving", gramWeight: draft.servingGrams, description: `${draft.servingGrams} g` }
    : null;
  const preparedReference = preparedNutritionReference(draft.preparedReference);

  let food: CanonicalFood = {
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
    additionalNutritionReferences: preparedReference ? [preparedReference] : [],
    ingredients: draft.ingredients,
    allergens: draft.allergens,
    allergenEvidence: {
      ingredientList: draft.ingredients.length > 0 ? "DECLARED" : "MISSING",
      allergenDeclaration: draft.allergens.length > 0 ? "DECLARED" : "MISSING",
      crossContaminationWarnings: draft.warnings.filter(isCrossContaminationWarning),
    },
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
      dataBasis: draft.basis,
      preparationState: draft.referenceState ?? null,
      confidence: 0.9,
      sourceReference: "USER_CONFIRMED_PACKAGE_LABEL",
      sourceCategories: draft.productTypeText ? [draft.productTypeText] : [],
      preparationInstructions: draft.preparationInstructions ?? null,
      lastValidatedAt: now,
      stale: false,
    },
  };

  food = withProductUsage(food, "USABLE");
  food = withProductCatalog(food, "USABLE");
  food = withProductLifecycle(food);
  food = {
    ...food,
    provenance: {
      ...food.provenance,
      preparationState: primaryPreparationState(draft, food.productUsage?.type),
    },
  };

  validatePackageLabelNutrition(food, draft, per100g);
  return food;
}
