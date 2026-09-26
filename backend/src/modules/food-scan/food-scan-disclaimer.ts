import type { FoodVisionResult } from "./types";

const DETERMINISTIC_NUTRITION_NOTICE =
  "Besin değerleri mevcut güvenilir kaynaklara göre hesaplanır.";
const OPTIONAL_INGREDIENT_NOTICE =
  "Kesin görünmeyen malzemeler, sen eklemedikçe hesaba katılmaz.";
const EDIBLE_WEIGHT_GUARD_NOTICE =
  "Fotoğrafta yenmeyen kısımlar da ağırlığa dahil göründüğü için otomatik gram hesabı yapılmadı. Yenilebilir miktarı Malzemeleri Düzenle bölümünden girebilirsin.";

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
    ? "Görsel tanıma ve porsiyon miktarı yaklaşık olabilir. Gerçek miktar ürüne göre değişebilir."
    : "Görsel tanıma, porsiyon ve tarif içeriği yaklaşık olabilir. Pişirme yöntemi, yağ ve sos gibi eklemeler sonucu değiştirebilir.";

  return [
    edibleWeightGuarded ? EDIBLE_WEIGHT_GUARD_NOTICE : null,
    uncertaintyNotice,
    DETERMINISTIC_NUTRITION_NOTICE,
    hasOptionalIngredients ? OPTIONAL_INGREDIENT_NOTICE : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");
}
