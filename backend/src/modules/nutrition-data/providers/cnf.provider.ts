import { env } from "../../../config/env";
import { normalizeTurkishSearch } from "../nutrition-query-aliases";
import {
  EMPTY_NUTRIENTS,
  type CanonicalFood,
  type NutrientValues,
  type NutritionProvider,
} from "../nutrition-data.types";

interface CnfFoodRow {
  food_code?: string | number;
  food_description?: string;
}

interface CnfNutrientRow {
  food_code?: string | number;
  nutrient_value?: string | number | null;
  nutrient_name_id?: string | number;
  nutrient_web_name?: string;
  nutrient_source_id?: string | number;
}

interface CachedFoodList {
  expiresAt: number;
  rows: CnfFoodRow[];
}

type FetchLike = typeof fetch;

function records(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
    );
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const result = (value as Record<string, unknown>).result;
    if (Array.isArray(result)) {
      return result.filter((item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
      );
    }
    return [value as Record<string, unknown>];
  }
  return [];
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeName(value: string): string[] {
  return normalizeTurkishSearch(value)
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function lexicalScore(query: string, candidate: string): number {
  const queryTokens = normalizeName(query);
  if (queryTokens.length === 0) return 0;
  const candidateNormalized = normalizeTurkishSearch(candidate);
  const candidateTokens = new Set(normalizeName(candidate));
  const overlap = queryTokens.filter((token) => candidateTokens.has(token)).length;
  const coverage = overlap / queryTokens.length;
  const phraseBonus =
    candidateNormalized.includes(normalizeTurkishSearch(query)) ||
    normalizeTurkishSearch(query).includes(candidateNormalized)
      ? 0.25
      : 0;
  return Math.min(1, coverage * 0.75 + phraseBonus);
}

function nutrientKey(row: CnfNutrientRow): keyof NutrientValues | null {
  const id = Number(row.nutrient_name_id);
  const name = (row.nutrient_web_name ?? "").trim().toLocaleLowerCase("en-US");

  if (id === 208 || /energy.*kcal|calories/.test(name)) return "energyKcal";
  if (id === 203 || /^protein/.test(name)) return "proteinG";
  if (id === 205 || /^carbohydrate/.test(name)) return "carbohydratesG";
  if (id === 204 || /total lipid|total fat|^fat\b/.test(name)) return "fatG";
  if (id === 606 || /saturated.*total|fatty acids, saturated/.test(name)) return "saturatedFatG";
  if (id === 269 || /sugars.*,? total|total sugars/.test(name)) return "sugarsG";
  if (id === 291 || /fibre, total dietary|fiber, total dietary|dietary fibre|dietary fiber/.test(name)) return "fiberG";
  if (id === 307 || /^sodium/.test(name)) return "sodiumMg";
  return null;
}

function sourceConfidence(rows: CnfNutrientRow[]): number {
  const sourceIds = rows
    .map((row) => Number(row.nutrient_source_id))
    .filter((value) => Number.isFinite(value));
  if (sourceIds.some((id) => [3, 7, 17].includes(id))) return 0.96;
  if (sourceIds.some((id) => [9, 10].includes(id))) return 0.92;
  if (sourceIds.some((id) => [2, 4, 16, 51].includes(id))) return 0.9;
  return 0.88;
}

export class CanadianNutrientFileProvider implements NutritionProvider {
  readonly id = "CNF" as const;
  private foodList: CachedFoodList | null = null;

  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  private baseUrl(path: string): string {
    return `${env.CNF_API_BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  }

  private async getJson(path: string): Promise<unknown> {
    const response = await this.fetchImpl(this.baseUrl(path), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(env.NUTRITION_PROVIDER_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`CNF_${response.status}`);
    return response.json();
  }

  private async foods(): Promise<CnfFoodRow[]> {
    if (this.foodList && this.foodList.expiresAt > Date.now()) return this.foodList.rows;
    const body = await this.getJson("food/?lang=en&type=json");
    const rows = records(body).map((item) => ({
      food_code:
        typeof item.food_code === "number" || typeof item.food_code === "string"
          ? item.food_code
          : undefined,
      food_description:
        typeof item.food_description === "string" ? item.food_description : undefined,
    }));
    this.foodList = {
      rows,
      expiresAt: Date.now() + env.CNF_INDEX_CACHE_TTL_HOURS * 60 * 60 * 1000,
    };
    return rows;
  }

  private async foodRow(externalId: string): Promise<CnfFoodRow | null> {
    const body = await this.getJson(
      `food/?lang=en&type=json&id=${encodeURIComponent(externalId)}`,
    );
    const item = records(body)[0];
    if (!item) return null;
    return {
      food_code:
        typeof item.food_code === "number" || typeof item.food_code === "string"
          ? item.food_code
          : undefined,
      food_description:
        typeof item.food_description === "string" ? item.food_description : undefined,
    };
  }

  private async nutrientRows(externalId: string): Promise<CnfNutrientRow[]> {
    const body = await this.getJson(
      `nutrientamount/?lang=en&type=json&id=${encodeURIComponent(externalId)}`,
    );
    return records(body).map((item) => ({
      food_code:
        typeof item.food_code === "number" || typeof item.food_code === "string"
          ? item.food_code
          : undefined,
      nutrient_value:
        typeof item.nutrient_value === "number" ||
        typeof item.nutrient_value === "string"
          ? item.nutrient_value
          : null,
      nutrient_name_id:
        typeof item.nutrient_name_id === "number" ||
        typeof item.nutrient_name_id === "string"
          ? item.nutrient_name_id
          : undefined,
      nutrient_web_name:
        typeof item.nutrient_web_name === "string"
          ? item.nutrient_web_name
          : undefined,
      nutrient_source_id:
        typeof item.nutrient_source_id === "number" ||
        typeof item.nutrient_source_id === "string"
          ? item.nutrient_source_id
          : undefined,
    }));
  }

  private async normalizeFood(row: CnfFoodRow): Promise<CanonicalFood | null> {
    const externalId = String(row.food_code ?? "").trim();
    const name = row.food_description?.trim() ?? "";
    if (!externalId || !name) return null;

    const nutrientRows = await this.nutrientRows(externalId);
    const nutrients: NutrientValues = { ...EMPTY_NUTRIENTS };
    for (const nutrient of nutrientRows) {
      const key = nutrientKey(nutrient);
      if (!key) continue;
      const value = finiteNumber(nutrient.nutrient_value);
      if (value === null) continue;
      nutrients[key] = value;
    }

    if (
      nutrients.energyKcal === null &&
      nutrients.proteinG === null &&
      nutrients.carbohydratesG === null &&
      nutrients.fatG === null
    ) {
      return null;
    }

    return {
      externalId,
      provider: "CNF",
      name,
      displayNameTr: name,
      brand: null,
      barcode: null,
      imageUrl: null,
      quantity: null,
      serving: null,
      nutrientsPer100g: nutrients,
      ingredients: [],
      allergens: [],
      additives: [],
      labels: ["Canadian Nutrient File"],
      vegan: null,
      vegetarian: null,
      glutenFree: null,
      nutriScore: null,
      novaGroup: null,
      provenance: {
        provider: "CNF",
        externalId,
        retrievedAt: new Date().toISOString(),
        dataBasis: "PER_100_G",
        confidence: sourceConfidence(nutrientRows),
        sourceReference:
          "Canadian Nutrient File, Health Canada (2015 API; 2026 dataset sync pending)",
      },
    };
  }

  async search(query: string, limit = 10): Promise<CanonicalFood[]> {
    const bounded = Math.min(Math.max(Math.trunc(limit) || 10, 1), 20);
    const candidates = (await this.foods())
      .filter((row) => row.food_code !== undefined && Boolean(row.food_description))
      .map((row) => ({
        row,
        score: lexicalScore(query, row.food_description ?? ""),
      }))
      .filter((item) => item.score >= 0.55)
      .sort((a, b) => b.score - a.score)
      .slice(0, bounded);

    const foods = await Promise.all(candidates.map((item) => this.normalizeFood(item.row)));
    return foods.filter((food): food is CanonicalFood => food !== null);
  }

  async getByExternalId(externalId: string): Promise<CanonicalFood | null> {
    const row = await this.foodRow(externalId);
    return row ? this.normalizeFood(row) : null;
  }
}

export const canadianNutrientFileProvider = new CanadianNutrientFileProvider();
