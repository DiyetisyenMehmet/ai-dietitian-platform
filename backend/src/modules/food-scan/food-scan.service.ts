import sharp from "sharp";

import { ApiError } from "../../utils/api-error";
import { calculatePortion } from "../nutrition-data/nutrition-calculator";
import { nutritionDataService } from "../nutrition-data/nutrition-data.service";
import { EMPTY_NUTRIENTS, type CanonicalFood, type NutrientValues } from "../nutrition-data/nutrition-data.types";
import { FOOD_IMAGE_MIN_CONFIDENCE, FOOD_IMAGE_REJECTION_MESSAGE } from "./constants";
import { analyzeFoodImageWithProvider } from "./food-vision.provider";
import type { FoodScanIngredientCorrection, FoodScanResult, FoodVisionIngredientCandidate, ResolvedFoodScanIngredient } from "./types";

export interface NutritionLookupPort {
  search(query: string, limit?: number): Promise<CanonicalFood[]>;
}

async function assertUsableImage(buffer: Buffer): Promise<Buffer> {
  try {
    let pipeline = sharp(buffer, { failOn: "error" }).rotate();
    const metadata = await pipeline.metadata();
    if (!metadata.width || !metadata.height) throw new ApiError(422, "Görsel okunamadı. Lütfen farklı bir fotoğraf deneyin.", { code: "FOOD_IMAGE_UNREADABLE" });
    if (metadata.width < 160 || metadata.height < 160) throw new ApiError(422, "Görsel çok küçük. Yemeğin net göründüğü daha büyük bir fotoğraf yükleyin.", { code: "FOOD_IMAGE_TOO_SMALL" });
    pipeline = pipeline.resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true });
    const normalized = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    const stats = await sharp(normalized).stats();
    const channels = stats.channels.slice(0, 3);
    const avgMean = channels.reduce((sum, channel) => sum + channel.mean, 0) / Math.max(1, channels.length);
    const avgStdev = channels.reduce((sum, channel) => sum + channel.stdev, 0) / Math.max(1, channels.length);
    if ((avgMean > 246 && avgStdev < 7) || (avgMean < 9 && avgStdev < 7) || avgStdev < 3.5) throw new ApiError(422, "Fotoğraf boş veya analiz edilemeyecek kadar tekdüze görünüyor. Lütfen yemeğin net göründüğü bir fotoğraf çekin.", { code: "FOOD_IMAGE_BLANK" });
    return normalized;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(422, "Görsel okunamadı. Lütfen JPG, PNG veya WebP biçiminde geçerli bir fotoğraf deneyin.", { code: "FOOD_IMAGE_UNREADABLE" });
  }
}

function cloneEmptyNutrients(): NutrientValues { return { ...EMPTY_NUTRIENTS }; }
function includedByDefault(candidate: FoodVisionIngredientCandidate): boolean { return !candidate.optional || candidate.confidence >= 70; }

async function bestFoodMatch(service: NutritionLookupPort, name: string): Promise<CanonicalFood | null> {
  try { return (await service.search(name, 5))[0] ?? null; } catch { return null; }
}

async function resolveIngredient(service: NutritionLookupPort, candidate: FoodVisionIngredientCandidate, included = includedByDefault(candidate)): Promise<ResolvedFoodScanIngredient> {
  const food = await bestFoodMatch(service, candidate.name);
  const grams = candidate.estimatedGrams;
  const nutrients = food && grams && included ? calculatePortion(food.nutrientsPer100g, grams).nutrients : null;
  return {
    ...candidate,
    included,
    matchedFood: food ? { externalId: food.externalId, provider: food.provider, displayNameTr: food.displayNameTr, confidence: food.provenance.confidence } : null,
    nutrients,
  };
}

function deterministicTotals(ingredients: readonly ResolvedFoodScanIngredient[]): NutrientValues {
  const keys = Object.keys(EMPTY_NUTRIENTS) as (keyof NutrientValues)[];
  const total = cloneEmptyNutrients();
  let hasNutrition = false;
  for (const item of ingredients) {
    if (!item.included || !item.nutrients) continue;
    hasNutrition = true;
    for (const key of keys) {
      const value = item.nutrients[key];
      if (value === null) continue;
      total[key] = Math.round(((total[key] ?? 0) + value) * 100) / 100;
    }
  }
  return hasNutrition ? total : cloneEmptyNutrients();
}

async function fallbackDishIngredient(service: NutritionLookupPort, dishName: string, estimatedGrams: number | null): Promise<ResolvedFoodScanIngredient | null> {
  if (!estimatedGrams) return null;
  const food = await bestFoodMatch(service, dishName);
  if (!food) return null;
  return {
    name: dishName, estimatedGrams, confidence: 80, optional: false, included: true,
    matchedFood: { externalId: food.externalId, provider: food.provider, displayNameTr: food.displayNameTr, confidence: food.provenance.confidence },
    nutrients: calculatePortion(food.nutrientsPer100g, estimatedGrams).nutrients,
  };
}

export class FoodScanService {
  constructor(private readonly nutrition: NutritionLookupPort) {}

  async analyze(buffer: Buffer): Promise<FoodScanResult> {
    const normalized = await assertUsableImage(buffer);
    const vision = await analyzeFoodImageWithProvider(normalized, "image/jpeg");
    if (!vision.isFood || vision.confidence < FOOD_IMAGE_MIN_CONFIDENCE || !vision.dishName) throw new ApiError(422, FOOD_IMAGE_REJECTION_MESSAGE, { code: "NOT_A_FOOD_IMAGE", details: { confidence: vision.confidence } });
    let ingredients = await Promise.all(vision.ingredients.map((candidate) => resolveIngredient(this.nutrition, candidate)));
    if (ingredients.length === 0 || !ingredients.some((item) => item.nutrients !== null)) {
      const fallback = await fallbackDishIngredient(this.nutrition, vision.dishName, vision.estimatedGrams);
      if (fallback) ingredients = [fallback, ...ingredients];
    }
    return {
      isFood: true, confidence: vision.confidence, reason: vision.reason, dishName: vision.dishName,
      estimatedPortion: vision.estimatedPortion ?? "Yaklaşık porsiyon", estimatedGrams: vision.estimatedGrams,
      ingredients, totals: deterministicTotals(ingredients),
      disclaimer: "Bu değerler tahminidir. Tarif, porsiyon ve özellikle kullanılan yağ miktarına göre değişebilir. Kalori ve besin değerleri AI tarafından üretilmez; eşleşen güvenilir besin verilerinden deterministik olarak hesaplanır.",
    };
  }

  async recalculate(corrections: readonly FoodScanIngredientCorrection[]): Promise<{ ingredients: ResolvedFoodScanIngredient[]; totals: NutrientValues }> {
    if (corrections.length === 0 || corrections.length > 20) throw ApiError.badRequest("1-20 arasında malzeme gönderilmelidir.");
    const ingredients = await Promise.all(corrections.map(async (correction) => {
      const name = correction.name.trim();
      if (!name || name.length > 120) throw ApiError.badRequest("Geçersiz malzeme adı.");
      if (!Number.isFinite(correction.grams) || correction.grams <= 0 || correction.grams > 5_000) throw ApiError.badRequest("Malzeme gramı 0-5000 aralığında olmalıdır.");
      return resolveIngredient(this.nutrition, { name, estimatedGrams: correction.grams, confidence: 100, optional: false }, correction.included);
    }));
    return { ingredients, totals: deterministicTotals(ingredients) };
  }
}

export const foodScanService = new FoodScanService(nutritionDataService);
