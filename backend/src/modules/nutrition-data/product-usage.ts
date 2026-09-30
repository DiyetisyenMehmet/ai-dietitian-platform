import type { BarcodeQualityTier } from "./barcode-quality";
import type {
  CanonicalFood,
  ProductUsage,
  ProductUsageBasis,
  ProductUsageType,
} from "./nutrition-data.types";

type UsageRule = {
  type: Exclude<ProductUsageType, "UNKNOWN">;
  category: RegExp;
  context: RegExp;
  preparation?: RegExp;
};

const RULES: readonly UsageRule[] = [
  { type: "BLENDING_AROMA", category: /\b(aroma(?:tic)?(?: tea)?|flavou?r(?:ing)?|blend adjunct|tea blend additive|aroma verici|aromatik harman|harman aroması)\b/i, context: /\b(aroma|aromatik|flavou?r|harman)\b/i, preparation: /\b(blend with|mix with (?:black |green |herbal )?tea|use (?:it )?for aroma|add (?:it )?for aroma|flavou?r(?:ing)?|harmanla|harmanlayarak|aroma ver)\b/i },
  { type: "BREWING", category: /\b(black teas?|green teas?|herbal teas?|teas?|tea leaves?|infusions?|coffee beans?|ground coffee|çaylar?|siyah çay|yeşil çay|bitki çayı|kahve çekirdeği|öğütülmüş kahve)\b/i, context: /\b(tea|çay|coffee|kahve|infusion|demlik)\b/i, preparation: /\b(brew|brewing|steep|steeping|infuse|infusion|demle|demlen|demleyin)\b/i },
  { type: "SPICE", category: /\b(spices?|seasonings?|dried herbs?|baharat(?:lar)?|çeşni(?:ler)?|kurutulmuş otlar?)\b/i, context: /\b(spice|seasoning|baharat|çeşni|pepper|karabiber|cumin|kimyon|paprika|pul biber|thyme|kekik)\b/i },
  { type: "SAUCE", category: /\b(sauces?|dressings?|ketchup|mayonnaise|mustard sauce|salsa|soslar?|salata sosu|ketçap|mayonez)\b/i, context: /\b(sauce|dressing|ketchup|mayonnaise|salsa|sos|ketçap|mayonez)\b/i },
  { type: "SWEETENER", category: /\b(sugars?|honey|sweeteners?|table syrup|molasses|şeker(?:ler)?|bal|tatlandırıcı(?:lar)?|pekmez)\b/i, context: /\b(sugar|honey|sweetener|molasses|şeker|bal|tatlandırıcı|pekmez)\b/i },
  { type: "PREPARATION_BASE", category: /\b(powdered drinks?|drink mixes?|instant drinks?|concentrates?|soup mixes?|dessert mixes?|meal mixes?|toz içecek|içecek tozu|hazır karışım|konsantre|çorba karışımı|tatlı karışımı)\b/i, context: /\b(powder|mix|concentrate|toz|karışım|konsantre)\b/i, preparation: /\b(dilute|mix with water|mix with milk|add water|add milk|prepare with|dissolve in|suyla karıştır|su ekle|sütle karıştır|süt ekle|çözündür|seyrelt|hazırla)\b/i },
  { type: "COOKING_INGREDIENT", category: /\b(cooking oils?|olive oils?|vegetable oils?|flours?|baking ingredients?|cooking ingredients?|zeytinyağ(?:ı|ları)?|bitkisel yağ(?:lar)?|un(?:lar)?|pişirme malzemeleri?)\b/i, context: /\b(cooking oil|olive oil|vegetable oil|flour|zeytinyağı|ayçiçek yağı|bitkisel yağ|un)\b/i, preparation: /\b(use in cooking|for cooking|cook with|pişirmede kullan|yemek yapımında kullan)\b/i },
  { type: "DIRECT_CONSUMPTION", category: /\b(yogurts?|yoghurts?|kefirs?|snacks?|snack bars?|protein bars?|biscuits?|cookies?|chips|crisps|ready[- ]to[- ]eat|soft drinks?|waters?|fruit juices?|yoğurt(?:lar)?|kefir(?:ler)?|atıştırmalık(?:lar)?|bisküvi(?:ler)?|cips(?:ler)?|hazır tüketim)\b/i, context: /\b(yogurt|yoghurt|kefir|snack|protein bar|biscuit|cookie|chips|crisps|yoğurt|kefir|atıştırmalık|bisküvi|cips)\b/i },
];

function normalized(value: string | null | undefined): string {
  return (value ?? "").toLocaleLowerCase("tr-TR").replace(/[_:/-]+/g, " ").replace(/\s+/g, " ").trim();
}
function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
function unknownUsage(basis: ProductUsageBasis, evidence: string[] = []): ProductUsage {
  return { type: "UNKNOWN", basis, evidence: unique(evidence).slice(0, 8) };
}
function singleCandidate(value: string, field: "category" | "preparation"):
  { type: Exclude<ProductUsageType, "UNKNOWN">; evidence: string[] } | null | "CONFLICT" {
  if (!value) return null;
  const matches = RULES.filter((rule) => rule[field]?.test(value));
  const types = [...new Set(matches.map((match) => match.type))];
  if (types.length > 1) return "CONFLICT";
  if (types.length === 0) return null;
  return { type: types[0]!, evidence: [value] };
}

export function classifyProductUsage(food: CanonicalFood, qualityTier: BarcodeQualityTier): ProductUsage {
  if (qualityTier === "REJECT" || qualityTier === "WEAK") return unknownUsage("INSUFFICIENT_DATA_QUALITY");

  const preparation = normalized(food.provenance.preparationInstructions);
  const preparationCandidate = singleCandidate(preparation, "preparation");
  if (preparationCandidate === "CONFLICT") return unknownUsage("CONFLICTING_EVIDENCE", preparation ? [preparation] : []);
  if (preparationCandidate) return { type: preparationCandidate.type, basis: "SOURCE_PREPARATION", evidence: preparationCandidate.evidence };

  const categories = unique(food.provenance.sourceCategories ?? []).map(normalized).filter(Boolean);
  const categoryCandidate = singleCandidate(categories.join(" | "), "category");
  if (categoryCandidate === "CONFLICT") return unknownUsage("CONFLICTING_EVIDENCE", categories);
  if (categoryCandidate) return { type: categoryCandidate.type, basis: "SOURCE_CATEGORY", evidence: categories.slice(0, 8) };

  if (qualityTier === "STRONG") {
    const identity = normalized(`${food.displayNameTr} ${food.name}`);
    const secondaryContext = normalized(`${food.ingredients.join(" ")} ${food.labels.join(" ")}`);
    const matches = RULES.filter((rule) => rule.context.test(identity) && rule.context.test(secondaryContext));
    const types = [...new Set(matches.map((match) => match.type))];
    if (types.length === 1) return { type: types[0]!, basis: "CORROBORATED_PRODUCT_CONTEXT", evidence: unique([identity, secondaryContext]).slice(0, 8) };
    if (types.length > 1) return unknownUsage("CONFLICTING_EVIDENCE", [identity, secondaryContext]);
  }
  return unknownUsage("INSUFFICIENT_EVIDENCE");
}

export function withProductUsage(food: CanonicalFood, qualityTier: BarcodeQualityTier): CanonicalFood {
  if (food.productUsage) return food;
  return { ...food, productUsage: classifyProductUsage(food, qualityTier) };
}

export function unknownProductUsage(basis: ProductUsageBasis = "INSUFFICIENT_EVIDENCE"): ProductUsage {
  return unknownUsage(basis);
}
