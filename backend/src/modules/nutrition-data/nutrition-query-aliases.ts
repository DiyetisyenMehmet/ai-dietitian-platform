const TURKISH_PROVIDER_PHRASES: readonly [string, string][] = [
  ["tavuk gogsu", "chicken breast"],
  ["dana eti", "beef"],
  ["ton baligi", "tuna"],
  ["kuru fasulye", "beans"],
  ["zeytin yagi", "olive oil"],
  ["zeytinyagi", "olive oil"],
  ["tavuk", "chicken"],
  ["yumurta", "egg"],
  ["yogurt", "yogurt"],
  ["sut", "milk"],
  ["pirinc", "rice"],
  ["mercimek", "lentils"],
  ["fasulye", "beans"],
  ["elma", "apple"],
  ["yulaf", "oats"],
  ["muz", "banana"],
  ["somon", "salmon"],
  ["patates", "potato"],
  ["domates", "tomato"],
  ["salatalik", "cucumber"],
  ["peynir", "cheese"],
  ["hindi", "turkey"],
  ["kiyma", "ground beef"],
  ["pisimis", "cooked"],
  ["pismis", "cooked"],
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
 * already indexed verbatim.
 */
export function expandNutritionProviderQueries(input: string): string[] {
  const original = input.trim();
  if (!original) return [];

  let translated = normalizeTurkishSearch(original);
  for (const [from, to] of TURKISH_PROVIDER_PHRASES) {
    translated = replacePhrase(translated, from, to);
  }
  translated = translated.replace(/\s+/g, " ").trim();

  const queries: string[] = [];
  if (translated && translated.toLocaleLowerCase("en-US") !== original.toLocaleLowerCase("en-US")) {
    queries.push(translated);
  }
  queries.push(original);
  return [...new Set(queries)].slice(0, 2);
}
