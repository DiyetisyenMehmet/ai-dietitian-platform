export interface ProductDisplayFood {
  brand: string | null;
  ingredients: string[];
  allergens: string[];
  additives: string[];
  vegan: boolean | null;
  vegetarian: boolean | null;
  glutenFree: boolean | null;
  nutriScore: string | null;
  novaGroup: number | null;
  allergenEvidence?: {
    ingredientList: "DECLARED" | "MISSING";
    allergenDeclaration: "DECLARED" | "MISSING";
    crossContaminationWarnings: string[];
  };
  productCatalog?: {
    category: { name: string } | null;
    subcategory: { name: string } | null;
    brand: { name: string } | null;
    family: { name: string } | null;
    variant: { name: string } | null;
  };
  productLifecycle?: {
    status: "ACTIVE" | "OLD_VERSION" | "DISCONTINUED" | "REPLACED" | "UNKNOWN";
  };
  productUsage?: {
    type:
      | "DIRECT_CONSUMPTION"
      | "BREWING"
      | "BLENDING_AROMA"
      | "SPICE"
      | "COOKING_INGREDIENT"
      | "SAUCE"
      | "SWEETENER"
      | "PREPARATION_BASE"
      | "UNKNOWN";
  };
}

export interface ProductDisplayScan {
  dataQuality: {
    status: "QUALITY_ACCEPTED" | "QUALITY_PARTIAL";
  } | null;
}

export type ProductInfoRow = readonly [label: string, value: string];

export function nutriScoreText(value: string | null): string {
  const grade = value?.trim().toUpperCase() ?? "";
  return /^[A-E]$/.test(grade) ? grade : "Nutri-Score bilgisi yok";
}

export function novaText(value: number | null): string {
  return Number.isInteger(value) && value !== null && value >= 1 && value <= 4
    ? String(value)
    : "NOVA bilgisi yok";
}

export function productUsageText(food: ProductDisplayFood): string | null {
  switch (food.productUsage?.type) {
    case "DIRECT_CONSUMPTION": return "Doğrudan tüketilir";
    case "BREWING": return "Demlenerek kullanılır";
    case "BLENDING_AROMA": return "Harmanlama / aroma amaçlı kullanılır";
    case "SPICE": return "Baharat / çeşni";
    case "COOKING_INGREDIENT": return "Yemek hazırlamada kullanılır";
    case "SAUCE": return "Sos";
    case "SWEETENER": return "Tatlandırıcı";
    case "PREPARATION_BASE": return "Hazırlanarak tüketilir";
    default: return null;
  }
}

export function productLifecycleText(food: ProductDisplayFood): string | null {
  switch (food.productLifecycle?.status) {
    case "ACTIVE": return "Güncel ürün";
    case "OLD_VERSION": return "Eski sürüm";
    case "DISCONTINUED": return "Üretimden kaldırılmış";
    case "REPLACED": return "Yeni sürümü mevcut";
    default: return null;
  }
}

function booleanText(value: boolean | null, yes: string, no: string): string | null {
  return value === true ? yes : value === false ? no : null;
}

export function allergenDataNotice(food: ProductDisplayFood): string | null {
  const evidence = food.allergenEvidence;
  if (
    evidence?.ingredientList === "DECLARED" &&
    evidence.allergenDeclaration === "DECLARED"
  ) {
    return null;
  }
  return "Alerjen bilgisi yeterli değil. Ambalaj üzerindeki içerik ve alerjen uyarılarını kontrol et.";
}

export function partialProductDataNotice(scan: ProductDisplayScan | null): string | null {
  return scan?.dataQuality?.status === "QUALITY_PARTIAL"
    ? "Bazı ürün veya besin bilgileri eksik."
    : null;
}

export function productInfoRows(food: ProductDisplayFood): ProductInfoRow[] {
  const rows: ProductInfoRow[] = [];
  const lifecycle = productLifecycleText(food);
  const usage = productUsageText(food);
  const vegan = booleanText(food.vegan, "Evet", "Hayır");
  const vegetarian = booleanText(food.vegetarian, "Evet", "Hayır");
  const gluten = booleanText(food.glutenFree, "Glutensiz", "Gluten içeriyor");

  if (lifecycle) rows.push(["Ürün durumu", lifecycle]);
  if (food.productCatalog?.category?.name) rows.push(["Kategori", food.productCatalog.category.name]);
  if (food.productCatalog?.subcategory?.name) rows.push(["Alt kategori", food.productCatalog.subcategory.name]);
  if (food.productCatalog?.brand?.name || food.brand) {
    rows.push(["Marka", food.productCatalog?.brand?.name ?? food.brand!]);
  }
  if (food.productCatalog?.family?.name) rows.push(["Ürün ailesi", food.productCatalog.family.name]);
  if (food.productCatalog?.variant?.name) rows.push(["Varyant", food.productCatalog.variant.name]);
  if (usage) rows.push(["Kullanım", usage]);

  rows.push(["Nutri-Score", nutriScoreText(food.nutriScore)]);
  rows.push(["NOVA", novaText(food.novaGroup)]);

  if (vegan) rows.push(["Vegan", vegan]);
  if (vegetarian) rows.push(["Vejetaryen", vegetarian]);
  if (gluten) rows.push(["Gluten bilgisi", gluten]);

  rows.push([
    "İçerik",
    food.ingredients.length > 0
      ? food.ingredients.join(", ")
      : "İçerik bilgisi sağlanmamış",
  ]);

  if (food.allergens.length > 0) {
    rows.push(["Alerjenler", food.allergens.join(", ")]);
  } else if (
    food.allergenEvidence?.ingredientList === "DECLARED" &&
    food.allergenEvidence.allergenDeclaration === "DECLARED"
  ) {
    rows.push(["Alerjenler", "Kaynakta bildirilen alerjen yok"]);
  }

  if (food.allergenEvidence?.crossContaminationWarnings.length) {
    rows.push([
      "Çapraz bulaşma uyarısı",
      food.allergenEvidence.crossContaminationWarnings.join("; "),
    ]);
  }

  rows.push([
    "Katkı maddeleri",
    food.additives.length > 0
      ? food.additives.join(", ")
      : "Katkı maddesi bilgisi sağlanmamış",
  ]);

  return rows;
}

export function comparisonNutritionText(nutrients: {
  proteinG: number | null;
  fiberG: number | null;
  sugarsG: number | null;
}): string {
  const parts = [
    nutrients.proteinG === null ? null : `Protein ${Math.round(nutrients.proteinG * 10) / 10} g`,
    nutrients.fiberG === null ? null : `Lif ${Math.round(nutrients.fiberG * 10) / 10} g`,
    nutrients.sugarsG === null ? null : `Şeker ${Math.round(nutrients.sugarsG * 10) / 10} g`,
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0
    ? parts.join(" · ")
    : "Karşılaştırılabilir besin ayrıntısı kaynakta yok.";
}
