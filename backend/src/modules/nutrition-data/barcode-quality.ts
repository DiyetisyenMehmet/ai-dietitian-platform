import { normalizeBarcode } from "./barcode";
import type { CanonicalFood, NutrientKey, NutrientValues } from "./nutrition-data.types";
import { sourcePriority } from "./source-policy";

export type BarcodeQualityTier = "STRONG" | "USABLE" | "WEAK" | "REJECT";

export type BarcodeQualityIssue =
  | "BARCODE_MISMATCH"
  | "GENERIC_NAME"
  | "NO_NUTRITION"
  | "NEGATIVE_NUTRIENT"
  | "NUTRIENT_OUT_OF_RANGE"
  | "MACRO_INCONSISTENCY"
  | "SALT_SODIUM_INCONSISTENCY"
  | "SERVING_OUT_OF_RANGE"
  | "PACKAGE_QUANTITY_INVALID"
  | "PACKAGE_QUANTITY_UNVERIFIED"
  | "SOURCE_OLD";

export interface BarcodeQualityAssessment {
  score: number;
  tier: BarcodeQualityTier;
  issues: BarcodeQualityIssue[];
  shouldCrossCheck: boolean;
  persistable: boolean;
}

export interface BarcodeCrossSourceComparison {
  nutritionAgreement: number | null;
  issues: Array<"BRAND_DISAGREEMENT" | "NUTRIENT_DISAGREEMENT">;
}

export interface BarcodeSelection {
  food: CanonicalFood;
  assessment: BarcodeQualityAssessment;
  comparison: BarcodeCrossSourceComparison | null;
}

const CORE_NUTRIENTS: readonly NutrientKey[] = [
  "energyKcal",
  "proteinG",
  "carbohydratesG",
  "fatG",
];

const SUPPORTING_NUTRIENTS: readonly NutrientKey[] = [
  "saturatedFatG",
  "sugarsG",
  "fiberG",
  "sodiumMg",
  "saltG",
];

const COMPARABLE_NUTRIENTS: readonly NutrientKey[] = [
  "energyKcal",
  "proteinG",
  "carbohydratesG",
  "fatG",
  "sodiumMg",
  "saltG",
];

const TIER_RANK: Record<BarcodeQualityTier, number> = {
  REJECT: 0,
  WEAK: 1,
  USABLE: 2,
  STRONG: 3,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isKnown(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function normalizedText(value: string | null | undefined): string {
  return (value ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9çğıöşü]+/gi, " ")
    .trim();
}

function usefulName(food: CanonicalFood): boolean {
  const name = normalizedText(food.displayNameTr || food.name);
  if (name.length < 3) return false;
  return !new Set([
    "unknown",
    "product",
    "food",
    "ürün",
    "barkodlu ürün",
    "bilinmeyen ürün",
  ]).has(name);
}

function isSaltLike(food: CanonicalFood): boolean {
  const identity = normalizedText(`${food.displayNameTr} ${food.name}`);
  return /(^|\s)(tuz|salt|sodium chloride|kaya tuzu|deniz tuzu)(\s|$)/i.test(identity);
}

function addIssue(issues: BarcodeQualityIssue[], issue: BarcodeQualityIssue): void {
  if (!issues.includes(issue)) issues.push(issue);
}

function logicalNutritionScore(
  nutrients: NutrientValues,
  issues: BarcodeQualityIssue[],
): number {
  let points = 0.18;
  const entries = Object.entries(nutrients) as Array<[NutrientKey, number | null]>;

  if (entries.some(([, value]) => isKnown(value) && value < 0)) {
    addIssue(issues, "NEGATIVE_NUTRIENT");
    return 0;
  }

  const gramKeys: readonly NutrientKey[] = [
    "proteinG",
    "carbohydratesG",
    "fatG",
    "saturatedFatG",
    "sugarsG",
    "fiberG",
    "saltG",
  ];
  const outOfRange =
    (isKnown(nutrients.energyKcal) && nutrients.energyKcal > 1000) ||
    gramKeys.some((key) => isKnown(nutrients[key]) && nutrients[key]! > 100) ||
    (isKnown(nutrients.sodiumMg) && nutrients.sodiumMg > 100_000);

  if (outOfRange) {
    addIssue(issues, "NUTRIENT_OUT_OF_RANGE");
    points -= 0.1;
  }

  if (
    isKnown(nutrients.saturatedFatG) &&
    isKnown(nutrients.fatG) &&
    nutrients.saturatedFatG > nutrients.fatG + 0.5
  ) {
    addIssue(issues, "MACRO_INCONSISTENCY");
    points -= 0.05;
  }

  if (
    isKnown(nutrients.sugarsG) &&
    isKnown(nutrients.carbohydratesG) &&
    nutrients.sugarsG > nutrients.carbohydratesG + 0.5
  ) {
    addIssue(issues, "MACRO_INCONSISTENCY");
    points -= 0.05;
  }

  if (
    isKnown(nutrients.sodiumMg) &&
    isKnown(nutrients.saltG) &&
    (nutrients.sodiumMg > 0 || nutrients.saltG > 0)
  ) {
    const expectedSalt = nutrients.sodiumMg * 0.0025;
    const denominator = Math.max(expectedSalt, nutrients.saltG, 0.1);
    const relativeDifference = Math.abs(expectedSalt - nutrients.saltG) / denominator;
    if (relativeDifference > 0.4) {
      addIssue(issues, "SALT_SODIUM_INCONSISTENCY");
      points -= 0.05;
    }
  }

  return Math.max(0, points);
}

function quantityScore(quantity: string | null, issues: BarcodeQualityIssue[]): number {
  if (!quantity) return 0;
  const normalized = quantity.replace(",", ".");
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(kg|g|gr|ml|l)\b/i);
  if (!match) {
    addIssue(issues, "PACKAGE_QUANTITY_UNVERIFIED");
    return 0;
  }
  const amount = Number(match[1]);
  const unit = match[2].toLocaleLowerCase("tr-TR");
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    (unit === "kg" && amount > 100) ||
    (unit === "l" && amount > 100) ||
    ((unit === "g" || unit === "gr" || unit === "ml") && amount > 100_000)
  ) {
    addIssue(issues, "PACKAGE_QUANTITY_INVALID");
    return 0;
  }
  return 0.04;
}

function servingScore(food: CanonicalFood, issues: BarcodeQualityIssue[]): number {
  if (!food.serving) return 0;
  const gramWeight = food.serving.gramWeight;
  if (gramWeight !== null) {
    if (!Number.isFinite(gramWeight) || gramWeight <= 0 || gramWeight > 10_000) {
      addIssue(issues, "SERVING_OUT_OF_RANGE");
      return 0;
    }
    return 0.04;
  }
  if (!Number.isFinite(food.serving.amount) || food.serving.amount <= 0) {
    addIssue(issues, "SERVING_OUT_OF_RANGE");
    return 0;
  }
  return 0.02;
}

function freshnessScore(food: CanonicalFood, issues: BarcodeQualityIssue[]): number {
  const sourceDate = food.provenance.providerUpdatedAt;
  if (sourceDate) {
    const parsed = new Date(sourceDate);
    if (Number.isFinite(parsed.getTime())) {
      const ageMs = Date.now() - parsed.getTime();
      if (ageMs <= 10 * 365.25 * 24 * 60 * 60 * 1000) return 0.06;
      addIssue(issues, "SOURCE_OLD");
      return 0.02;
    }
  }
  const retrieved = new Date(food.provenance.retrievedAt);
  return Number.isFinite(retrieved.getTime()) ? 0.03 : 0;
}

export function assessBarcodeFoodQuality(
  food: CanonicalFood,
  expectedBarcodeInput: string,
): BarcodeQualityAssessment {
  const issues: BarcodeQualityIssue[] = [];
  const expectedBarcode = normalizeBarcode(expectedBarcodeInput);
  const actualBarcode = food.barcode ? normalizeBarcode(food.barcode) : null;
  let score = 0;

  if (!expectedBarcode || !actualBarcode || actualBarcode !== expectedBarcode) {
    addIssue(issues, "BARCODE_MISMATCH");
  } else {
    score += 0.22;
  }

  if (usefulName(food)) score += 0.16;
  else addIssue(issues, "GENERIC_NAME");

  if (food.brand?.trim()) score += 0.04;

  const coreKnown = CORE_NUTRIENTS.filter((key) => isKnown(food.nutrientsPer100g[key])).length;
  const supportingKnown = SUPPORTING_NUTRIENTS.filter((key) => isKnown(food.nutrientsPer100g[key])).length;
  const saltLike = isSaltLike(food);

  if (coreKnown === 0 && supportingKnown === 0) {
    addIssue(issues, "NO_NUTRITION");
  } else if (
    saltLike &&
    (isKnown(food.nutrientsPer100g.saltG) || isKnown(food.nutrientsPer100g.sodiumMg))
  ) {
    score += 0.28;
  } else {
    score += 0.22 * (coreKnown / CORE_NUTRIENTS.length);
    score += 0.06 * Math.min(1, supportingKnown / 3);
  }

  score += logicalNutritionScore(food.nutrientsPer100g, issues);
  score += quantityScore(food.quantity, issues);
  score += servingScore(food, issues);
  score += freshnessScore(food, issues);
  score += 0.06 * clamp01(food.provenance.confidence);

  score = Math.round(clamp01(score) * 1000) / 1000;

  const hardReject = issues.includes("BARCODE_MISMATCH") || issues.includes("NEGATIVE_NUTRIENT");
  const seriousNutritionIssue =
    issues.includes("NUTRIENT_OUT_OF_RANGE") ||
    issues.includes("MACRO_INCONSISTENCY") ||
    issues.includes("SALT_SODIUM_INCONSISTENCY");

  let tier: BarcodeQualityTier;
  if (hardReject || score < 0.45) tier = "REJECT";
  else if (issues.includes("NO_NUTRITION") || score < 0.62) tier = "WEAK";
  else if (score < 0.8 || seriousNutritionIssue) tier = "USABLE";
  else tier = "STRONG";

  const shouldCrossCheck =
    tier !== "STRONG" ||
    issues.includes("SOURCE_OLD") ||
    issues.includes("PACKAGE_QUANTITY_INVALID") ||
    issues.includes("PACKAGE_QUANTITY_UNVERIFIED") ||
    issues.includes("SERVING_OUT_OF_RANGE");

  const persistable =
    tier === "STRONG" ||
    (tier === "USABLE" &&
      score >= 0.72 &&
      !seriousNutritionIssue &&
      !issues.includes("PACKAGE_QUANTITY_INVALID") &&
      !issues.includes("SERVING_OUT_OF_RANGE"));

  return { score, tier, issues, shouldCrossCheck, persistable };
}

function compareFoods(
  first: CanonicalFood,
  second: CanonicalFood,
): BarcodeCrossSourceComparison {
  const issues: BarcodeCrossSourceComparison["issues"] = [];
  const firstBrand = normalizedText(first.brand);
  const secondBrand = normalizedText(second.brand);
  if (firstBrand && secondBrand && firstBrand !== secondBrand) {
    issues.push("BRAND_DISAGREEMENT");
  }

  let comparable = 0;
  let agreeing = 0;
  for (const key of COMPARABLE_NUTRIENTS) {
    const a = first.nutrientsPer100g[key];
    const b = second.nutrientsPer100g[key];
    if (!isKnown(a) || !isKnown(b)) continue;
    comparable += 1;
    const denominator = Math.max(Math.abs(a), Math.abs(b), key === "energyKcal" ? 10 : 1);
    if (Math.abs(a - b) / denominator <= 0.25) agreeing += 1;
  }

  const nutritionAgreement = comparable > 0 ? agreeing / comparable : null;
  if (nutritionAgreement !== null && nutritionAgreement < 0.5) {
    issues.push("NUTRIENT_DISAGREEMENT");
  }
  return { nutritionAgreement, issues };
}

export function selectBestBarcodeFood(
  candidates: readonly CanonicalFood[],
  expectedBarcode: string,
): BarcodeSelection | null {
  const assessed = candidates
    .map((food) => ({ food, assessment: assessBarcodeFoodQuality(food, expectedBarcode) }))
    .filter(({ assessment }) => TIER_RANK[assessment.tier] >= TIER_RANK.USABLE);

  if (assessed.length === 0) return null;

  assessed.sort((a, b) => {
    const tierDifference = TIER_RANK[b.assessment.tier] - TIER_RANK[a.assessment.tier];
    if (tierDifference !== 0) return tierDifference;

    const scoreDifference = b.assessment.score - a.assessment.score;
    if (Math.abs(scoreDifference) >= 0.04) return scoreDifference;

    const confidenceDifference = b.food.provenance.confidence - a.food.provenance.confidence;
    if (Math.abs(confidenceDifference) >= 0.1) return confidenceDifference;

    return sourcePriority(b.food.provider, "BARCODE") - sourcePriority(a.food.provider, "BARCODE");
  });

  const winner = assessed[0];
  const runnerUp = assessed[1];
  return {
    food: winner.food,
    assessment: winner.assessment,
    comparison: runnerUp ? compareFoods(winner.food, runnerUp.food) : null,
  };
}
