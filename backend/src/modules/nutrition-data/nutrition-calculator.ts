import type {
  CanonicalFood,
  ComparisonCandidate,
  NutrientValues,
  PortionNutrition,
} from "./nutrition-data.types";

const MAX_SERVING_GRAMS = 5_000;
const NUTRIENT_KEYS = [
  "energyKcal",
  "proteinG",
  "carbohydratesG",
  "fatG",
  "saturatedFatG",
  "sugarsG",
  "fiberG",
  "sodiumMg",
  "saltG",
] as const satisfies readonly (keyof NutrientValues)[];

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function scaleValue(value: number | null, factor: number): number | null {
  return value === null ? null : round(value * factor);
}

export function assertServingGrams(grams: number): void {
  if (!Number.isFinite(grams) || grams <= 0 || grams > MAX_SERVING_GRAMS) {
    throw new RangeError(`Serving grams must be > 0 and <= ${MAX_SERVING_GRAMS}.`);
  }
}

export function calculatePortion(
  nutrientsPer100g: NutrientValues,
  grams: number,
): PortionNutrition {
  assertServingGrams(grams);
  const factor = grams / 100;
  const nutrients = Object.fromEntries(
    NUTRIENT_KEYS.map((key) => [key, scaleValue(nutrientsPer100g[key], factor)]),
  ) as unknown as NutrientValues;
  return { grams: round(grams), nutrients };
}

export function sumPortions(
  portions: readonly { nutrientsPer100g: NutrientValues; grams: number }[],
): NutrientValues {
  const totals: Record<keyof NutrientValues, number | null> = Object.fromEntries(
    NUTRIENT_KEYS.map((key) => [key, null]),
  ) as Record<keyof NutrientValues, number | null>;

  for (const portion of portions) {
    const calculated = calculatePortion(portion.nutrientsPer100g, portion.grams).nutrients;
    for (const key of NUTRIENT_KEYS) {
      const value = calculated[key];
      if (value === null) continue;
      totals[key] = round((totals[key] ?? 0) + value);
    }
  }
  return totals;
}

export function compareByCalories(food: CanonicalFood, targetCalories: number): ComparisonCandidate {
  if (!Number.isFinite(targetCalories) || targetCalories <= 0) {
    throw new RangeError("Target calories must be positive.");
  }
  const kcal = food.nutrientsPer100g.energyKcal;
  if (kcal === null || kcal <= 0) {
    return { food, targetCalories, servingGrams: null, nutrients: null };
  }
  const grams = (targetCalories / kcal) * 100;
  if (grams > MAX_SERVING_GRAMS) {
    return { food, targetCalories, servingGrams: null, nutrients: null };
  }
  const portion = calculatePortion(food.nutrientsPer100g, grams);
  return {
    food,
    targetCalories: round(targetCalories),
    servingGrams: portion.grams,
    nutrients: portion.nutrients,
  };
}
