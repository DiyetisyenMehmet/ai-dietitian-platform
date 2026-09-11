import { calculatePortion } from "../nutrition-data/nutrition-calculator";
import { nutritionDataService } from "../nutrition-data/nutrition-data.service";
import { selectBestNutritionMatch } from "../nutrition-data/nutrition-match";
import { EMPTY_NUTRIENTS, type NutrientValues, type NutritionProviderId } from "../nutrition-data/nutrition-data.types";
import {
  estimateFoodNutritionWithAi,
  type FoodNutritionEstimator,
} from "./food-nutrition-estimator";
import type {
  FoodScanRecalculationResult,
  FoodScanResult,
  ResolvedFoodScanIngredient,
} from "./types";

function hasAnyNutrition(nutrients: NutrientValues): boolean {
  return Object.values(nutrients).some((value) => value !== null);
}

function hasCoreNutrition(nutrients: NutrientValues): boolean {
  return nutrients.energyKcal !== null
    && nutrients.proteinG !== null
    && nutrients.carbohydratesG !== null
    && nutrients.fatG !== null;
}

function boundedPortion(analysis: FoodScanResult): number {
  if (analysis.estimatedGrams && analysis.estimatedGrams > 0) return analysis.estimatedGrams;
  const componentTotal = analysis.ingredients
    .filter((item) => item.included)
    .reduce((sum, item) => sum + (item.estimatedGrams ?? 0), 0);
  return componentTotal > 0 ? Math.round(componentTotal * 10) / 10 : 100;
}

function verifiedResolution(analysis: FoodScanResult, partial = false): FoodScanResult {
  const matched = analysis.ingredients.filter((item) => item.included && item.matchedFood && item.nutrients);
  const providers = [...new Set(matched.map((item) => item.matchedFood!.provider))] as NutritionProviderId[];
  const directDishMatch = matched.length === 1
    && matched[0]!.name.toLocaleLowerCase("tr-TR") === analysis.dishName.toLocaleLowerCase("tr-TR");
  const confidence = matched.length > 0
    ? Math.round(Math.min(...matched.map((item) => item.matchedFood!.confidence)) * 100) / 100
    : 0;
  return {
    ...analysis,
    nutritionResolution: {
      method: directDishMatch ? "VERIFIED_SOURCE" : "COMPONENT_AGGREGATE",
      providers,
      confidence,
      estimated: !directDishMatch,
      note: partial
        ? "Mevcut güvenilir kaynak verileri korundu; temel makroların tamamı kaynakta olmadığı için bazı alanlar yaklaşık analiz dışında bırakıldı."
        : directDishMatch
          ? "Besin değerleri lisansı uygun yapılandırılmış bir kaynaktan eşleştirildi."
          : "Besin değerleri eşleşen tarif bileşenlerinin güvenilir kaynak verileri kullanılarak hesaplandı.",
    },
  };
}

/**
 * Resolution order is deliberate: complete deterministic core facts first,
 * then a clearly-labelled AI estimate, then any partial deterministic facts.
 * We never mix AI-generated nutrient numbers into verified provider totals.
 */
export async function applyFoodNutritionFallback(
  analysis: FoodScanResult,
  estimator: FoodNutritionEstimator = estimateFoodNutritionWithAi,
): Promise<FoodScanResult> {
  if (hasCoreNutrition(analysis.totals)) return verifiedResolution(analysis);

  const estimate = await estimator(analysis);
  if (estimate) {
    const portionGrams = boundedPortion(analysis);
    return {
      ...analysis,
      estimatedGrams: analysis.estimatedGrams ?? portionGrams,
      estimatedPortion: analysis.estimatedGrams
        ? analysis.estimatedPortion
        : `${analysis.estimatedPortion}; ${portionGrams} g referans porsiyon kullanıldı`,
      totals: calculatePortion(estimate.per100g, portionGrams).nutrients,
      disclaimer: "Bu besin değerleri, yeterli doğrulanmış kaynak verisi bulunamadığı için tanınan gıda ve porsiyon üzerinden Diewish AI tarafından tahmin edilmiştir. Gerçek değerler tarif ve miktara göre değişebilir.",
      nutritionResolution: {
        method: "AI_ESTIMATE",
        providers: [],
        confidence: estimate.confidence,
        estimated: true,
        note: "Yeterli doğrulanmış kaynak verisi bulunamadı; değerler son çare Diewish AI tahminidir ve doğrulanmış kaynak olarak kaydedilmez.",
      },
    };
  }

  if (hasAnyNutrition(analysis.totals)) return verifiedResolution(analysis, true);

  return {
    ...analysis,
    nutritionResolution: {
      method: "UNAVAILABLE",
      providers: [],
      confidence: 0,
      estimated: true,
      note: "Gıda tanındı; gıda adını ve porsiyonu doğrulayarak analizi yeniden çalıştırabilirsin.",
    },
  };
}

export async function analyzeConfirmedFoodName(
  foodNameInput: string,
  gramsInput = 100,
  estimator: FoodNutritionEstimator = estimateFoodNutritionWithAi,
): Promise<FoodScanResult> {
  const foodName = foodNameInput.trim().slice(0, 120);
  const grams = Math.round(Math.min(Math.max(gramsInput, 1), 5_000) * 10) / 10;
  let ingredient: ResolvedFoodScanIngredient = {
    name: foodName,
    estimatedGrams: grams,
    confidence: 100,
    optional: false,
    included: true,
    matchedFood: null,
    nutrients: null,
  };

  try {
    const candidates = await nutritionDataService.search(foodName, 10);
    const match = selectBestNutritionMatch(foodName, candidates);
    if (match) {
      ingredient = {
        ...ingredient,
        matchedFood: {
          externalId: match.food.externalId,
          provider: match.food.provider,
          displayNameTr: match.food.displayNameTr,
          confidence: Math.round(Math.min(match.relevance, match.food.provenance.confidence) * 100) / 100,
        },
        nutrients: calculatePortion(match.food.nutrientsPer100g, grams).nutrients,
      };
    }
  } catch {
    // Provider outage/miss must not prevent the explicitly approved last-resort AI path.
  }

  const base: FoodScanResult = {
    isFood: true,
    confidence: 100,
    reason: "Gıda adı kullanıcı tarafından doğrulandı.",
    dishName: foodName,
    estimatedPortion: `${grams} g kullanıcı porsiyonu`,
    estimatedGrams: grams,
    ingredients: [ingredient],
    totals: ingredient.nutrients ?? { ...EMPTY_NUTRIENTS },
    disclaimer: "Gıda adı ve porsiyon kullanıcı tarafından doğrulandı; besin değerlerinin çözüm yöntemi aşağıda ayrıca belirtilir.",
  };
  return applyFoodNutritionFallback(base, estimator);
}

export async function finalizeFoodScanRecalculation(
  dishNameInput: string,
  recalculation: FoodScanRecalculationResult,
  estimator: FoodNutritionEstimator = estimateFoodNutritionWithAi,
): Promise<FoodScanResult> {
  const dishName = dishNameInput.trim().slice(0, 120) || "Düzeltilmiş öğün";
  const base: FoodScanResult = {
    isFood: true,
    confidence: 100,
    reason: "Malzemeler ve porsiyon kullanıcı tarafından düzeltildi.",
    dishName,
    estimatedPortion: "Düzeltilmiş porsiyon",
    estimatedGrams: recalculation.estimatedGrams,
    ingredients: recalculation.ingredients,
    totals: recalculation.totals,
    disclaimer: "Malzemeler ve porsiyon kullanıcı tarafından düzeltildi; besin değerlerinin çözüm yöntemi aşağıda ayrıca belirtilir.",
  };
  return applyFoodNutritionFallback(base, estimator);
}
