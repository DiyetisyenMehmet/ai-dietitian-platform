import { env } from "../../../config/env";
import { normalizeBarcode } from "../barcode";
import { emptyMicronutrients, normalizeMicronutrientAmount, type MicronutrientKey } from "../micronutrients";
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
function uniqueText(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
function labelFlag(all: readonly string[], tag: string): boolean | null {
  if (all.includes(`en:${tag}`)) return true;
  if (all.includes(`en:non-${tag}`)) return false;
  return null;
}
function nutrient(n: Record<string, unknown>, key: string, basis: "100g" | "serving"): number | null {
  return num(n[`${key}_${basis}`]);
}
const OFF_MICRONUTRIENTS: readonly [MicronutrientKey, readonly string[]][] = [
  ["calcium", ["calcium"]],
  ["iron", ["iron"]],
  ["magnesium", ["magnesium"]],
  ["phosphorus", ["phosphorus"]],
  ["potassium", ["potassium"]],
  ["zinc", ["zinc"]],
  ["copper", ["copper"]],
  ["manganese", ["manganese"]],
  ["selenium", ["selenium"]],
  ["iodine", ["iodine"]],
  ["vitaminA", ["vitamin-a"]],
  ["vitaminC", ["vitamin-c"]],
  ["vitaminD", ["vitamin-d"]],
  ["vitaminE", ["vitamin-e"]],
  ["vitaminK", ["vitamin-k"]],
  ["thiamin", ["vitamin-b1", "thiamin"]],
  ["riboflavin", ["vitamin-b2", "riboflavin"]],
  ["niacin", ["vitamin-b3", "vitamin-pp", "niacin"]],
  ["vitaminB6", ["vitamin-b6"]],
  ["folate", ["vitamin-b9", "folates", "folate"]],
  ["vitaminB12", ["vitamin-b12"]],
];

function offMicronutrients(n: Record<string, unknown>, basis: "100g" | "serving") {
  const values = emptyMicronutrients();
  let hasAny = false;
  for (const [canonicalKey, aliases] of OFF_MICRONUTRIENTS) {
    for (const alias of aliases) {
      const raw = nutrient(n, alias, basis);
      if (raw === null) continue;
      const normalized = normalizeMicronutrientAmount(canonicalKey, raw, text(n[`${alias}_unit`]));
      if (normalized === null) continue;
      values[canonicalKey] = normalized;
      hasAny = true;
      break;
    }
  }
  return hasAny ? values : null;
}

function nutrientValues(n: Record<string, unknown>, basis: "100g" | "serving"): NutrientValues {
  const sodiumG = nutrient(n, "sodium", basis);
  const values: NutrientValues = {
    energyKcal: nutrient(n, "energy-kcal", basis),
    proteinG: nutrient(n, "proteins", basis),
    carbohydratesG: nutrient(n, "carbohydrates", basis),
    fatG: nutrient(n, "fat", basis),
    saturatedFatG: nutrient(n, "saturated-fat", basis),
    sugarsG: nutrient(n, "sugars", basis),
    fiberG: nutrient(n, "fiber", basis),
    sodiumMg: sodiumG === null ? null : Math.round(sodiumG * 1000 * 100) / 100,
    saltG: nutrient(n, "salt", basis),
  };
  const micronutrients = offMicronutrients(n, basis);
  if (micronutrients) values.micronutrients = micronutrients;
  return values;
}
function hasNutrientValues(values: NutrientValues): boolean {
  return Object.values(values).some((value) => value !== null);
}
function servingUnitFromDescription(description: string | null): "g" | "ml" | "serving" {
  if (!description) return "serving";
  const normalized = description.toLocaleLowerCase("tr-TR");
  if (/\bml\b|mililitre|milliliter/.test(normalized)) return "ml";
  if (/\bg\b|gram/.test(normalized)) return "g";
  return "serving";
}

function providerUpdatedAt(product: Record<string, unknown>): string | null {
  const epochSeconds = num(product.last_modified_t);
  if (epochSeconds !== null && epochSeconds > 0) return new Date(epochSeconds * 1000).toISOString();
  const raw = text(product.last_modified_datetime);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function normalizeOpenFoodFactsProduct(raw: unknown, barcodeHint?: string): CanonicalFood | null {
  const root = record(raw);
  const product = "product" in root ? record(root.product) : root;
  const code = text(product.code) ?? text(root.code) ?? barcodeHint ?? null;
  const name = text(product.product_name_tr) ?? text(product.product_name) ?? text(product.generic_name);
  if (!code || !name) return null;
  const nutriments = record(product.nutriments);
  const nutrientsPer100g = nutrientValues(nutriments, "100g");
  const perServing = nutrientValues(nutriments, "serving");
  const labelTags = tags(product.labels_tags);
  const sourceCategories = uniqueText([
    ...tags(product.categories_tags).map(stripTag),
    ...(text(product.categories)?.split(/[,;]/).map((value) => value.trim()) ?? []),
  ]);
  const preparationInstructions =
    text(product.preparation) ?? text(product.preparation_instructions);
  const allergenTags = tags(product.allergens_tags);
  const allergenText = text(product.allergens);
  const ingredientText = text(product.ingredients_text_tr) ?? text(product.ingredients_text);
  const traceText = text(product.traces);
  const traceTags = tags(product.traces_tags).map(stripTag);
  const crossContaminationWarnings = uniqueText([
    ...(traceText ? [traceText] : []),
    ...traceTags,
  ]);
  const servingQuantity = num(product.serving_quantity);
  const servingSize = text(product.serving_size);
  const servingUnit = servingUnitFromDescription(servingSize);
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
      ? {
          amount: servingQuantity,
          unit: servingUnit,
          // Volume/count reference servings are not silently converted to grams.
          gramWeight: servingUnit === "g" ? servingQuantity : null,
          description: servingSize,
        }
      : null,
    nutrientsPer100g,
    nutrientsPerServing: hasNutrientValues(perServing) ? perServing : null,
    ingredients: ingredientText?.split(/[,;]/).map((v) => v.trim()).filter(Boolean) ?? [],
    allergens: uniqueText([
      ...allergenTags.map(stripTag),
      ...(allergenText ? allergenText.split(/[,;]/).map((value) => value.trim()) : []),
    ]),
    allergenEvidence: {
      ingredientList: ingredientText ? "DECLARED" : "MISSING",
      allergenDeclaration: allergenText || allergenTags.length > 0 ? "DECLARED" : "MISSING",
      crossContaminationWarnings,
    },
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
      providerUpdatedAt: providerUpdatedAt(product),
      sourceCategories,
      preparationInstructions,
    },
  };
}

type FetchLike = typeof fetch;

export class OpenFoodFactsProvider implements NutritionProvider {
  readonly id = "OPEN_FOOD_FACTS" as const;
  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async search(query: string, limit = 10): Promise<CanonicalFood[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const fields = [
      "code","product_name","product_name_tr","generic_name","brands","quantity","serving_size","serving_quantity",
      "image_front_url","image_url","ingredients_text","ingredients_text_tr","allergens","allergens_tags","traces","traces_tags","additives_tags","labels_tags",
      "categories","categories_tags","preparation","preparation_instructions",
      "nutriscore_grade","nutrition_grades","nova_group","last_modified_t","last_modified_datetime","nutriments"
    ].join(",");
    const params = new URLSearchParams({
      search_terms: trimmed,
      search_simple: "1",
      action: "process",
      json: "1",
      page_size: String(Math.min(Math.max(limit, 1), 25)),
      fields,
    });
    const url = `${env.OPEN_FOOD_FACTS_BASE_URL.replace(/\/$/, "")}/cgi/search.pl?${params.toString()}`;
    const response = await this.fetchImpl(url, {
      headers: { "User-Agent": env.OPEN_FOOD_FACTS_USER_AGENT },
      signal: AbortSignal.timeout(env.NUTRITION_PROVIDER_TIMEOUT_MS),
    });
    if (response.status === 429) throw new Error("OPEN_FOOD_FACTS_RATE_LIMIT");
    if (!response.ok) throw new Error(`OPEN_FOOD_FACTS_${response.status}`);
    const body = record(await response.json());
    const products = Array.isArray(body.products) ? body.products : [];
    return products
      .map((product) => normalizeOpenFoodFactsProduct(product))
      .filter((food): food is CanonicalFood => food !== null);
  }

  async getByExternalId(externalId: string): Promise<CanonicalFood | null> {
    return this.getByBarcode(externalId);
  }

  async getByBarcode(input: string): Promise<CanonicalFood | null> {
    const barcode = normalizeBarcode(input);
    if (!barcode) return null;
    const fields = [
      "code","product_name","product_name_tr","generic_name","brands","quantity","serving_size","serving_quantity",
      "image_front_url","image_url","ingredients_text","ingredients_text_tr","allergens","allergens_tags","traces","traces_tags","additives_tags","labels_tags",
      "categories","categories_tags","preparation","preparation_instructions",
      "nutriscore_grade","nutrition_grades","nova_group","last_modified_t","last_modified_datetime","nutriments"
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
