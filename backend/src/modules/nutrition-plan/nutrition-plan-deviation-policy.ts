import type {
  NutritionPlanDeviationScope,
  NutritionPlanDeviationType,
} from "@prisma/client";

export interface DeviationCandidate {
  dayNumber: number;
  mealIndex?: number | null;
  foodIndex?: number | null;
  scope: NutritionPlanDeviationScope;
  type: NutritionPlanDeviationType;
  actualItemName?: string | null;
  actualPortion?: string | null;
  note?: string | null;
}

export interface ExistingDeviation extends DeviationCandidate {
  id: string;
  createdAt: Date;
}

export type DeviationConflictReason =
  | "WHOLE_MEAL_ALREADY_SKIPPED"
  | "FOOD_LEVEL_DEVIATION_ALREADY_EXISTS";

const FOOD_EXCLUSIVE_TYPES = new Set<NutritionPlanDeviationType>([
  "SKIPPED",
  "REPLACED",
  "PORTION_CHANGED",
]);

function normalizedText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function sameIndex(left: number | null | undefined, right: number | null | undefined): boolean {
  return (left ?? null) === (right ?? null);
}

/** Exact semantic duplicate used to make retry/double-submit safe. */
export function findExactDeviationDuplicate(
  existing: readonly ExistingDeviation[],
  candidate: DeviationCandidate,
): ExistingDeviation | null {
  return (
    existing.find(
      (item) =>
        item.dayNumber === candidate.dayNumber &&
        sameIndex(item.mealIndex, candidate.mealIndex) &&
        sameIndex(item.foodIndex, candidate.foodIndex) &&
        item.scope === candidate.scope &&
        item.type === candidate.type &&
        normalizedText(item.actualItemName) === normalizedText(candidate.actualItemName) &&
        normalizedText(item.actualPortion) === normalizedText(candidate.actualPortion) &&
        normalizedText(item.note) === normalizedText(candidate.note),
    ) ?? null
  );
}

/**
 * Enforces mutually exclusive planned-target semantics while deliberately
 * allowing multiple EXTRA records. Whole-meal skip conflicts with food-level
 * skip/replace/portion records for that meal in both directions.
 */
export function findDeviationConflict(
  existing: readonly ExistingDeviation[],
  candidate: DeviationCandidate,
): DeviationConflictReason | null {
  if (candidate.type === "EXTRA") return null;

  if (candidate.scope === "FOOD" && FOOD_EXCLUSIVE_TYPES.has(candidate.type)) {
    const wholeMealSkipped = existing.some(
      (item) =>
        item.dayNumber === candidate.dayNumber &&
        sameIndex(item.mealIndex, candidate.mealIndex) &&
        item.scope === "MEAL" &&
        item.type === "SKIPPED",
    );
    if (wholeMealSkipped) return "WHOLE_MEAL_ALREADY_SKIPPED";

    const foodConflict = existing.some(
      (item) =>
        item.dayNumber === candidate.dayNumber &&
        sameIndex(item.mealIndex, candidate.mealIndex) &&
        sameIndex(item.foodIndex, candidate.foodIndex) &&
        item.scope === "FOOD" &&
        FOOD_EXCLUSIVE_TYPES.has(item.type),
    );
    if (foodConflict) return "FOOD_LEVEL_DEVIATION_ALREADY_EXISTS";
  }

  if (candidate.scope === "MEAL" && candidate.type === "SKIPPED") {
    const foodConflict = existing.some(
      (item) =>
        item.dayNumber === candidate.dayNumber &&
        sameIndex(item.mealIndex, candidate.mealIndex) &&
        item.scope === "FOOD" &&
        FOOD_EXCLUSIVE_TYPES.has(item.type),
    );
    if (foodConflict) return "FOOD_LEVEL_DEVIATION_ALREADY_EXISTS";
  }

  return null;
}
