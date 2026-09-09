import sharp from "sharp";

import { logger } from "../../lib/logger";
import { ApiError } from "../../utils/api-error";
import { calculatePortion } from "../nutrition-data/nutrition-calculator";
import { nutritionDataService } from "../nutrition-data/nutrition-data.service";
import { selectBestNutritionMatch, type NutritionMatch } from "../nutrition-data/nutrition-match";
import { EMPTY_NUTRIENTS, type CanonicalFood, type NutrientValues } from "../nutrition-data/nutrition-data.types";
import { FOOD_IMAGE_MIN_CONFIDENCE, FOOD_IMAGE_REJECTION_MESSAGE } from "./constants";
import { analyzeFoodImageWithProvider } from "./food-vision.provider";
import type {
  FoodScanIngredientCorrection,
  FoodScanRecalculationResult,
  FoodScanResult,
  FoodVisionIngredientCandidate,
  ResolvedFoodScanIngredient,
} from "./types";

const MAX_INGREDIENTS = 20;
const MAX_SERVING_GRAMS = 5_000;
const NUTRITION_MATCH_CANDIDATES = 10;

export interface NutritionLookupPort {
  search(query: string, limit?: number): Promise<CanonicalFood[]>;
}

async function assertUsableImage(buffer: Buffer): Promise<Buffer> {
  try {
    let pipeline = sharp(buffer, { failOn: "error" }).rotate();
    const metadata = await pipeline.metadata();
    if (!metadata.width || !metadata.height) {
      throw new ApiError(422, "Görsel okunamadı. Lütfen farklı bir fotoğraf deneyin.", {
        code: "FOOD_IMAGE_UNREADABLE",
      });
    }
    if (metadata.width < 160 || metadata.height < 160) {
      throw new ApiError(422, "Görsel çok küçük. Yemeğin net göründüğü daha büyük bir fotoğraf yükleyin.", {
        code: "FOOD_IMAGE_TOO_SMALL",
      });
    }
    pipeline = pipeline.resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true });
    const normalized = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    const stats = await sharp(normalized).stats();
    const channels = stats.channels.slice(0, 3);
    const avgMean = channels.reduce((sum, channel) => sum + channel.mean, 0) / Math.max(1, channels.length);
    const avgStdev = channels.reduce((sum, channel) => sum + channel.stdev, 0) / Math.max(1, channels.length);
    if ((avgMean > 246 && avgStdev < 7) || (avgMean < 9 && avgStdev < 7) || avgStdev < 3.5) {
      throw new ApiError(422, "Fotoğraf boş veya analiz edilemeyecek kadar tekdüze görünüyor. Lütfen yemeğin net göründüğü bir fotoğraf çekin.", {
        code: "FOOD_IMAGE_BLANK",
      });
    }
    return normalized;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(422, "Görsel okunamadı. Lütfen JPG, PNG veya WebP biçiminde geçerli bir fotoğraf deneyin.", {
      code: "FOOD_IMAGE_UNREADABLE",
    });
  }
}

function cloneEmptyNutrients(): NutrientValues {
  return { ...EMPTY_NUTRIENTS };
}

function includedByDefault(candidate: FoodVisionIngredientCandidate): boolean {
  // optional=true explicitly means the vision model considers the ingredient
  // plausible but unconfirmed. Unconfirmed oil/sauce/salt must never silently
  // inflate deterministic nutrition totals; the user can opt it in via editing.
  return !candidate.optional;
}

async function bestFoodMatch(service: NutritionLookupPort, name: string): Promise<NutritionMatch | null> {
  try {
    const candidates = await service.search(name, NUTRITION_MATCH_CANDIDATES);
    return selectBestNutritionMatch(name, candidates);
  } catch {
    return null;
  }
}

function boundedMatchConfidence(match: NutritionMatch): number {
  return Math.round(Math.min(match.relevance, match.food.provenance.confidence) * 100) / 100;
}

async function resolveIngredient(
  service: NutritionLookupPort,
  candidate: FoodVisionIngredientCandidate,
  included = includedByDefault(candidate),
): Promise<ResolvedFoodScanIngredient> {
  const match = await bestFoodMatch(service, candidate.name);
  const food = match?.food ?? null;
  const grams = candidate.estimatedGrams;
  const nutrients = food && grams && included ? calculatePortion(food.nutrientsPer100g, grams).nutrients : null;
  return {
    ...candidate,
    included,
    matchedFood: food && match
      ? {
          externalId: food.externalId,
          provider: food.provider,
          displayNameTr: food.displayNameTr,
          // This is match confidence, bounded by provider provenance confidence.
          // It must never be confused with the AI's visual ingredient confidence.
          confidence: boundedMatchConfidence(match),
        }
      : null,
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

async function fallbackDishIngredient(
  service: NutritionLookupPort,
  dishName: string,
  estimatedGrams: number | null,
): Promise<ResolvedFoodScanIngredient | null> {
  if (!estimatedGrams) return null;
  const match = await bestFoodMatch(service, dishName);
  const food = match?.food ?? null;
  if (!food || !match) return null;
  return {
    name: dishName,
    estimatedGrams,
    confidence: 80,
    optional: false,
    included: true,
    matchedFood: {
      externalId: food.externalId,
      provider: food.provider,
      displayNameTr: food.displayNameTr,
      confidence: boundedMatchConfidence(match),
    },
    nutrients: calculatePortion(food.nutrientsPer100g, estimatedGrams).nutrients,
  };
}

function assertCorrection(correction: FoodScanIngredientCorrection): void {
  const name = correction.name.trim();
  if (!name || name.length > 120) throw ApiError.badRequest("Geçersiz malzeme adı.");
  if (!Number.isFinite(correction.grams) || correction.grams <= 0 || correction.grams > MAX_SERVING_GRAMS) {
    throw ApiError.badRequest("Malzeme gramı 0-5000 aralığında olmalıdır.");
  }
}

function roundGram(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Scales only included ingredients so their total equals the user-entered plate
 * weight. This is deterministic math; no AI is involved in the correction.
 */
export function scaleCorrectionsToTarget(
  corrections: readonly FoodScanIngredientCorrection[],
  targetGrams?: number,
): FoodScanIngredientCorrection[] {
  corrections.forEach(assertCorrection);
  if (targetGrams === undefined) return corrections.map((item) => ({ ...item }));
  if (!Number.isFinite(targetGrams) || targetGrams <= 0 || targetGrams > MAX_SERVING_GRAMS) {
    throw ApiError.badRequest("Toplam porsiyon gramı 0-5000 aralığında olmalıdır.");
  }

  const includedIndexes = corrections
    .map((item, index) => (item.included ? index : -1))
    .filter((index) => index >= 0);
  if (includedIndexes.length === 0) {
    throw ApiError.badRequest("Toplam porsiyon ayarlanabilmesi için en az bir malzeme dahil olmalıdır.");
  }
  const includedTotal = includedIndexes.reduce((sum, index) => sum + corrections[index]!.grams, 0);
  if (includedTotal <= 0) throw ApiError.badRequest("Dahil edilen malzeme toplamı geçersiz.");

  const factor = targetGrams / includedTotal;
  const scaled = corrections.map((item) => ({ ...item }));
  for (const index of includedIndexes) {
    scaled[index]!.grams = Math.max(0.1, roundGram(scaled[index]!.grams * factor));
  }
  const roundedTotal = includedIndexes.reduce((sum, index) => sum + scaled[index]!.grams, 0);
  const residual = roundGram(targetGrams - roundedTotal);
  const lastIndex = includedIndexes[includedIndexes.length - 1]!;
  scaled[lastIndex]!.grams = roundGram(scaled[lastIndex]!.grams + residual);
  if (scaled[lastIndex]!.grams <= 0) {
    throw ApiError.badRequest("Toplam porsiyon dağılımı hesaplanamadı.");
  }
  return scaled;
}

export class FoodScanService {
  constructor(private readonly nutrition: NutritionLookupPort) {}

  async analyze(buffer: Buffer): Promise<FoodScanResult> {
    const normalized = await assertUsableImage(buffer);
    const vision = await analyzeFoodImageWithProvider(normalized, "image/jpeg");
    if (!vision.isFood || vision.confidence < FOOD_IMAGE_MIN_CONFIDENCE || !vision.dishName) {
      throw new ApiError(422, FOOD_IMAGE_REJECTION_MESSAGE, {
        code: "NOT_A_FOOD_IMAGE",
        details: { confidence: vision.confidence },
      });
    }
    let ingredients = await Promise.all(
      vision.ingredients.map((candidate) => resolveIngredient(this.nutrition, candidate)),
    );
    if (ingredients.length === 0 || !ingredients.some((item) => item.nutrients !== null)) {
      const fallback = await fallbackDishIngredient(this.nutrition, vision.dishName, vision.estimatedGrams);
      if (fallback) ingredients = [fallback, ...ingredients];
    }

    logger.info(
      {
        confidenceBucket: vision.confidence >= 85 ? "HIGH" : vision.confidence >= 65 ? "MEDIUM" : "LOW",
        ingredientCount: ingredients.length,
        matchedIngredientCount: ingredients.filter((item) => item.matchedFood).length,
        unmatchedIngredientCount: ingredients.filter((item) => !item.matchedFood).length,
        optionalIngredientCount: ingredients.filter((item) => item.optional).length,
      },
      "Food photo scan completed",
    );

    return {
      isFood: true,
      confidence: vision.confidence,
      reason: vision.reason,
      dishName: vision.dishName,
      estimatedPortion: vision.estimatedPortion ?? "Yaklaşık porsiyon",
      estimatedGrams: vision.estimatedGrams,
      ingredients,
      totals: deterministicTotals(ingredients),
      disclaimer:
        "Bu değerler tahminidir. Tarif, porsiyon ve özellikle kullanılan yağ miktarına göre değişebilir. Kalori ve besin değerleri AI tarafından üretilmez; eşleşen güvenilir besin verilerinden deterministik olarak hesaplanır. Görselden doğrulanamayan isteğe bağlı malzemeler, siz dahil etmedikçe toplama eklenmez.",
    };
  }

  async recalculate(
    corrections: readonly FoodScanIngredientCorrection[],
    targetGrams?: number,
  ): Promise<FoodScanRecalculationResult> {
    if (corrections.length === 0 || corrections.length > MAX_INGREDIENTS) {
      throw ApiError.badRequest(`1-${MAX_INGREDIENTS} arasında malzeme gönderilmelidir.`);
    }

    const scaledCorrections = scaleCorrectionsToTarget(corrections, targetGrams);
    const ingredients = await Promise.all(
      scaledCorrections.map(async (correction) => {
        const name = correction.name.trim();
        return resolveIngredient(
          this.nutrition,
          {
            name,
            estimatedGrams: correction.grams,
            confidence: 100,
            optional: false,
          },
          correction.included,
        );
      }),
    );
    const estimatedGrams = roundGram(
      scaledCorrections.filter((item) => item.included).reduce((sum, item) => sum + item.grams, 0),
    );

    logger.info(
      {
        ingredientCount: scaledCorrections.length,
        includedIngredientCount: scaledCorrections.filter((item) => item.included).length,
        matchedIngredientCount: ingredients.filter((item) => item.matchedFood).length,
        targetGramsUsed: targetGrams !== undefined,
      },
      "Food photo scan corrections recalculated",
    );

    return { ingredients, totals: deterministicTotals(ingredients), estimatedGrams };
  }
}

export const foodScanService = new FoodScanService(nutritionDataService);
