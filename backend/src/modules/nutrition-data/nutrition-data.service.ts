import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { ApiError } from "../../utils/api-error";
import { normalizeBarcode } from "./barcode";
import { NutritionTtlCache } from "./nutrition-cache";
import {
  nutritionDataRepository,
  type NutritionDataRepository,
  type PhotoScanHistoryInput,
} from "./nutrition-data.repository";
import type { CanonicalFood } from "./nutrition-data.types";
import { rankNutritionMatches } from "./nutrition-match";
import { expandNutritionProviderQueries } from "./nutrition-query-aliases";
import { canadianNutrientFileProvider } from "./providers/cnf.provider";
import { openFoodFactsProvider } from "./providers/open-food-facts.provider";
import { usdaFoodDataCentralProvider } from "./providers/usda.provider";
import { selectPreferredFood } from "./source-policy";

export interface UsdaNutritionProviderPort {
  isConfigured(): boolean;
  search(query: string, limit?: number): Promise<CanonicalFood[]>;
  searchBrandedBarcode(barcode: string): Promise<CanonicalFood | null>;
}

export interface GeneralNutritionProviderPort {
  search(query: string, limit?: number): Promise<CanonicalFood[]>;
}

export interface OpenFoodFactsProviderPort {
  search?(query: string, limit?: number): Promise<CanonicalFood[]>;
  getByBarcode(barcode: string): Promise<CanonicalFood | null>;
}

export interface NutritionServiceProviders {
  usda: UsdaNutritionProviderPort;
  cnf?: GeneralNutritionProviderPort;
  openFoodFacts: OpenFoodFactsProviderPort;
}

function providerError(message: string, details?: unknown): ApiError {
  return new ApiError(503, message, { code: "NUTRITION_PROVIDER_UNAVAILABLE", details });
}

function ttlHoursFor(food: CanonicalFood): number {
  if (food.provider === "OPEN_FOOD_FACTS") return env.OPEN_FOOD_FACTS_CACHE_TTL_HOURS;
  if (food.provider === "CNF") return env.CNF_CACHE_TTL_HOURS;
  return env.USDA_CACHE_TTL_HOURS;
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

async function timedProvider<T>(provider: string, operation: string, task: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const value = await task();
    logger.info({ event: "nutrition_provider_latency", provider, operation, latencyMs: Date.now() - startedAt, ok: true }, "Nutrition provider request completed");
    return value;
  } catch (error) {
    logger.warn({ event: "nutrition_provider_latency", provider, operation, latencyMs: Date.now() - startedAt, ok: false }, "Nutrition provider request failed");
    throw error;
  }
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

    let staleLocal: CanonicalFood[] = [];
    if (this.persistence) {
      const local = await this.persistence.searchLocal(query, boundedLimit);
      if (local.length > 0) {
        this.searchCache.set(key, local, 15 * 60 * 1000);
        logger.info(
          { event: "nutrition_search_cache_hit", layer: "database", count: local.length },
          "Nutrition search served from Diewish cache",
        );
        return local;
      }
      staleLocal = await this.persistence.searchLocalStale(query, boundedLimit);
    }

    const collected: CanonicalFood[] = [];
    const errors: string[] = [];
    const queries = expandNutritionProviderQueries(query);

    const offSearchAvailable = Boolean(this.providers.openFoodFacts.search);
    const cnfAvailable = Boolean(this.providers.cnf);
    const usdaBudget = cnfAvailable
      ? Math.max(1, Math.ceil(boundedLimit * 0.55))
      : offSearchAvailable
        ? Math.max(1, Math.ceil(boundedLimit * 0.7))
        : boundedLimit;

    let usdaCount = 0;
    if (this.providers.usda.isConfigured()) {
      try {
        for (const providerQuery of queries) {
          const remaining = usdaBudget - usdaCount;
          if (remaining <= 0) break;
          const foods = await timedProvider("USDA", "search", () =>
            this.providers.usda.search(providerQuery, remaining),
          );
          collected.push(...foods);
          usdaCount = uniqueFoods(collected, boundedLimit)
            .filter((food) => food.provider === "USDA").length;
          if (usdaCount >= usdaBudget) break;
        }
      } catch (error) {
        errors.push(`USDA: ${String(error)}`);
      }
    }

    if (this.providers.cnf && uniqueFoods(collected, boundedLimit).length < boundedLimit) {
      const unusedUsdaBudget = Math.max(0, usdaBudget - usdaCount);
      const cnfBudget = Math.min(
        boundedLimit,
        Math.max(1, Math.ceil(boundedLimit * 0.35) + unusedUsdaBudget),
      );
      let cnfCount = 0;
      try {
        for (const providerQuery of queries) {
          const room = boundedLimit - uniqueFoods(collected, boundedLimit).length;
          const remaining = Math.min(room, cnfBudget - cnfCount);
          if (remaining <= 0) break;
          const foods = await timedProvider("CNF", "search", () =>
            this.providers.cnf!.search(providerQuery, remaining),
          );
          collected.push(...foods);
          cnfCount = uniqueFoods(collected, boundedLimit)
            .filter((food) => food.provider === "CNF").length;
          if (cnfCount >= cnfBudget) break;
        }
      } catch (error) {
        errors.push(`CNF: ${String(error)}`);
      }
    }

    if (
      uniqueFoods(collected, boundedLimit).length < boundedLimit &&
      offSearchAvailable &&
      this.providers.openFoodFacts.search
    ) {
      try {
        for (const providerQuery of queries) {
          const remaining = boundedLimit - uniqueFoods(collected, boundedLimit).length;
          if (remaining <= 0) break;
          const foods = await timedProvider("OPEN_FOOD_FACTS", "search", () =>
            this.providers.openFoodFacts.search!(providerQuery, remaining),
          );
          collected.push(...foods);
          if (uniqueFoods(collected, boundedLimit).length >= boundedLimit) break;
        }
      } catch (error) {
        errors.push(`OPEN_FOOD_FACTS: ${String(error)}`);
      }
    }

    const foods = uniqueFoods(collected, boundedLimit);
    if (foods.length === 0) {
      if (staleLocal.length > 0) {
        this.searchCache.set(key, staleLocal, 5 * 60 * 1000);
        logger.warn(
          {
            event: "nutrition_search_stale_fallback",
            count: staleLocal.length,
            providerErrors: errors.length,
          },
          "Nutrition search served from retained Diewish cache",
        );
        return staleLocal;
      }
      if (errors.length > 0) {
        throw providerError("Besin veri kaynaklarına şu anda ulaşılamıyor.", errors.join("; "));
      }

      // Do not keep an empty provider result for hours. A short negative cache
      // prevents request storms while still allowing newly-added foods to appear.
      this.searchCache.set(key, [], 10 * 60 * 1000);
      return [];
    }

    const searchTtlHours = foods.reduce(
      (minimum, food) => Math.min(minimum, ttlHoursFor(food)),
      env.USDA_CACHE_TTL_HOURS,
    );
    this.searchCache.set(key, foods, searchTtlHours * 60 * 60 * 1000);

    if (this.persistence) {
      // Persist only relevant candidates. This keeps Diewish resilient without
      // turning broad provider search noise into an ever-growing data dump.
      const ranked = rankNutritionMatches(query, foods);
      const persistable = ranked.slice(0, Math.min(5, boundedLimit));
      await Promise.all(
        persistable.map((match) => this.persistence!.upsertFood(match.food, expiresAt(match.food))),
      );

      const best = persistable[0];
      if (best && best.relevance >= 0.72 && best.food.provenance.confidence >= 0.7) {
        await this.persistence.rememberSearchAlias(
          query,
          best.food,
          Math.min(best.relevance, best.food.provenance.confidence),
        );
      }
    }
    return foods;
  }

  private async userConfirmedFallback(
    userId: string | undefined,
    barcode: string,
  ): Promise<CanonicalFood | null> {
    if (!userId || !this.persistence) return null;
    const food = await this.persistence.getUserConfirmedBarcode(userId, barcode);
    if (food) {
      logger.info(
        { event: "barcode_user_label_hit", barcodeLength: barcode.length },
        "User-confirmed package label hit",
      );
    }
    return food;
  }

  /**
   * Global verified providers always win. A user-confirmed package label is a
   * final user-scoped fallback and is never inserted into the shared cache.
   */
  async getByBarcode(input: string, userId?: string): Promise<CanonicalFood | null> {
    const barcode = normalizeBarcode(input);
    if (!barcode) {
      throw new ApiError(400, "Geçersiz veya desteklenmeyen barkod.", { code: "INVALID_BARCODE" });
    }
    const key = `barcode:${barcode}`;
    const cached = this.foodCache.lookup(key);
    if (cached.hit) {
      logger.info({ event: "barcode_cache_hit", layer: "memory", barcodeLength: barcode.length }, "Barcode cache hit");
      return cached.value ?? this.userConfirmedFallback(userId, barcode);
    }

    let stale: CanonicalFood | null = null;
    if (this.persistence) {
      const persisted = await this.persistence.getFreshBarcode(barcode);
      if (persisted) {
        logger.info({ event: "barcode_cache_hit", layer: "database", barcodeLength: barcode.length }, "Barcode cache hit");
        this.foodCache.set(key, persisted, 15 * 60 * 1000);
        return persisted;
      }
      stale = await this.persistence.getStaleBarcode(barcode);
    }
    logger.info({ event: "barcode_cache_miss", barcodeLength: barcode.length }, "Barcode cache miss");

    let offFood: CanonicalFood | null = null;
    let offError: unknown = null;
    try {
      offFood = await timedProvider("OPEN_FOOD_FACTS", "barcode", () => this.providers.openFoodFacts.getByBarcode(barcode));
    } catch (error) {
      offError = error;
    }

    if (offFood) {
      this.foodCache.set(key, offFood, env.OPEN_FOOD_FACTS_CACHE_TTL_HOURS * 60 * 60 * 1000);
      if (this.persistence) await this.persistence.upsertFood(offFood, expiresAt(offFood));
      logger.info({ event: "barcode_lookup_success", provider: offFood.provider, barcodeLength: barcode.length }, "Barcode lookup succeeded");
      return offFood;
    }

    let usdaFood: CanonicalFood | null = null;
    let usdaError: unknown = null;
    if (this.providers.usda.isConfigured()) {
      try {
        usdaFood = await timedProvider("USDA", "branded_barcode", () => this.providers.usda.searchBrandedBarcode(barcode));
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
      logger.info({ event: "barcode_lookup_success", provider: selected.provider, barcodeLength: barcode.length }, "Barcode lookup succeeded");
      return selected;
    }

    const providerFailed = Boolean(offError || usdaError);
    if (providerFailed && stale) {
      const staleFood: CanonicalFood = {
        ...stale,
        provenance: { ...stale.provenance, stale: true },
      };
      this.foodCache.set(key, staleFood, 5 * 60 * 1000);
      logger.warn({ event: "barcode_stale_fallback", provider: staleFood.provider, barcodeLength: barcode.length }, "Serving bounded stale barcode data after provider failure");
      return staleFood;
    }

    const confirmed = await this.userConfirmedFallback(userId, barcode);
    if (confirmed) return confirmed;

    if (offError && (usdaError || !this.providers.usda.isConfigured())) {
      throw providerError(
        "Barkod veri kaynaklarına şu anda ulaşılamıyor.",
        `${String(offError)}${usdaError ? `; ${String(usdaError)}` : ""}`,
      );
    }

    logger.info({ event: "barcode_lookup_miss", barcodeLength: barcode.length }, "Barcode lookup returned no product");
    this.foodCache.set(key, null, 10 * 60 * 1000);
    return null;
  }

  async saveUserConfirmedBarcode(
    userId: string,
    input: string,
    food: CanonicalFood,
  ): Promise<void> {
    const barcode = normalizeBarcode(input);
    if (
      !barcode ||
      food.barcode !== barcode ||
      food.provider !== "DIEWISH" ||
      food.provenance.sourceReference !== "USER_CONFIRMED_PACKAGE_LABEL"
    ) {
      throw ApiError.badRequest("Kullanıcı doğrulamalı barkod kaydı geçersiz.");
    }
    if (!this.persistence) {
      throw new ApiError(503, "Barkod geçmişi kullanılamıyor.", {
        code: "NUTRITION_PERSISTENCE_UNAVAILABLE",
      });
    }
    await this.persistence.recordBarcodeScan(userId, barcode, food);
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

  recordPhotoScan(userId: string, input: PhotoScanHistoryInput): Promise<void> {
    return this.persistence?.recordPhotoScan(userId, input) ?? Promise.resolve();
  }

  listScanHistory(userId: string, limit = 50) {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit) || 50, 1), 100);
    return this.persistence?.listScanHistory(userId, boundedLimit) ?? Promise.resolve([]);
  }

  listFavorites(userId: string, limit = 50) {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit) || 50, 1), 100);
    return this.persistence?.listFavorites(userId, boundedLimit) ?? Promise.resolve([]);
  }

  async setFavorite(userId: string, input: string, favorite: boolean): Promise<CanonicalFood | null> {
    const barcode = normalizeBarcode(input);
    if (!barcode) throw new ApiError(400, "Geçersiz barkod.", { code: "INVALID_BARCODE" });
    const food = favorite ? await this.getByBarcode(barcode, userId) : null;
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
    cnf: canadianNutrientFileProvider,
    openFoodFacts: openFoodFactsProvider,
  },
  nutritionDataRepository,
);
