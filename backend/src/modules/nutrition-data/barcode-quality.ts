import { normalizeBarcode } from "./barcode";
import type { CanonicalFood, NutrientKey, NutrientValues } from "./nutrition-data.types";
import { sourcePriority } from "./source-policy";

export type BarcodeQualityTier = "STRONG" | "USABLE" | "WEAK" | "REJECT";
export type ProductDataTrustLevel = "HIGH" | "MEDIUM" | "LOW";

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
  | "SOURCE_OLD"
  | "STALE_DATA"
  | "PROVENANCE_INCOMPLETE"
  | "CROSS_SOURCE_DISAGREEMENT";

export interface BarcodeQualityAssessment {
  /** Internal evidence score. It is not a probability that the product is correct. */
  score: number;
  tier: BarcodeQualityTier;
  trustLevel: ProductDataTrustLevel;
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
  "energyKcal", "proteinG", "carbohydratesG", "fatG",
];
const SUPPORTING_NUTRIENTS: readonly NutrientKey[] = [
  "saturatedFatG", "sugarsG", "fiberG", "sodiumMg", "saltG",
];
const COMPARABLE_NUTRIENTS: readonly NutrientKey[] = [
  "energyKcal", "proteinG", "carbohydratesG", "fatG", "sodiumMg", "saltG",
];
const TIER_RANK: Record<BarcodeQualityTier, number> = {
  REJECT: 0, WEAK: 1, USABLE: 2, STRONG: 3,
};

type NutritionProfile =
  | "SALT"
  | "OIL"
  | "SWEETENER"
  | "BREWING"
  | "SPICE"
  | "PREPARATION_BASE"
  | "GENERAL";

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
    .replace(/\s+/g, " ")
    .trim();
}
function usefulName(food: CanonicalFood): boolean {
  const name = normalizedText(food.displayNameTr || food.name);
  if (name.length < 3) return false;
  return !new Set(["unknown", "product", "food", "ürün", "barkodlu ürün", "bilinmeyen ürün"]).has(name);
}
function addIssue(issues: BarcodeQualityIssue[], issue: BarcodeQualityIssue): void {
  if (!issues.includes(issue)) issues.push(issue);
}

function nutritionProfile(food: CanonicalFood): NutritionProfile {
  switch (food.productUsage?.type) {
    case "BREWING":
    case "BLENDING_AROMA": return "BREWING";
    case "SPICE": return "SPICE";
    case "SWEETENER": return "SWEETENER";
    case "PREPARATION_BASE": return "PREPARATION_BASE";
    case "COOKING_INGREDIENT":
      if (food.productCatalog?.category?.key === "oils") return "OIL";
      break;
  }
  const catalog = food.productCatalog?.category?.key ?? "";
  if (catalog === "oils") return "OIL";
  if (catalog === "sweeteners") return "SWEETENER";
  if (catalog === "spices-seasonings") return "SPICE";

  const context = normalizedText([
    food.displayNameTr,
    food.name,
    ...(food.provenance.sourceCategories ?? []),
    food.provenance.preparationInstructions ?? "",
  ].join(" "));
  if (/(^|\s)(tuz|salt|sodium chloride|kaya tuzu|deniz tuzu)(\s|$)/i.test(context)) return "SALT";
  if (/\b(zeytinyağı|olive oil|vegetable oil|ayçiçek yağı|cooking oil|bitkisel yağ)\b/i.test(context)) return "OIL";
  if (/\b(şeker|sugar|honey|bal|sweetener|tatlandırıcı|pekmez|molasses)\b/i.test(context)) return "SWEETENER";
  if (/\b(tea|çay|coffee|kahve|infusion|demle|brew)\b/i.test(context)) return "BREWING";
  if (/\b(spice|baharat|çeşni|seasoning|dried herb)\b/i.test(context)) return "SPICE";
  if (/\b(powder mix|drink powder|toz içecek|concentrate|konsantre|hazırlama|prepare|mix with)\b/i.test(context)) {
    return "PREPARATION_BASE";
  }
  return "GENERAL";
}

function nutritionCompletenessScore(food: CanonicalFood, issues: BarcodeQualityIssue[]): number {
  const nutrients = food.nutrientsPer100g;
  const coreKnown = CORE_NUTRIENTS.filter((key) => isKnown(nutrients[key])).length;
  const supportingKnown = SUPPORTING_NUTRIENTS.filter((key) => isKnown(nutrients[key])).length;
  if (coreKnown === 0 && supportingKnown === 0) {
    addIssue(issues, "NO_NUTRITION");
    return 0;
  }

  switch (nutritionProfile(food)) {
    case "SALT":
      return isKnown(nutrients.saltG) || isKnown(nutrients.sodiumMg)
        ? 0.28
        : 0.08 * Math.min(1, (coreKnown + supportingKnown) / 3);
    case "OIL": {
      const required = [nutrients.energyKcal, nutrients.fatG].filter(isKnown).length;
      return 0.28 * (required / 2);
    }
    case "SWEETENER": {
      const required = [nutrients.energyKcal, nutrients.carbohydratesG].filter(isKnown).length;
      const sugarBonus = isKnown(nutrients.sugarsG) ? 0.03 : 0;
      return Math.min(0.28, 0.25 * (required / 2) + sugarBonus);
    }
    case "BREWING":
    case "SPICE": {
      const known = coreKnown + supportingKnown;
      if (known >= 4) return 0.28;
      if (known >= 2) return 0.22;
      return 0.16;
    }
    case "PREPARATION_BASE":
    case "GENERAL":
    default:
      return 0.22 * (coreKnown / CORE_NUTRIENTS.length)
        + 0.06 * Math.min(1, supportingKnown / 3);
  }
}

function logicalNutritionScore(nutrients: NutrientValues, issues: BarcodeQualityIssue[]): number {
  const entries = Object.entries(nutrients) as Array<[NutrientKey, number | null]>;
  if (!entries.some(([, value]) => isKnown(value))) return 0;
  let points = 0.18;

  if (entries.some(([, value]) => isKnown(value) && value < 0)) {
    addIssue(issues, "NEGATIVE_NUTRIENT");
    return 0;
  }

  const gramKeys: readonly NutrientKey[] = [
    "proteinG", "carbohydratesG", "fatG", "saturatedFatG", "sugarsG", "fiberG", "saltG",
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
    if (Math.abs(expectedSalt - nutrients.saltG) / denominator > 0.4) {
      addIssue(issues, "SALT_SODIUM_INCONSISTENCY");
      points -= 0.05;
    }
  }
  return Math.max(0, points);
}

function quantityScore(quantity: string | null, issues: BarcodeQualityIssue[]): number {
  if (!quantity) return 0;
  const normalized = quantity.replace(",", ".");
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(kg|g|gr|mg|ml|l)\b/i);
  if (!match) {
    addIssue(issues, "PACKAGE_QUANTITY_UNVERIFIED");
    return 0;
  }
  const amount = Number(match[1]);
  const unit = match[2].toLocaleLowerCase("tr-TR");
  if (
    !Number.isFinite(amount) || amount <= 0 ||
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
  if (food.provenance.stale) {
    addIssue(issues, "STALE_DATA");
    return 0.01;
  }
  const sourceDate = food.provenance.providerUpdatedAt;
  if (sourceDate) {
    const parsed = new Date(sourceDate);
    if (Number.isFinite(parsed.getTime())) {
      const ageMs = Date.now() - parsed.getTime();
      if (ageMs <= 2 * 365.25 * 24 * 60 * 60 * 1000) return 0.06;
      if (ageMs <= 10 * 365.25 * 24 * 60 * 60 * 1000) return 0.04;
      addIssue(issues, "SOURCE_OLD");
      return 0.015;
    }
  }
  const validated = new Date(food.provenance.lastValidatedAt ?? food.provenance.retrievedAt);
  return Number.isFinite(validated.getTime()) ? 0.03 : 0;
}

function provenanceScore(food: CanonicalFood, issues: BarcodeQualityIssue[]): number {
  let points = 0;
  const retrieved = new Date(food.provenance.lastValidatedAt ?? food.provenance.retrievedAt);
  if (Number.isFinite(retrieved.getTime())) points += 0.02;
  if (
    food.provenance.externalId?.trim() &&
    food.externalId?.trim() &&
    (
      food.provenance.externalId === food.externalId ||
      food.externalId.startsWith("package-consensus:") ||
      food.externalId.startsWith("user-label:")
    )
  ) points += 0.01;

  const source = food.provenance.sourceReference?.trim();
  if (!source) {
    addIssue(issues, "PROVENANCE_INCOMPLETE");
    return points;
  }
  points += 0.02;

  if (source === "DIEWISH_PACKAGE_LABEL_CONSENSUS") points += 0.03;
  else if (source === "USER_CONFIRMED_PACKAGE_LABEL") points += 0.02;
  else if (["USDA", "CNF", "CIQUAL", "COFID"].includes(food.provider)) points += 0.02;
  else if (food.provider === "OPEN_FOOD_FACTS") points += 0.01;

  return Math.min(0.08, points);
}

function seriousNutritionIssue(issues: readonly BarcodeQualityIssue[]): boolean {
  return issues.includes("NUTRIENT_OUT_OF_RANGE") ||
    issues.includes("MACRO_INCONSISTENCY") ||
    issues.includes("SALT_SODIUM_INCONSISTENCY") ||
    issues.includes("CROSS_SOURCE_DISAGREEMENT");
}

function tierFor(score: number, issues: readonly BarcodeQualityIssue[]): BarcodeQualityTier {
  const hardReject = issues.includes("BARCODE_MISMATCH") || issues.includes("NEGATIVE_NUTRIENT");
  if (hardReject || score < 0.45) return "REJECT";
  if (issues.includes("NO_NUTRITION") || score < 0.62) return "WEAK";
  if (score < 0.8 || seriousNutritionIssue(issues)) return "USABLE";
  return "STRONG";
}

function trustLevelFor(
  score: number,
  tier: BarcodeQualityTier,
  issues: readonly BarcodeQualityIssue[],
): ProductDataTrustLevel {
  if (tier === "REJECT" || tier === "WEAK") return "LOW";
  if (issues.includes("STALE_DATA") || issues.includes("SOURCE_OLD")) return "MEDIUM";
  if (tier === "STRONG" && score >= 0.84 && !seriousNutritionIssue(issues)) return "HIGH";
  return "MEDIUM";
}

function finalizeAssessment(
  rawScore: number,
  issues: BarcodeQualityIssue[],
): BarcodeQualityAssessment {
  const score = Math.round(clamp01(rawScore) * 1000) / 1000;
  const tier = tierFor(score, issues);
  const shouldCrossCheck =
    tier !== "STRONG" ||
    issues.includes("SOURCE_OLD") ||
    issues.includes("STALE_DATA") ||
    issues.includes("PACKAGE_QUANTITY_INVALID") ||
    issues.includes("PACKAGE_QUANTITY_UNVERIFIED") ||
    issues.includes("SERVING_OUT_OF_RANGE");
  const persistable =
    tier === "STRONG" ||
    (tier === "USABLE" &&
      score >= 0.72 &&
      !seriousNutritionIssue(issues) &&
      !issues.includes("PACKAGE_QUANTITY_INVALID") &&
      !issues.includes("SERVING_OUT_OF_RANGE"));
  return {
    score,
    tier,
    trustLevel: trustLevelFor(score, tier, issues),
    issues,
    shouldCrossCheck,
    persistable,
  };
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

  score += nutritionCompletenessScore(food, issues);
  score += logicalNutritionScore(food.nutrientsPer100g, issues);
  score += quantityScore(food.quantity, issues);
  score += servingScore(food, issues);
  score += freshnessScore(food, issues);
  score += provenanceScore(food, issues);

  return finalizeAssessment(score, issues);
}

function compareFoods(first: CanonicalFood, second: CanonicalFood): BarcodeCrossSourceComparison {
  const issues: BarcodeCrossSourceComparison["issues"] = [];
  const firstBrand = normalizedText(first.brand);
  const secondBrand = normalizedText(second.brand);
  if (firstBrand && secondBrand && firstBrand !== secondBrand) issues.push("BRAND_DISAGREEMENT");

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
  if (nutritionAgreement !== null && nutritionAgreement < 0.5) issues.push("NUTRIENT_DISAGREEMENT");
  return { nutritionAgreement, issues };
}

function applyCrossSourceEvidence(
  candidate: { food: CanonicalFood; assessment: BarcodeQualityAssessment },
  all: readonly { food: CanonicalFood; assessment: BarcodeQualityAssessment }[],
): { food: CanonicalFood; assessment: BarcodeQualityAssessment } {
  const peers = all.filter(({ food, assessment }) =>
    food !== candidate.food &&
    food.provider !== candidate.food.provider &&
    TIER_RANK[assessment.tier] >= TIER_RANK.USABLE,
  );
  if (peers.length === 0) return candidate;

  let hasConflict = false;
  let hasAgreement = false;
  for (const peer of peers) {
    const comparison = compareFoods(candidate.food, peer.food);
    if (comparison.issues.length > 0) hasConflict = true;
    if (
      comparison.issues.length === 0 &&
      comparison.nutritionAgreement !== null &&
      comparison.nutritionAgreement >= 0.75
    ) {
      hasAgreement = true;
    }
  }

  const issues = [...candidate.assessment.issues];
  let score = candidate.assessment.score;
  if (hasConflict) {
    addIssue(issues, "CROSS_SOURCE_DISAGREEMENT");
    score -= 0.12;
  } else if (hasAgreement) {
    score += 0.06;
  }
  return { food: candidate.food, assessment: finalizeAssessment(score, issues) };
}

export function selectBestBarcodeFood(
  candidates: readonly CanonicalFood[],
  expectedBarcode: string,
): BarcodeSelection | null {
  const base = candidates
    .map((food) => ({ food, assessment: assessBarcodeFoodQuality(food, expectedBarcode) }))
    .filter(({ assessment }) => TIER_RANK[assessment.tier] >= TIER_RANK.USABLE);
  if (base.length === 0) return null;

  const assessed = base.map((candidate) => applyCrossSourceEvidence(candidate, base));
  assessed.sort((a, b) => {
    const tierDifference = TIER_RANK[b.assessment.tier] - TIER_RANK[a.assessment.tier];
    if (tierDifference !== 0) return tierDifference;
    const scoreDifference = b.assessment.score - a.assessment.score;
    if (Math.abs(scoreDifference) >= 0.04) return scoreDifference;
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
