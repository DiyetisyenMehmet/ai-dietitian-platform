import type { CanonicalFoodDto, CoreNutrientKeyDto, NutrientValuesDto } from "@/infrastructure/nutrition/nutrition-client";

export type PackageUnit = "g" | "ml";
export interface PackageSize { amount: number; unit: PackageUnit }
export interface SelectedConsumption {
  amount: number;
  unit: PackageUnit;
  description: string;
}
export const CORE_NUTRIENT_KEYS: readonly CoreNutrientKeyDto[] = [
  "energyKcal", "proteinG", "carbohydratesG", "fatG", "saturatedFatG", "sugarsG",
  "fiberG", "sodiumMg", "saltG",
];
function round(value: number) { return Math.round(value * 10000) / 10000; }

/** Parse only an explicit, unambiguous net quantity. Never assume mass = volume. */
export function parsePackageSize(quantity: string | null | undefined): PackageSize | null {
  if (!quantity) return null;
  const normalized = quantity.trim().toLocaleLowerCase("tr-TR").replace(/,/g, ".");
  const match = /^(?:(\d+(?:\.\d+)?)\s*[x×]\s*)?(\d+(?:\.\d+)?)\s*(ml|cl|l|g|kg)$/.exec(normalized);
  if (!match) return null;
  const packages = match[1] ? Number(match[1]) : 1;
  const size = Number(match[2]);
  const rawUnit = match[3];
  const factor = rawUnit === "l" || rawUnit === "kg" ? 1000 : rawUnit === "cl" ? 10 : 1;
  const amount = packages * size * factor;
  return Number.isFinite(amount) && amount > 0 && amount <= 5000
    ? { amount, unit: rawUnit === "g" || rawUnit === "kg" ? "g" : "ml" } : null;
}

export function volumeReference(food: CanonicalFoodDto): { amount: number; nutrients: NutrientValuesDto } | null {
  const declared = food.serving;
  if (!declared || !food.nutrientsPerServing || declared.unit.toLowerCase() !== "ml") return null;
  if (!Number.isFinite(declared.amount) || declared.amount <= 0) return null;
  return { amount: declared.amount, nutrients: food.nutrientsPerServing };
}

/** Scale only values with an explicit matching physical reference.
 * A 100g reference is NEVER treated as a 100ml reference.
 */
export function nutrientsForAmount(food: CanonicalFoodDto, amount: number, unit: PackageUnit): NutrientValuesDto | null {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 5000) return null;
  const declared = unit === "ml" ? volumeReference(food) : null;
  const source = unit === "ml"
    ? declared?.nutrients
    : food.provenance.dataBasis === "PER_100_G"
      ? food.nutrientsPer100g
      : food.serving?.gramWeight && food.nutrientsPerServing ? food.nutrientsPerServing : null;
  const basisAmount = unit === "ml" ? declared?.amount
    : food.provenance.dataBasis === "PER_100_G" ? 100 : food.serving?.gramWeight;
  if (!source || !basisAmount || !Number.isFinite(basisAmount) || basisAmount <= 0) return null;
  const factor = amount / basisAmount;
  const result = Object.fromEntries(
    CORE_NUTRIENT_KEYS.map((key) => [key, source[key] === null ? null : round(source[key] * factor)]),
  ) as unknown as NutrientValuesDto;
  if (source.micronutrients) {
    result.micronutrients = Object.fromEntries(
      Object.entries(source.micronutrients).map(([key, value]) => [
        key, typeof value === "number" && Number.isFinite(value) ? round(value * factor) : null,
      ]),
    ) as NutrientValuesDto["micronutrients"];
  }
  return result;
}

/** Conversion of an explicitly declared mineral concentration, mg/L -> mg/volume.
 * Applies to concentration data only, never to mass-based food labels.
 */
export function mineralMgForVolume(mgPerLiter: number | null, volumeMl: number): number | null {
  if (mgPerLiter === null || !Number.isFinite(mgPerLiter) || mgPerLiter < 0 ||
    !Number.isFinite(volumeMl) || volumeMl <= 0) return null;
  return round(mgPerLiter * volumeMl / 1000);
}
