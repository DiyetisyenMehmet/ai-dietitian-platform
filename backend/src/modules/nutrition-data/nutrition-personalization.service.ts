import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { derivePer100gAttentionFlags, derivePortionAttentionFlags } from "./nutrition-attention";
import { calculatePortion, compareByCalories } from "./nutrition-calculator";
import { nutritionDataService } from "./nutrition-data.service";
import type { CanonicalFood, NutrientValues } from "./nutrition-data.types";
import { deriveNutritionPersonalization } from "./personalization";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ALTERNATIVES = ["yogurt", "apple", "egg", "oats", "chicken breast"] as const;

function sum(values: Array<number | null>): number { return Math.round(values.reduce<number>((running, value) => running + (value ?? 0), 0) * 10) / 10; }
function normalize(value: string): string { return value.trim().toLocaleLowerCase("tr-TR").normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); }
function validGrams(grams: number): void { if (!Number.isFinite(grams) || grams <= 0 || grams > 5_000) throw ApiError.badRequest("Porsiyon 0-5000 g aralığında olmalıdır."); }
function allergenMatch(food: CanonicalFood, allergies: string[]): string[] { const declared = food.allergens.map(normalize); return allergies.filter((allergy) => { const key = normalize(allergy); return declared.some((item) => item.includes(key) || key.includes(item)); }); }
function dietaryCompatibility(food: CanonicalFood, preference: string | null): "COMPATIBLE" | "INCOMPATIBLE" | "UNKNOWN" {
  if (!preference || preference === "OMNIVORE" || preference === "OTHER") return "COMPATIBLE";
  if (preference === "VEGAN") return food.vegan === true ? "COMPATIBLE" : food.vegan === false ? "INCOMPATIBLE" : "UNKNOWN";
  if (preference === "VEGETARIAN") return food.vegetarian === true ? "COMPATIBLE" : food.vegetarian === false ? "INCOMPATIBLE" : "UNKNOWN";
  if (preference === "GLUTEN_FREE") return food.glutenFree === true ? "COMPATIBLE" : food.glutenFree === false ? "INCOMPATIBLE" : "UNKNOWN";
  return "UNKNOWN";
}
function nutrientDifference(source: NutrientValues, alternative: NutrientValues): Partial<Record<keyof NutrientValues, number>> {
  const keys: (keyof NutrientValues)[] = ["energyKcal", "proteinG", "carbohydratesG", "fatG", "fiberG", "sugarsG"];
  const result: Partial<Record<keyof NutrientValues, number>> = {};
  for (const key of keys) { const sourceValue = source[key]; const alternativeValue = alternative[key]; if (sourceValue !== null && alternativeValue !== null) result[key] = Math.round((alternativeValue - sourceValue) * 10) / 10; }
  return result;
}
async function loadLocalContext(userId: string) {
  const since = new Date(Date.now() - DAY_MS);
  const [profile, plan, meals] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.nutritionPlan.findFirst({ where: { userId, isActive: true, deletedAt: null }, orderBy: { updatedAt: "desc" } }),
    prisma.mealLog.findMany({ where: { userId, loggedAt: { gte: since } }, select: { calories: true, proteinG: true, carbsG: true, fatG: true } }),
  ]);
  return { profile, plan, consumed: { calories: sum(meals.map((meal) => meal.calories)), proteinG: sum(meals.map((meal) => meal.proteinG)), carbohydratesG: sum(meals.map((meal) => meal.carbsG)), fatG: sum(meals.map((meal) => meal.fatG)) } };
}
async function personalizeLocal(userId: string, nutrients: NutrientValues, food?: CanonicalFood) {
  const { profile, plan, consumed } = await loadLocalContext(userId);
  const metrics = plan ? deriveNutritionPersonalization(nutrients, { calories: plan.dailyCalories, proteinG: plan.proteinGrams, carbohydratesG: plan.carbsGrams, fatG: plan.fatGrams, mealsPerDay: plan.mealsPerDay }, consumed) : null;
  const matchedAllergies = food && profile ? allergenMatch(food, profile.allergies) : [];
  const dietary = food ? dietaryCompatibility(food, profile?.dietaryPreference ?? null) : "UNKNOWN";
  const warnings: string[] = [];
  if (matchedAllergies.length > 0) warnings.push(`Ürün kaynağında profilindeki alerjenlerle eşleşen bilgi var: ${matchedAllergies.join(", ")}.`);
  if (food && dietary === "INCOMPATIBLE") warnings.push("Ürün, profilindeki beslenme tercihiyle uyumlu görünmüyor.");
  if (food && food.allergens.length === 0 && (profile?.allergies.length ?? 0) > 0) warnings.push("Bu ürün için alerjen verisi eksik olabilir; alerjen güvenliği doğrulanmış kabul edilmemelidir.");
  if (food?.provenance.stale) warnings.push("Ürün verisi şu anda yeniden doğrulanamadı; son bilinen önbellek kaydı gösteriliyor.");
  if (food?.provenance.sourceReference === "USER_CONFIRMED_PACKAGE_LABEL") warnings.push("Bu ürün bilgileri senin doğruladığın paket etiketinden gelir; üretici formülü değişmiş olabilir, yeni ambalajda etiketi yeniden kontrol et.");
  return { metrics, profileContextUsed: Boolean(profile), activePlanUsed: Boolean(plan), dietaryCompatibility: dietary, allergenDataComplete: food ? food.allergens.length > 0 : false, warnings, attentionFlags: [...(food ? derivePer100gAttentionFlags(food.nutrientsPer100g) : []), ...derivePortionAttentionFlags(nutrients)], windowHours: 24 };
}
function validateNutrients(input: NutrientValues): NutrientValues { for (const key of Object.keys(input) as (keyof NutrientValues)[]) { const value = input[key]; if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100_000)) throw ApiError.badRequest(`Geçersiz nutrient değeri: ${key}`); } return input; }

export const nutritionPersonalizationService = {
  async personalizeBarcode(userId: string, barcode: string, grams: number) {
    validGrams(grams);
    const food = await nutritionDataService.getByBarcode(barcode, userId);
    if (!food) throw ApiError.notFound("Ürün bulunamadı.");
    const portion = calculatePortion(food.nutrientsPer100g, grams);
    const local = await personalizeLocal(userId, portion.nutrients, food);
    return { food: { externalId: food.externalId, provider: food.provider, displayNameTr: food.displayNameTr, barcode: food.barcode }, grams: portion.grams, nutrients: portion.nutrients, ...local };
  },
  async personalizeNutrients(userId: string, nutrients: NutrientValues) { const verified = validateNutrients(nutrients); return { nutrients: verified, ...(await personalizeLocal(userId, verified)) }; },
  async compareBarcode(userId: string, barcode: string, grams: number, requestedQueries?: string[]) {
    validGrams(grams);
    const source = await nutritionDataService.getByBarcode(barcode, userId);
    if (!source) throw ApiError.notFound("Ürün bulunamadı.");
    const sourcePortion = calculatePortion(source.nutrientsPer100g, grams);
    const targetCalories = sourcePortion.nutrients.energyKcal;
    if (targetCalories === null || targetCalories <= 0) throw ApiError.badRequest("Kaynak ürünün kalori verisi bulunmuyor.");
    const profile = await prisma.userProfile.findUnique({ where: { userId }, select: { allergies: true, dietaryPreference: true } });
    const queries = (requestedQueries?.length ? requestedQueries : [...DEFAULT_ALTERNATIVES]).map((query) => query.trim()).filter((query) => query.length >= 2).slice(0, 8);
    const candidates: CanonicalFood[] = [];
    for (const query of queries) {
      try {
        const results = await nutritionDataService.search(query, 3);
        const candidate = results.find((item) => !(item.provider === source.provider && item.externalId === source.externalId));
        if (candidate && !candidates.some((item) => item.provider === candidate.provider && item.externalId === candidate.externalId)) candidates.push(candidate);
      } catch { /* one unavailable candidate does not invalidate comparison */ }
    }
    const comparisons = candidates
      .filter((food) => (profile ? allergenMatch(food, profile.allergies).length === 0 : true))
      .map((food) => { const comparison = compareByCalories(food, targetCalories); if (!comparison.nutrients || comparison.servingGrams === null) return null; return { food: { externalId: food.externalId, provider: food.provider, displayNameTr: food.displayNameTr }, servingGrams: comparison.servingGrams, targetCalories: comparison.targetCalories, nutrients: comparison.nutrients, differenceFromSource: nutrientDifference(sourcePortion.nutrients, comparison.nutrients), dietaryCompatibility: dietaryCompatibility(food, profile?.dietaryPreference ?? null), allergenDataComplete: food.allergens.length > 0 }; })
      .filter((value): value is NonNullable<typeof value> => value !== null).slice(0, 5);
    return { source: { food: { displayNameTr: source.displayNameTr, provider: source.provider }, grams: sourcePortion.grams, nutrients: sourcePortion.nutrients }, comparisons, warning: "Aynı kalori, besinsel eşdeğerlik anlamına gelmez. Protein, karbonhidrat, yağ, lif ve şeker farklarını birlikte değerlendir." };
  },
};
