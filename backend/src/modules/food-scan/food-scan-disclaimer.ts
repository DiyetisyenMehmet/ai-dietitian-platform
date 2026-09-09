import type { FoodVisionResult } from "./types";

const DETERMINISTIC_NUTRITION_NOTICE =
  "Kalori ve besin değerleri AI tarafından üretilmez; eşleşen güvenilir besin verilerinden deterministik olarak hesaplanır.";
const OPTIONAL_INGREDIENT_NOTICE =
  "Görselden doğrulanamayan isteğe bağlı malzemeler, siz dahil etmedikçe toplama eklenmez.";
const EDIBLE_WEIGHT_GUARD_NOTICE =
  "Görsel açıklaması yenmeyen kısımları ağırlığa dahil ettiği için otomatik gram ve besin hesabı yapılmadı; yenilebilir miktarı Malzemeleri Düzenle alanından girebilirsiniz.";

/**
 * Generates uncertainty copy from structured scan evidence instead of using a
 * one-size-fits-all recipe warning. This is deliberately deterministic: the
 * vision model identifies candidates, but it does not decide the nutrition
 * safety language shown to the user.
 */
export function buildFoodScanDisclaimer(vision: FoodVisionResult, edibleWeightGuarded: boolean): string {
  const coreIngredients = vision.ingredients.filter((ingredient) => !ingredient.optional);
  const hasOptionalIngredients = vision.ingredients.some((ingredient) => ingredient.optional);
  const isSimpleSingleFood = coreIngredients.length === 1 && !hasOptionalIngredients;

  const uncertaintyNotice = isSimpleSingleFood
    ? "Görsel tanıma ve yenilebilir porsiyon miktarı tahminidir. Besinin gerçek bileşimi ve yenilebilir miktarı ürüne göre değişebilir."
    : "Görsel tanıma, porsiyon ve tarif bileşimi tahminidir. Pişirme yöntemi ile görselden kesin doğrulanamayan yağ, sos ve benzeri eklemeler sonucu değiştirebilir.";

  return [
    edibleWeightGuarded ? EDIBLE_WEIGHT_GUARD_NOTICE : null,
    uncertaintyNotice,
    DETERMINISTIC_NUTRITION_NOTICE,
    hasOptionalIngredients ? OPTIONAL_INGREDIENT_NOTICE : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");
}
