export const MICRONUTRIENT_KEYS = [
  "calcium", "iron", "magnesium", "phosphorus", "potassium", "zinc", "copper",
  "manganese", "selenium", "iodine", "vitaminA", "vitaminC", "vitaminD", "vitaminE",
  "vitaminK", "thiamin", "riboflavin", "niacin", "vitaminB6", "folate", "vitaminB12",
] as const;

export type MicronutrientKey = (typeof MICRONUTRIENT_KEYS)[number];
export type MicronutrientUnit = "mg" | "µg";
export type MicronutrientValues = Record<MicronutrientKey, number | null>;
export type MicronutrientSnapshot = Partial<Record<MicronutrientKey, number>>;

export interface MicronutrientDefinition {
  labelTr: string;
  unit: MicronutrientUnit;
  adultReference: number;
}

export const MICRONUTRIENT_REFERENCE_VERSION = "EU_1169_2011_ANNEX_XIII_ADULT_NRV";
export const MICRONUTRIENT_REFERENCE_SOURCE =
  "Regulation (EU) No 1169/2011, Annex XIII, Part A — adult nutrient reference values";

export const MICRONUTRIENT_DEFINITIONS: Readonly<Record<MicronutrientKey, MicronutrientDefinition>> = {
  calcium: { labelTr: "Kalsiyum", unit: "mg", adultReference: 800 },
  iron: { labelTr: "Demir", unit: "mg", adultReference: 14 },
  magnesium: { labelTr: "Magnezyum", unit: "mg", adultReference: 375 },
  phosphorus: { labelTr: "Fosfor", unit: "mg", adultReference: 700 },
  potassium: { labelTr: "Potasyum", unit: "mg", adultReference: 2000 },
  zinc: { labelTr: "Çinko", unit: "mg", adultReference: 10 },
  copper: { labelTr: "Bakır", unit: "mg", adultReference: 1 },
  manganese: { labelTr: "Manganez", unit: "mg", adultReference: 2 },
  selenium: { labelTr: "Selenyum", unit: "µg", adultReference: 55 },
  iodine: { labelTr: "İyot", unit: "µg", adultReference: 150 },
  vitaminA: { labelTr: "Vitamin A", unit: "µg", adultReference: 800 },
  vitaminC: { labelTr: "Vitamin C", unit: "mg", adultReference: 80 },
  vitaminD: { labelTr: "Vitamin D", unit: "µg", adultReference: 5 },
  vitaminE: { labelTr: "Vitamin E", unit: "mg", adultReference: 12 },
  vitaminK: { labelTr: "Vitamin K", unit: "µg", adultReference: 75 },
  thiamin: { labelTr: "Vitamin B1", unit: "mg", adultReference: 1.1 },
  riboflavin: { labelTr: "Vitamin B2", unit: "mg", adultReference: 1.4 },
  niacin: { labelTr: "Vitamin B3", unit: "mg", adultReference: 16 },
  vitaminB6: { labelTr: "Vitamin B6", unit: "mg", adultReference: 1.4 },
  folate: { labelTr: "Folat (B9)", unit: "µg", adultReference: 200 },
  vitaminB12: { labelTr: "Vitamin B12", unit: "µg", adultReference: 2.5 },
};

export function emptyMicronutrients(): MicronutrientValues {
  return Object.fromEntries(MICRONUTRIENT_KEYS.map((key) => [key, null])) as MicronutrientValues;
}

function normalizedUnit(unit: string | null | undefined): "g" | "mg" | "µg" | null {
  if (!unit) return null;
  const value = unit.trim().toLocaleLowerCase("en-US").replace(/μ/g, "µ");
  if (value === "g" || value === "gram" || value === "grams") return "g";
  if (value === "mg" || value === "milligram" || value === "milligrams") return "mg";
  if (["µg", "ug", "mcg", "microgram", "micrograms"].includes(value)) return "µg";
  return null;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function normalizeMicronutrientAmount(
  key: MicronutrientKey,
  value: number | null | undefined,
  providerUnit: string | null | undefined,
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return null;
  const sourceUnit = normalizedUnit(providerUnit);
  if (!sourceUnit) return null;
  const micrograms = sourceUnit === "g" ? value * 1_000_000 : sourceUnit === "mg" ? value * 1_000 : value;
  return round(MICRONUTRIENT_DEFINITIONS[key].unit === "mg" ? micrograms / 1_000 : micrograms);
}

export function hasMicronutrients(values: MicronutrientValues | null | undefined): values is MicronutrientValues {
  return Boolean(values && MICRONUTRIENT_KEYS.some((key) => values[key] !== null));
}

export function scaleMicronutrients(
  values: MicronutrientValues | null | undefined,
  factor: number,
): MicronutrientValues | null {
  if (!hasMicronutrients(values)) return null;
  const scaled = emptyMicronutrients();
  for (const key of MICRONUTRIENT_KEYS) {
    const value = values[key];
    scaled[key] = value === null ? null : round(value * factor);
  }
  return scaled;
}

export function sumMicronutrients(
  values: readonly (MicronutrientValues | null | undefined)[],
): MicronutrientValues | null {
  const totals = emptyMicronutrients();
  let hasAny = false;
  for (const item of values) {
    if (!item) continue;
    for (const key of MICRONUTRIENT_KEYS) {
      const value = item[key];
      if (value === null || !Number.isFinite(value)) continue;
      totals[key] = round((totals[key] ?? 0) + value);
      hasAny = true;
    }
  }
  return hasAny ? totals : null;
}

export function normalizeMicronutrientSnapshot(value: unknown): MicronutrientValues | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const result = emptyMicronutrients();
  let hasAny = false;
  for (const key of MICRONUTRIENT_KEYS) {
    const raw = record[key];
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
      result[key] = round(raw);
      hasAny = true;
    }
  }
  return hasAny ? result : null;
}

export function toMicronutrientSnapshot(values: MicronutrientValues | null | undefined): MicronutrientSnapshot | null {
  if (!hasMicronutrients(values)) return null;
  const result: MicronutrientSnapshot = {};
  for (const key of MICRONUTRIENT_KEYS) {
    const value = values[key];
    if (value !== null) result[key] = round(value);
  }
  return Object.keys(result).length > 0 ? result : null;
}

export function adultReferenceMicronutrients(): MicronutrientValues {
  return Object.fromEntries(
    MICRONUTRIENT_KEYS.map((key) => [key, MICRONUTRIENT_DEFINITIONS[key].adultReference]),
  ) as MicronutrientValues;
}

export type MicronutrientReferenceReason = "PROFILE_REQUIRED" | "UNDER_18";

export interface MicronutrientReferenceResolution {
  available: boolean;
  population: "ADULTS";
  version: string;
  source: string;
  reason: MicronutrientReferenceReason | null;
  values: MicronutrientValues | null;
}

function ageYearsOnDate(dateOfBirth: Date, asOf: Date): number {
  let age = asOf.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const beforeBirthday =
    asOf.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (asOf.getUTCMonth() === dateOfBirth.getUTCMonth() &&
      asOf.getUTCDate() < dateOfBirth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function resolveMicronutrientReference(
  dateOfBirth: Date | null | undefined,
  asOf = new Date(),
): MicronutrientReferenceResolution {
  const base = {
    population: "ADULTS" as const,
    version: MICRONUTRIENT_REFERENCE_VERSION,
    source: MICRONUTRIENT_REFERENCE_SOURCE,
  };
  if (!dateOfBirth || Number.isNaN(dateOfBirth.getTime())) {
    return {
      ...base,
      available: false,
      reason: "PROFILE_REQUIRED",
      values: null,
    };
  }
  if (ageYearsOnDate(dateOfBirth, asOf) < 18) {
    return {
      ...base,
      available: false,
      reason: "UNDER_18",
      values: null,
    };
  }
  return {
    ...base,
    available: true,
    reason: null,
    values: adultReferenceMicronutrients(),
  };
}
