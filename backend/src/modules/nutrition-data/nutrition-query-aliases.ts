const TURKISH_PROVIDER_PHRASES: readonly [string, string][] = [
  // Multi-word phrases must stay before their shorter components.
  ["domates sosu ve salca", "tomato sauce"],
  ["domates sosu ve domates salcasi", "tomato sauce"],
  ["domates salcasi", "tomato paste"],
  ["domates sosu", "tomato sauce"],
  ["biber salcasi", "pepper paste"],
  ["arpa sehriye", "orzo pasta cooked"],
  ["tel sehriye", "vermicelli pasta cooked"],
  ["yesil kabak", "zucchini"],
  ["bal kabagi", "pumpkin"],
  ["tavuk gogsu", "chicken breast"],
  ["dana eti", "beef"],
  ["ton baligi", "tuna"],
  ["kuru fasulye", "beans"],
  ["zeytin yagi", "olive oil"],
  ["zeytinyagi", "olive oil"],
  ["aycicek yagi", "sunflower oil"],
  ["kanola yagi", "canola oil"],
  ["misir yagi", "corn oil"],
  ["tereyagi", "butter"],
  ["kirmizi biber", "red pepper"],
  ["yesil biber", "green pepper"],
  ["tavuk", "chicken"],
  ["yumurta", "egg"],
  ["yogurt", "yogurt"],
  ["sut", "milk"],
  ["pirinc", "rice"],
  ["bulgur", "bulgur"],
  ["mercimek", "lentils"],
  ["nohut", "chickpeas"],
  ["fasulye", "beans"],
  ["bezelye", "peas"],
  ["sehriye", "pasta cooked"],
  ["makarna", "pasta"],
  ["kuskus", "couscous"],
  ["irmik", "semolina"],
  ["ekmek", "bread"],
  ["patates", "potato"],
  ["domates", "tomato"],
  ["salatalik", "cucumber"],
  ["kabak", "zucchini"],
  ["patlican", "eggplant"],
  ["brokoli", "broccoli"],
  ["karnabahar", "cauliflower"],
  ["havuc", "carrot"],
  ["sogan", "onion"],
  ["sarimsak", "garlic"],
  ["mantar", "mushrooms"],
  ["misir", "corn"],
  ["marul", "lettuce"],
  ["maydanoz", "parsley"],
  ["dereotu", "dill"],
  ["limon", "lemon"],
  ["peynir", "cheese"],
  ["hindi", "turkey"],
  ["kiyma", "ground beef"],
  ["zeytin", "olives"],
  ["tuz", "salt"],
  ["seker", "sugar"],
  ["bal", "honey"],
  ["baharatlar", "spices"],
  ["baharat", "spices"],
  ["elma", "apple"],
  ["yulaf", "oats"],
  ["muz", "banana"],
  ["somon", "salmon"],
  ["pisimis", "cooked"],
  ["pismis", "cooked"],
  ["haslanmis", "boiled"],
  ["firinda", "roasted"],
  ["cig", "raw"],
] as const;

/**
 * Provider queries are facts-only food-name lookups. This normalization never
 * receives profile, health, allergy or tracking data.
 */
export function normalizeTurkishSearch(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function replacePhrase(input: string, from: string, to: string): string {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return input.replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "g"), (_match, prefix: string) => `${prefix}${to}`);
}

/**
 * Returns a bounded provider-query sequence. Common Turkish ingredient names
 * are translated deterministically for USDA's English-first corpus, while the
 * original query is retained as a fallback for brands and foods whose names are
 * already indexed verbatim. Ambiguous standalone terms are intentionally left
 * untranslated rather than forcing a potentially incorrect nutrient source.
 */
export function expandNutritionProviderQueries(input: string): string[] {
  const original = input.trim();
  if (!original) return [];

  let translated = normalizeTurkishSearch(original);
  for (const [from, to] of TURKISH_PROVIDER_PHRASES) {
    translated = replacePhrase(translated, from, to);
  }
  translated = translated
    .replace(/\b(?:ve|veya|ile)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const queries: string[] = [];
  if (translated && translated.toLocaleLowerCase("en-US") !== original.toLocaleLowerCase("en-US")) {
    queries.push(translated);
  }
  queries.push(original);
  return [...new Set(queries)].slice(0, 2);
}
