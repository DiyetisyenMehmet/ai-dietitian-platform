import { calculatePortion } from "../nutrition-data/nutrition-calculator";
import { nutritionDataService } from "../nutrition-data/nutrition-data.service";
import type { NutrientValues, NutritionProviderId } from "../nutrition-data/nutrition-data.types";

export interface NutritionGrounding {
  query: string;
  servingGrams: number;
  food: { displayNameTr: string; provider: NutritionProviderId; externalId: string };
  nutrients: NutrientValues;
  rule: "VERIFIED_NUMBERS_MUST_NOT_BE_CHANGED_OR_INVENTED";
}

export function parseNutritionBarcode(message: string): string | null {
  const match = message.match(/\b(?:barkod(?:u)?|barcode)\s*[:#]?\s*(\d{6,14})\b/i);
  return match?.[1] ?? null;
}

export function parseNutritionQuestion(message: string): { query: string; grams: number } | null {
  const normalized = message.trim().replace(/\s+/g, " ");

  // Scanner CTA wording is intentionally resolved before the broader explicit-
  // gram matcher so "250 g kuru fasulye hakkında ..." stops at "hakkında".
  const scanContext = normalized.match(
    /(\d+(?:[.,]\d+)?)\s*(?:g|gr|gram)\s+(.{2,120}?)\s+hakkında(?:\s|,|\.|:|$)/i,
  );
  if (scanContext) {
    const grams = Number(scanContext[1]?.replace(",", "."));
    const query = scanContext[2]?.trim() ?? "";
    if (Number.isFinite(grams) && grams > 0 && grams <= 5_000 && query.length >= 2) {
      return { query, grams };
    }
  }

  const withServing = normalized.match(
    /(\d+(?:[.,]\d+)?)\s*(?:g|gr|gram)\s+(.+?)(?=\s+(?:kaç|ne kadar)\s+(?:kalori|kcal|protein|karbonhidrat|yağ|lif|şeker)|[?.!]|$)/i,
  );
  if (withServing) {
    const grams = Number(withServing[1]?.replace(",", "."));
    const query = withServing[2]?.trim() ?? "";
    if (Number.isFinite(grams) && grams > 0 && grams <= 5_000 && query.length >= 2) {
      return { query, grams };
    }
  }

  const generic = normalized.match(
    /^(.{2,80}?)\s+(?:kaç|ne kadar)\s+(?:kalori|kcal|protein|karbonhidrat|yağ|lif|şeker)(?:\s+var|\s+içerir)?[?.!]?$/i,
  );
  if (generic) {
    const query = generic[1]?.trim() ?? "";
    if (query) return { query, grams: 100 };
  }
  return null;
}

export async function resolveNutritionGrounding(message: string): Promise<NutritionGrounding | null> {
  const parsed = parseNutritionQuestion(message);
  const barcode = parseNutritionBarcode(message);
  if (!parsed && !barcode) return null;

  try {
    const food = barcode
      ? await nutritionDataService.getByBarcode(barcode)
      : (await nutritionDataService.search(parsed!.query, 5))[0] ?? null;
    if (!food) return null;

    const grams = parsed?.grams ?? food.serving?.gramWeight ?? 100;
    const portion = calculatePortion(food.nutrientsPer100g, grams);
    return {
      query: parsed?.query ?? food.displayNameTr,
      servingGrams: portion.grams,
      food: {
        displayNameTr: food.displayNameTr,
        provider: food.provider,
        externalId: food.externalId,
      },
      nutrients: portion.nutrients,
      rule: "VERIFIED_NUMBERS_MUST_NOT_BE_CHANGED_OR_INVENTED",
    };
  } catch {
    return null;
  }
}
