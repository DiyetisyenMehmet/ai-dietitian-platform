import { env } from "../../../config/env";
import { emptyMicronutrients, normalizeMicronutrientAmount, type MicronutrientKey } from "../micronutrients";
import type {
  CanonicalFood,
  CoreNutrientKey,
  NutrientValues,
  NutritionProvider,
} from "../nutrition-data.types";

const USDA_NUTRIENTS: Record<number, CoreNutrientKey> = {
  1008: "energyKcal",
  1003: "proteinG",
  1005: "carbohydratesG",
  1004: "fatG",
  1258: "saturatedFatG",
  2000: "sugarsG",
  1079: "fiberG",
  1093: "sodiumMg",
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function emptyNutrients(): NutrientValues {
  return {
    energyKcal: null,
    proteinG: null,
    carbohydratesG: null,
    fatG: null,
    saturatedFatG: null,
    sugarsG: null,
    fiberG: null,
    sodiumMg: null,
    saltG: null,
  };
}

function normalizedNutrientName(value: string): string {
  return value.toLocaleLowerCase("en-US").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function micronutrientKey(name: string): MicronutrientKey | null {
  const value = normalizedNutrientName(name);
  const keys: Record<string, MicronutrientKey> = {
    "calcium ca": "calcium", "iron fe": "iron", "magnesium mg": "magnesium",
    "phosphorus p": "phosphorus", "potassium k": "potassium", "zinc zn": "zinc",
    "copper cu": "copper", "manganese mn": "manganese", "selenium se": "selenium",
    "iodine i": "iodine", "vitamin a rae": "vitaminA",
    "vitamin c total ascorbic acid": "vitaminC", "vitamin d d2 d3": "vitaminD",
    "vitamin e alpha tocopherol": "vitaminE", "vitamin k phylloquinone": "vitaminK",
    "thiamin": "thiamin", "riboflavin": "riboflavin", "niacin": "niacin",
    "vitamin b 6": "vitaminB6", "vitamin b6": "vitaminB6", "folate total": "folate",
    "vitamin b 12": "vitaminB12", "vitamin b12": "vitaminB12",
  };
  return keys[value] ?? null;
}

function nutrientValues(food: Record<string, unknown>): NutrientValues {
  const values = emptyNutrients();
  const micronutrients = emptyMicronutrients();
  let hasMicronutrients = false;
  const nutrients = Array.isArray(food.foodNutrients) ? food.foodNutrients : [];
  for (const raw of nutrients) {
    const item = record(raw);
    const nested = record(item.nutrient);
    const id = num(item.nutrientId) ?? num(nested.id);
    const coreKey = id === null ? undefined : USDA_NUTRIENTS[id];
    const value = num(item.value) ?? num(item.amount);
    if (coreKey && value !== null) values[coreKey] = value;

    const name = text(item.nutrientName) ?? text(nested.name);
    const microKey = name ? micronutrientKey(name) : null;
    if (!microKey || value === null) continue;
    const normalized = normalizeMicronutrientAmount(
      microKey,
      value,
      text(item.unitName) ?? text(nested.unitName),
    );
    if (normalized !== null) {
      micronutrients[microKey] = normalized;
      hasMicronutrients = true;
    }
  }
  if (values.sodiumMg !== null && values.saltG === null) {
    values.saltG = Math.round(values.sodiumMg * 0.0025 * 1000) / 1000;
  }
  if (hasMicronutrients) values.micronutrients = micronutrients;
  return values;
}

const TURKISH_TERMS: readonly [RegExp, string][] = [
  [/chicken/gi, "tavuk"],
  [/breast/gi, "göğsü"],
  [/meat only/gi, "yalnız et"],
  [/cooked/gi, "pişmiş"],
  [/roasted/gi, "fırında"],
  [/raw/gi, "çiğ"],
  [/beef/gi, "dana eti"],
  [/egg/gi, "yumurta"],
  [/milk/gi, "süt"],
  [/yogurt/gi, "yoğurt"],
  [/rice/gi, "pirinç"],
  [/lentils?/gi, "mercimek"],
  [/beans?/gi, "fasulye"],
];

export function localizeUsdaName(name: string): string {
  let localized = name;
  for (const [pattern, replacement] of TURKISH_TERMS) localized = localized.replace(pattern, replacement);
  return localized.replace(/\s*,\s*/g, " / ").replace(/\s+/g, " ").trim();
}

export function normalizeUsdaFood(raw: unknown): CanonicalFood | null {
  const food = record(raw);
  const fdcId = num(food.fdcId);
  const description = text(food.description);
  if (fdcId === null || !description) return null;
  const brand = text(food.brandOwner) ?? text(food.brandName);
  const barcode = text(food.gtinUpc);
  const servingSize = num(food.servingSize);
  const servingUnit = text(food.servingSizeUnit);
  const sourceCategories = [text(food.foodCategory), text(food.dataType)]
    .filter((value): value is string => Boolean(value));
  return {
    externalId: String(fdcId),
    provider: "USDA",
    name: description,
    displayNameTr: localizeUsdaName(description),
    brand,
    barcode,
    imageUrl: null,
    quantity: null,
    serving:
      servingSize !== null && servingSize > 0
        ? { amount: servingSize, unit: servingUnit ?? "g", gramWeight: servingUnit?.toLowerCase() === "g" ? servingSize : null }
        : null,
    nutrientsPer100g: nutrientValues(food),
    ingredients: text(food.ingredients)?.split(",").map((v) => v.trim()).filter(Boolean) ?? [],
    allergens: [],
    additives: [],
    labels: [],
    vegan: null,
    vegetarian: null,
    glutenFree: null,
    nutriScore: null,
    novaGroup: null,
    provenance: {
      provider: "USDA",
      externalId: String(fdcId),
      retrievedAt: new Date().toISOString(),
      dataBasis: "PER_100_G",
      preparationState: text(food.foodCategory) ?? text(food.dataType),
      sourceCategories,
      sourceReference: `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${fdcId}`,
    },
  };
}

type FetchLike = typeof fetch;

export class UsdaFoodDataCentralProvider implements NutritionProvider {
  readonly id = "USDA" as const;
  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  isConfigured(): boolean {
    return Boolean(env.USDA_FDC_API_KEY?.trim());
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    if (!this.isConfigured()) return null;
    const separator = path.includes("?") ? "&" : "?";
    const url = `${env.USDA_FDC_BASE_URL.replace(/\/$/, "")}${path}${separator}api_key=${encodeURIComponent(env.USDA_FDC_API_KEY ?? "")}`;
    const response = await this.fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(env.NUTRITION_PROVIDER_TIMEOUT_MS),
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    if (!response.ok) throw new Error(`USDA_FDC_${response.status}`);
    return response.json();
  }

  async search(query: string, limit = 10): Promise<CanonicalFood[]> {
    if (!this.isConfigured()) return [];
    const body = await this.request("/foods/search", {
      method: "POST",
      body: JSON.stringify({ query, pageSize: Math.min(Math.max(limit, 1), 25) }),
    });
    const foods = Array.isArray(record(body).foods) ? (record(body).foods as unknown[]) : [];
    return foods.map(normalizeUsdaFood).filter((food): food is CanonicalFood => food !== null);
  }

  async searchBrandedBarcode(barcode: string): Promise<CanonicalFood | null> {
    if (!this.isConfigured()) return null;
    const body = await this.request("/foods/search", {
      method: "POST",
      body: JSON.stringify({ query: barcode, dataType: ["Branded"], pageSize: 5 }),
    });
    const foods = Array.isArray(record(body).foods) ? (record(body).foods as unknown[]) : [];
    const normalized = foods.map(normalizeUsdaFood).filter((food): food is CanonicalFood => food !== null);
    return normalized.find((food) => food.barcode === barcode || food.barcode === barcode.replace(/^0/, "")) ?? normalized[0] ?? null;
  }

  async getByExternalId(externalId: string): Promise<CanonicalFood | null> {
    if (!/^\d+$/.test(externalId) || !this.isConfigured()) return null;
    const body = await this.request(`/food/${externalId}`);
    return normalizeUsdaFood(body);
  }
}

export const usdaFoodDataCentralProvider = new UsdaFoodDataCentralProvider();
