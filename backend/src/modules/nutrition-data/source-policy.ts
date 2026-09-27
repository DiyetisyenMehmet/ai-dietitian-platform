import type { CanonicalFood, NutritionProviderId } from "./nutrition-data.types";

export type NutritionLookupContext = "GENERAL" | "BARCODE";

const GENERAL_PRIORITY: Record<NutritionProviderId, number> = {
  DIEWISH: 100,
  USDA: 95,
  CNF: 92,
  CIQUAL: 90,
  COFID: 88,
  OPEN_FOOD_FACTS: 70,
};

const BARCODE_PRIORITY: Record<NutritionProviderId, number> = {
  DIEWISH: 100,
  OPEN_FOOD_FACTS: 95,
  USDA: 90,
  CNF: 60,
  CIQUAL: 60,
  COFID: 60,
};

export function sourcePriority(provider: NutritionProviderId, context: NutritionLookupContext): number {
  return (context === "BARCODE" ? BARCODE_PRIORITY : GENERAL_PRIORITY)[provider];
}

/** Select one source; never averages values from potentially different foods/states. */
export function selectPreferredFood(
  candidates: readonly CanonicalFood[],
  context: NutritionLookupContext,
): CanonicalFood | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const priority = sourcePriority(b.provider, context) - sourcePriority(a.provider, context);
    if (priority !== 0) return priority;
    return b.provenance.confidence - a.provenance.confidence;
  })[0] ?? null;
}
