import { env } from "../../../config/env";
import { normalizeBarcode } from "../barcode";
import type { CanonicalFood, NutrientValues, NutritionProvider } from "../nutrition-data.types";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function tags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
function stripTag(value: string): string {
  return value.replace(/^[a-z]{2}:/i, "").replace(/-/g, " ");
}
function labelFlag(all: readonly string[], tag: string): boolean | null {
  if (all.includes(`en:${tag}`)) return true;
  if (all.includes(`en:non-${tag}`)) return false;
  return null;
}
function nutrient(n: Record<string, unknown>, key: string): number | null {
  return num(n[`${key}_100g`]);
}

export function normalizeOpenFoodFactsProduct(raw: unknown, barcodeHint?: string): CanonicalFood | null {
  const root = record(raw);
  const product = "product" in root ? record(root.product) : root;
  const code = text(product.code) ?? text(root.code) ?? barcodeHint ?? null;
  const name = text(product.product_name_tr) ?? text(product.product_name) ?? text(product.generic_name);
  if (!code || !name) return null;
  const nutriments = record(product.nutriments);
  const sodiumG = nutrient(nutriments, "sodium");
  const saltG = nutrient(nutriments, "salt");
  const nutrientValues: NutrientValues = {
    energyKcal: nutrient(nutriments, "energy-kcal"),
    proteinG: nutrient(nutriments, "proteins"),
    carbohydratesG: nutrient(nutriments, "carbohydrates"),
    fatG: nutrient(nutriments, "fat"),
    saturatedFatG: nutrient(nutriments, "saturated-fat"),
    sugarsG: nutrient(nutriments, "sugars"),
    fiberG: nutrient(nutriments, "fiber"),
    sodiumMg: sodiumG === null ? null : Math.round(sodiumG * 1000 * 100) / 100,
    saltG,
  };
  const labelTags = tags(product.labels_tags);
  const allergenTags = tags(product.allergens_tags);
  const ingredientText = text(product.ingredients_text_tr) ?? text(product.ingredients_text);
  const servingQuantity = num(product.serving_quantity);
  const servingSize = text(product.serving_size);
  return {
    externalId: code,
    provider: "OPEN_FOOD_FACTS",
    name,
    displayNameTr: text(product.product_name_tr) ?? name,
    brand: text(product.brands),
    barcode: code,
    imageUrl: text(product.image_front_url) ?? text(product.image_url),
    quantity: text(product.quantity),
    serving: servingQuantity !== null && servingQuantity > 0
      ? { amount: servingQuantity, unit: "g", gramWeight: servingQuantity, description: servingSize }
      : null,
    nutrientsPer100g: nutrientValues,
    ingredients: ingredientText?.split(/[,;]/).map((v) => v.trim()).filter(Boolean) ?? [],
    allergens: allergenTags.map(stripTag),
    additives: tags(product.additives_tags).map(stripTag),
    labels: labelTags.map(stripTag),
    vegan: labelFlag(labelTags, "vegan"),
    vegetarian: labelFlag(labelTags, "vegetarian"),
    glutenFree: labelTags.includes("en:gluten-free") ? true : allergenTags.includes("en:gluten") ? false : null,
    nutriScore: text(product.nutriscore_grade) ?? text(product.nutrition_grades),
    novaGroup: num(product.nova_group),
    provenance: {
      provider: "OPEN_FOOD_FACTS",
      externalId: code,
      retrievedAt: new Date().toISOString(),
      dataBasis: "PER_100_G",
      preparationState: "PACKAGED_PRODUCT",
      confidence: 0.75,
      sourceReference: `${env.OPEN_FOOD_FACTS_BASE_URL.replace(/\/$/, "")}/product/${code}`,
    },
  };
}

type FetchLike = typeof fetch;

export class OpenFoodFactsProvider implements NutritionProvider {
  readonly id = "OPEN_FOOD_FACTS" as const;
  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async search(_query: string, _limit = 10): Promise<CanonicalFood[]> {
    // OFF search is intentionally disabled for type-ahead: official limit is lower than product lookup.
    return [];
  }

  async getByExternalId(externalId: string): Promise<CanonicalFood | null> {
    return this.getByBarcode(externalId);
  }

  async getByBarcode(input: string): Promise<CanonicalFood | null> {
    const barcode = normalizeBarcode(input);
    if (!barcode) return null;
    const fields = [
      "code","product_name","product_name_tr","generic_name","brands","quantity","serving_size","serving_quantity",
      "image_front_url","image_url","ingredients_text","ingredients_text_tr","allergens_tags","additives_tags","labels_tags",
      "nutriscore_grade","nutrition_grades","nova_group","nutriments"
    ].join(",");
    const url = `${env.OPEN_FOOD_FACTS_BASE_URL.replace(/\/$/, "")}/api/v2/product/${barcode}.json?fields=${encodeURIComponent(fields)}`;
    const response = await this.fetchImpl(url, {
      headers: { "User-Agent": env.OPEN_FOOD_FACTS_USER_AGENT },
      signal: AbortSignal.timeout(env.NUTRITION_PROVIDER_TIMEOUT_MS),
    });
    if (response.status === 404) return null;
    if (response.status === 429) throw new Error("OPEN_FOOD_FACTS_RATE_LIMIT");
    if (!response.ok) throw new Error(`OPEN_FOOD_FACTS_${response.status}`);
    const body = record(await response.json());
    if (num(body.status) === 0) return null;
    return normalizeOpenFoodFactsProduct(body, barcode);
  }
}

export const openFoodFactsProvider = new OpenFoodFactsProvider();
