import type { BarcodeQualityTier } from "./barcode-quality";
import type {
  CanonicalFood,
  ProductCatalogIdentity,
  ProductCatalogNode,
} from "./nutrition-data.types";

interface CategoryRule {
  category: ProductCatalogNode;
  subcategory: ProductCatalogNode;
  pattern: RegExp;
}

const CATEGORY_RULES: readonly CategoryRule[] = [
  { category: { key: "beverages", name: "İçecek" }, subcategory: { key: "tea", name: "Çay" }, pattern: /\b(tea|teas|black tea|green tea|herbal tea|infusion|cay|siyah cay|yesil cay|bitki cayi)\b/i },
  { category: { key: "beverages", name: "İçecek" }, subcategory: { key: "coffee", name: "Kahve" }, pattern: /\b(coffee|coffees|ground coffee|coffee beans|kahve)\b/i },
  { category: { key: "beverages", name: "İçecek" }, subcategory: { key: "juice", name: "Meyve suyu" }, pattern: /\b(fruit juice|juice|juices|meyve suyu)\b/i },
  { category: { key: "beverages", name: "İçecek" }, subcategory: { key: "water", name: "Su" }, pattern: /\b(water|waters|mineral water|su|maden suyu)\b/i },
  { category: { key: "beverages", name: "İçecek" }, subcategory: { key: "soft-drink", name: "Hazır içecek" }, pattern: /\b(soft drink|soft drinks|soda|carbonated drink|gazli icecek)\b/i },
  { category: { key: "dairy", name: "Süt ürünleri" }, subcategory: { key: "yogurt", name: "Yoğurt" }, pattern: /\b(yogurt|yoghurt|yogurts|yoghurts|yogurtlar)\b/i },
  { category: { key: "dairy", name: "Süt ürünleri" }, subcategory: { key: "kefir", name: "Kefir" }, pattern: /\b(kefir|kefirs)\b/i },
  { category: { key: "dairy", name: "Süt ürünleri" }, subcategory: { key: "milk", name: "Süt" }, pattern: /\b(milk|milks|sut)\b/i },
  { category: { key: "snacks", name: "Atıştırmalık" }, subcategory: { key: "bar", name: "Bar" }, pattern: /\b(snack bar|protein bar|cereal bar|bars)\b/i },
  { category: { key: "snacks", name: "Atıştırmalık" }, subcategory: { key: "biscuit", name: "Bisküvi" }, pattern: /\b(biscuit|biscuits|cookie|cookies|biskuvi)\b/i },
  { category: { key: "snacks", name: "Atıştırmalık" }, subcategory: { key: "chips", name: "Cips" }, pattern: /\b(chips|crisps|cips)\b/i },
  { category: { key: "spices-seasonings", name: "Baharat / çeşni" }, subcategory: { key: "spice", name: "Baharat / çeşni" }, pattern: /\b(spice|spices|seasoning|seasonings|dried herbs|baharat|cesni)\b/i },
  { category: { key: "grains-bakery", name: "Ekmek / tahıl" }, subcategory: { key: "bread", name: "Ekmek" }, pattern: /\b(bread|breads|ekmek)\b/i },
  { category: { key: "grains-bakery", name: "Ekmek / tahıl" }, subcategory: { key: "grain", name: "Tahıl / un" }, pattern: /\b(cereal|cereals|grain|grains|oats|flour|rice|tahil|un|pirinc)\b/i },
  { category: { key: "meat-fish", name: "Et / tavuk / balık" }, subcategory: { key: "meat", name: "Et" }, pattern: /\b(meat|beef|lamb|pork|et|dana|kuzu)\b/i },
  { category: { key: "meat-fish", name: "Et / tavuk / balık" }, subcategory: { key: "poultry", name: "Tavuk / kümes hayvanı" }, pattern: /\b(chicken|poultry|turkey|tavuk|hindi)\b/i },
  { category: { key: "meat-fish", name: "Et / tavuk / balık" }, subcategory: { key: "fish", name: "Balık / deniz ürünü" }, pattern: /\b(fish|seafood|balik|deniz urunu)\b/i },
  { category: { key: "produce", name: "Meyve / sebze" }, subcategory: { key: "fruit", name: "Meyve" }, pattern: /\b(fruit|fruits|meyve)\b/i },
  { category: { key: "produce", name: "Meyve / sebze" }, subcategory: { key: "vegetable", name: "Sebze" }, pattern: /\b(vegetable|vegetables|sebze)\b/i },
  { category: { key: "oils", name: "Yağlar" }, subcategory: { key: "olive-oil", name: "Zeytinyağı" }, pattern: /\b(olive oil|zeytinyagi)\b/i },
  { category: { key: "oils", name: "Yağlar" }, subcategory: { key: "vegetable-oil", name: "Bitkisel yağ" }, pattern: /\b(vegetable oil|sunflower oil|canola oil|bitkisel yag|aycicek yagi)\b/i },
  { category: { key: "sauces", name: "Soslar" }, subcategory: { key: "sauce", name: "Sos" }, pattern: /\b(sauce|sauces|ketchup|mayonnaise|mustard sauce|salsa|sos|ketcap|mayonez)\b/i },
  { category: { key: "sweeteners", name: "Tatlandırıcılar" }, subcategory: { key: "honey", name: "Bal" }, pattern: /\b(honey|bal)\b/i },
  { category: { key: "sweeteners", name: "Tatlandırıcılar" }, subcategory: { key: "sugar", name: "Şeker / tatlandırıcı" }, pattern: /\b(sugar|sugars|sweetener|sweeteners|molasses|seker|tatlandirici|pekmez)\b/i },
  { category: { key: "ready-meals", name: "Hazır yemekler" }, subcategory: { key: "ready-meal", name: "Hazır yemek" }, pattern: /\b(ready meal|ready meals|prepared meal|prepared meals|hazir yemek)\b/i },
];

function cleanDisplay(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeCatalogKey(value: string | null | undefined): string {
  return cleanDisplay(value)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ç]/g, "c")
    .replace(/[ğ]/g, "g")
    .replace(/[ı]/g, "i")
    .replace(/[ö]/g, "o")
    .replace(/[ş]/g, "s")
    .replace(/[ü]/g, "u")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(cleanDisplay).filter(Boolean))];
}

function categoryIdentity(food: CanonicalFood): {
  category: ProductCatalogNode | null;
  subcategory: ProductCatalogNode | null;
  evidence: string[];
} {
  const evidence = unique(food.provenance.sourceCategories ?? []);
  const matches: CategoryRule[] = [];
  for (const source of evidence) {
    const normalized = normalizeCatalogKey(source);
    for (const rule of CATEGORY_RULES) {
      if (rule.pattern.test(normalized)) matches.push(rule);
    }
  }
  const categoryKeys = [...new Set(matches.map((match) => match.category.key))];
  if (categoryKeys.length !== 1) return { category: null, subcategory: null, evidence };
  const category = matches.find((match) => match.category.key === categoryKeys[0])!.category;
  const subcategories = [...new Map(
    matches
      .filter((match) => match.category.key === category.key)
      .map((match) => [match.subcategory.key, match.subcategory]),
  ).values()];
  return {
    category,
    subcategory: subcategories.length === 1 ? subcategories[0]! : null,
    evidence,
  };
}

function brandIdentity(food: CanonicalFood): ProductCatalogNode | null {
  const name = cleanDisplay(food.brand);
  const key = normalizeCatalogKey(name);
  return name && key ? { key, name } : null;
}

function withoutBrandPrefix(name: string, brand: ProductCatalogNode): string {
  const words = cleanDisplay(name).split(" ");
  const brandWordCount = cleanDisplay(brand.name).split(" ").length;
  if (words.length <= brandWordCount) return name;
  const candidate = words.slice(0, brandWordCount).join(" ");
  return normalizeCatalogKey(candidate) === brand.key
    ? words.slice(brandWordCount).join(" ")
    : name;
}

function familyName(food: CanonicalFood, brand: ProductCatalogNode): string | null {
  let value = cleanDisplay(food.displayNameTr || food.name);
  if (!value) return null;
  value = withoutBrandPrefix(value, brand);
  value = value
    .replace(/\b\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:kg|g|gr|mg|ml|cl|l)\b/gi, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|gr|mg|ml|cl|l)\b/gi, " ")
    .replace(/\b(?:paket|package|pack)\b/gi, " ")
    .replace(/[()\[\]{}|/\\_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const key = normalizeCatalogKey(value);
  if (key.length < 2 || ["product", "urun", "food"].includes(key)) return null;
  return value;
}

function unresolved(food: CanonicalFood, brand: ProductCatalogNode | null): ProductCatalogIdentity {
  return {
    category: null,
    subcategory: null,
    brand,
    family: null,
    variant: null,
    barcode: food.barcode,
    derivation: {
      categoryBasis: "UNRESOLVED",
      familyBasis: "UNRESOLVED",
      variantBasis: "UNRESOLVED",
      evidence: unique(food.provenance.sourceCategories ?? []).slice(0, 8),
    },
  };
}

export function buildProductCatalog(
  food: CanonicalFood,
  qualityTier: BarcodeQualityTier,
): ProductCatalogIdentity {
  const brand = brandIdentity(food);
  if (qualityTier === "REJECT" || qualityTier === "WEAK") return unresolved(food, brand);

  const categoryResult = categoryIdentity(food);
  const familyDisplay = brand ? familyName(food, brand) : null;
  const familyKey = familyDisplay && brand
    ? `${brand.key}::${normalizeCatalogKey(familyDisplay)}`
    : null;
  const family = familyKey && familyDisplay ? { key: familyKey, name: familyDisplay } : null;

  let variant: ProductCatalogIdentity["variant"] = null;
  let variantBasis: ProductCatalogIdentity["derivation"]["variantBasis"] = "UNRESOLVED";
  if (family && food.barcode) {
    variant = {
      key: `${family.key}::gtin:${food.barcode}`,
      name: food.quantity ? `${family.name} ${cleanDisplay(food.quantity)}` : family.name,
      barcode: food.barcode,
      packageQuantity: food.quantity,
    };
    variantBasis = "BARCODE";
  } else if (family && food.quantity) {
    variant = {
      key: `${family.key}::package:${normalizeCatalogKey(food.quantity)}`,
      name: `${family.name} ${cleanDisplay(food.quantity)}`,
      barcode: null,
      packageQuantity: food.quantity,
    };
    variantBasis = "PACKAGE_QUANTITY";
  }

  return {
    category: categoryResult.category,
    subcategory: categoryResult.subcategory,
    brand,
    family,
    variant,
    barcode: food.barcode,
    derivation: {
      categoryBasis: categoryResult.category ? "SOURCE_CATEGORY" : "UNRESOLVED",
      familyBasis: family ? "BRAND_PRODUCT_NAME" : "UNRESOLVED",
      variantBasis,
      evidence: unique([
        ...categoryResult.evidence,
        brand?.name ?? "",
        family?.name ?? "",
        food.quantity ?? "",
      ]).slice(0, 8),
    },
  };
}

export function withProductCatalog(
  food: CanonicalFood,
  qualityTier: BarcodeQualityTier,
): CanonicalFood {
  if (food.productCatalog) return food;
  return { ...food, productCatalog: buildProductCatalog(food, qualityTier) };
}
