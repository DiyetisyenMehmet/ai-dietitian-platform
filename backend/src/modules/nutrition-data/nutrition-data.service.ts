import { env } from "../../config/env";
import { ApiError } from "../../utils/api-error";
import { normalizeBarcode } from "./barcode";
import { NutritionTtlCache } from "./nutrition-cache";
import { nutritionDataRepository, type NutritionDataRepository } from "./nutrition-data.repository";
import type { CanonicalFood } from "./nutrition-data.types";
import { expandNutritionProviderQueries } from "./nutrition-query-aliases";
import { openFoodFactsProvider } from "./providers/open-food-facts.provider";
import { usdaFoodDataCentralProvider } from "./providers/usda.provider";
import { selectPreferredFood } from "./source-policy";

export interface UsdaNutritionProviderPort {
  isConfigured(): boolean;
  search(query: string, limit?: number): Promise<CanonicalFood[]>;
  searchBrandedBarcode(barcode: string): Promise<CanonicalFood | null>;
}

export interface OpenFoodFactsProviderPort {
  getByBarcode(barcode: string): Promise<CanonicalFood | null>;
}

export interface NutritionServiceProviders {
  usda: UsdaNutritionProviderPort;
  openFoodFacts: OpenFoodFactsProviderPort;
}

function providerError(message: string, details?: unknown): ApiError {
  return new ApiError(503, message, { code: "NUTRITION_PROVIDER_UNAVAILABLE", details });
}

function ttlHoursFor(food: CanonicalFood): number {
  return food.provider === "OPEN_FOOD_FACTS"
    ? env.OPEN_FOOD_FACTS_CACHE_TTL_HOURS
    : env.USDA_CACHE_TTL_HOURS;
}

function expiresAt(food: CanonicalFood): Date {
  return new Date(Date.now() + ttlHoursFor(food) * 60 * 60 * 1000);
}

function uniqueFoods(foods: CanonicalFood[], limit: number): CanonicalFood[] {
  const seen = new Set<string>();
  const result: CanonicalFood[] = [];
  for (const food of foods) {
    const key = `${food.provider}:${food.externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(food);
    if (result.length >= limit) break;
  }
  return result;
}

export class NutritionDataService {
  private readonly foodCache = new NutritionTtlCache<CanonicalFood | null>(1_000);
  private readonly searchCache = new NutritionTtlCache<CanonicalFood[]>(250);

  constructor(
    private readonly providers: NutritionServiceProviders,
    private readonly persistence?: NutritionDataRepository,
  ) {}

  async search(queryInput: string, limit = 10): Promise<CanonicalFood[]> {
    const query = queryInput.trim();
    if (query.length < 2 || query.length > 120) {
      throw ApiError.badRequest("Besin araması 2-120 karakter olmalıdır.");
    }
    const boundedLimit = Math.min(Math.max(Math.trunc(limit) || 10, 1), 25);
    const key = `search:${query.toLocaleLowerCase("tr-TR")}:${boundedLimit}`;
    const cached = this.searchCache.lookup(key);
    if (cached.hit) return cached.value ?? [];

    if (this.persistence) {
      const local = await this.persistence.searchLocal(query, boundedLimit);
      if (local.length > 0) {
        this.searchCache.set(key, local, 15 * 60 * 1000);
        return local;
      }
    }

    if (!this.providers.usda.isConfigured()) {
      throw new ApiError(503, "USDA FoodData Central sunucuda yapılandırılmamış.", {
        code: "NUTRITION_PROVIDER_NOT_CONFIGURED",
      });
    }

    try {
      const collected: CanonicalFood[] = [];
      for (const providerQuery of expandNutritionProviderQueries(query)) {
        const remaining = boundedLimit - uniqueFoods(collected, boundedLimit).length;
        if (remaining <= 0) break;
        const foods = await this.providers.usda.search(providerQuery, remaining);
        collected.push(...foods);
        if (uniqueFoods(collected, boundedLimit).length >= boundedLimit) break;
      }
      const foods = uniqueFoods(collected, boundedLimit);
      this.searchCache.set(key, foods, env.USDA_CACHE_TTL_HOURS * 60 * 60 * 1000);
      if (this.persistence) {
        await Promise.all(foods.map((food) => this.persistence!.upsertFood(food, expiresAt(food))));
      }
      return foods;
    } catch (error) {
      throw providerError("Besin veri kaynağına şu anda ulaşılamıyor.", String(error));
    }
  }

  async getByBarcode(input: string): Promise<CanonicalFood | null> {
    const barcode = normalizeBarcode(input);
    if (!barcode) {
      throw new ApiError(400, "Geçersiz veya desteklenmeyen barkod.", { code: "INVALID_BARCODE" });
    }
    const key = `barcode:${barcode}`;
    const cached = this.foodCache.lookup(key);
    if (cached.hit) return cached.value;

    if (this.persistence) {
      const persisted = await this.persistence.getFreshBarcode(barcode);
      if (persisted) {
        this.foodCache.set(key, persisted, 15 * 60 * 1000);
        return persisted;
      }
    }

    let offFood: CanonicalFood | null = null;
    let offError: unknown = null;
    try {
      offFood = await this.providers.openFoodFacts.getByBarcode(barcode);
    } catch (error) {
      offError = error;
    }

    if (offFood) {
      this.foodCache.set(key, offFood, env.OPEN_FOOD_FACTS_CACHE_TTL_HOURS * 60 * 60 * 1000);
      if (this.persistence) await this.persistence.upsertFood(offFood, expiresAt(offFood));
      return offFood;
    }

    let usdaFood: CanonicalFood | null = null;
    let usdaError: unknown = null;
    if (this.providers.usda.isConfigured()) {
      try {
        usdaFood = await this.providers.usda.searchBrandedBarcode(barcode);
      } catch (error) {
        usdaError = error;
      }
    }

    const selected = selectPreferredFood(
      [offFood, usdaFood].filter((value): value is CanonicalFood => value !== null),
      "BARCODE",
    );
    if (selected) {
      const ttlHours = ttlHoursFor(selected);
      this.foodCache.set(key, selected, ttlHours * 60 * 60 * 1000);
      if (this.persistence) await this.persistence.upsertFood(selected, expiresAt(selected));
      return selected;
    }

    if (offError && (usdaError || !this.providers.usda.isConfigured())) {
      throw providerError(
        "Barkod veri kaynaklarına şu anda ulaşılamıyor.",
        `${String(offError)}${usdaError ? `; ${String(usdaError)}` : ""}`,
      );
    }

    this.foodCache.set(key, null, 10 * 60 * 1000);
    return null;
  }

  async recordBarcodeScan(userId: string, input: string, food: CanonicalFood | null): Promise<void> {
    if (!this.persistence) return;
    const barcode = normalizeBarcode(input);
    if (!barcode) return;
    await this.persistence.recordBarcodeScan(userId, barcode, food);
  }

  listRecentScans(userId: string, limit = 20) {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit) || 20, 1), 50);
    return this.persistence?.listRecentScans(userId, boundedLimit) ?? Promise.resolve([]);
  }

  listFavorites(userId: string, limit = 50) {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit) || 50, 1), 100);
    return this.persistence?.listFavorites(userId, boundedLimit) ?? Promise.resolve([]);
  }

  async setFavorite(userId: string, input: string, favorite: boolean): Promise<CanonicalFood | null> {
    const barcode = normalizeBarcode(input);
    if (!barcode) throw new ApiError(400, "Geçersiz barkod.", { code: "INVALID_BARCODE" });
    const food = favorite ? await this.getByBarcode(barcode) : null;
    if (favorite && !food) {
      throw new ApiError(404, "Ürün bulunamadı.", { code: "BARCODE_NOT_FOUND" });
    }
    if (this.persistence) await this.persistence.setFavorite(userId, barcode, food, favorite);
    return food;
  }
}

export const nutritionDataService = new NutritionDataService(
  {
    usda: usdaFoodDataCentralProvider,
    openFoodFacts: openFoodFactsProvider,
  },
  nutritionDataRepository,
);
