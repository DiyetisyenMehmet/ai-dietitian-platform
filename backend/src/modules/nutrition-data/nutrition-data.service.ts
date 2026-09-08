import { env } from "../../config/env";
import { ApiError } from "../../utils/api-error";
import { normalizeBarcode } from "./barcode";
import { NutritionTtlCache } from "./nutrition-cache";
import type { CanonicalFood } from "./nutrition-data.types";
import { openFoodFactsProvider, type OpenFoodFactsProvider } from "./providers/open-food-facts.provider";
import { usdaFoodDataCentralProvider, type UsdaFoodDataCentralProvider } from "./providers/usda.provider";
import { selectPreferredFood } from "./source-policy";

interface NutritionServiceProviders {
  usda: UsdaFoodDataCentralProvider;
  openFoodFacts: OpenFoodFactsProvider;
}

function providerError(message: string, details?: unknown): ApiError {
  return new ApiError(503, message, { code: "NUTRITION_PROVIDER_UNAVAILABLE", details });
}

export class NutritionDataService {
  private readonly foodCache = new NutritionTtlCache<CanonicalFood | null>(1_000);
  private readonly searchCache = new NutritionTtlCache<CanonicalFood[]>(250);

  constructor(private readonly providers: NutritionServiceProviders) {}

  async search(queryInput: string, limit = 10): Promise<CanonicalFood[]> {
    const query = queryInput.trim();
    if (query.length < 2 || query.length > 120) {
      throw ApiError.badRequest("Besin araması 2-120 karakter olmalıdır.");
    }
    const boundedLimit = Math.min(Math.max(Math.trunc(limit) || 10, 1), 25);
    const key = `search:${query.toLocaleLowerCase("tr-TR")}:${boundedLimit}`;
    const cached = this.searchCache.get(key);
    if (cached) return cached;
    if (!this.providers.usda.isConfigured()) {
      throw new ApiError(503, "USDA FoodData Central sunucuda yapılandırılmamış.", {
        code: "NUTRITION_PROVIDER_NOT_CONFIGURED",
      });
    }
    try {
      const foods = await this.providers.usda.search(query, boundedLimit);
      this.searchCache.set(key, foods, env.USDA_CACHE_TTL_HOURS * 60 * 60 * 1000);
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
    const cached = this.foodCache.get(key);
    if (cached !== null) return cached;

    let offFood: CanonicalFood | null = null;
    let offError: unknown = null;
    try {
      offFood = await this.providers.openFoodFacts.getByBarcode(barcode);
    } catch (error) {
      offError = error;
    }

    if (offFood) {
      this.foodCache.set(key, offFood, env.OPEN_FOOD_FACTS_CACHE_TTL_HOURS * 60 * 60 * 1000);
      return offFood;
    }

    let usdaFood: CanonicalFood | null = null;
    if (this.providers.usda.isConfigured()) {
      try {
        usdaFood = await this.providers.usda.searchBrandedBarcode(barcode);
      } catch (error) {
        if (offError) throw providerError("Barkod veri kaynaklarına şu anda ulaşılamıyor.", String(error));
      }
    }

    const selected = selectPreferredFood([offFood, usdaFood].filter((v): v is CanonicalFood => v !== null), "BARCODE");
    if (selected) {
      const ttlHours = selected.provider === "OPEN_FOOD_FACTS" ? env.OPEN_FOOD_FACTS_CACHE_TTL_HOURS : env.USDA_CACHE_TTL_HOURS;
      this.foodCache.set(key, selected, ttlHours * 60 * 60 * 1000);
      return selected;
    }

    if (offError && !this.providers.usda.isConfigured()) {
      throw providerError("Barkod veri kaynağına şu anda ulaşılamıyor.", String(offError));
    }

    // Negative result gets a short cache to avoid hammering OFF on repeated scans.
    this.foodCache.set(key, null, 10 * 60 * 1000);
    return null;
  }
}

export const nutritionDataService = new NutritionDataService({
  usda: usdaFoodDataCentralProvider,
  openFoodFacts: openFoodFactsProvider,
});
