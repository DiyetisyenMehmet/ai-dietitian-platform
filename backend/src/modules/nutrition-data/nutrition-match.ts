import type { CanonicalFood } from "./nutrition-data.types";
import { expandNutritionProviderQueries, normalizeTurkishSearch } from "./nutrition-query-aliases";

const STOP_WORDS = new Set([
  "ve",
  "veya",
  "ile",
  "and",
  "or",
  "of",
  "with",
  "without",
  "the",
  "a",
  "an",
]);

const PREPARATION_WORDS = new Set([
  "cooked",
  "raw",
  "boiled",
  "roasted",
  "fried",
  "fresh",
  "frozen",
  "prepared",
  "pisimis",
  "pismis",
  "cig",
  "haslanmis",
  "firinda",
]);

function stem(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function tokens(value: string): string[] {
  return normalizeTurkishSearch(value)
    .split(/\s+/)
    .map(stem)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function coreTokens(value: string): string[] {
  const result = tokens(value).filter((token) => !PREPARATION_WORDS.has(token));
  return result.length > 0 ? [...new Set(result)] : [...new Set(tokens(value))];
}

function foodText(food: CanonicalFood): string {
  return [food.name, food.displayNameTr, food.brand ?? "", food.provenance.preparationState ?? ""]
    .filter(Boolean)
    .join(" ");
}

function scoreIntent(intent: string, food: CanonicalFood): number {
  const queryTokens = coreTokens(intent);
  if (queryTokens.length === 0) return 0;

  const candidateTokens = new Set(coreTokens(foodText(food)));
  const overlap = queryTokens.filter((token) => candidateTokens.has(token));
  if (overlap.length === 0) return 0;

  const queryCoverage = overlap.length / queryTokens.length;
  const overlapStrength = Math.min(overlap.length / 2, 1);
  const normalizedIntent = normalizeTurkishSearch(intent);
  const normalizedCandidate = normalizeTurkishSearch(foodText(food));
  const phraseBonus = normalizedIntent.length >= 4 && normalizedCandidate.includes(normalizedIntent) ? 0.12 : 0;

  let score = queryCoverage * 0.72 + overlapStrength * 0.16 + phraseBonus;

  // Ingredient matching should prefer generic food records over branded products
  // when lexical relevance is otherwise identical. Barcode lookup has its own path.
  if (food.brand) score -= 0.05;

  return Math.max(0, Math.min(1, score));
}

export interface NutritionMatch {
  food: CanonicalFood;
  /** 0..1 lexical/provider-query relevance, separate from source provenance confidence. */
  relevance: number;
}

/**
 * Ranks provider candidates against both the original Turkish ingredient name
 * and deterministic provider aliases. A candidate with no meaningful token
 * overlap is rejected rather than silently contributing nutrients for the
 * wrong food.
 */
export function rankNutritionMatches(query: string, candidates: readonly CanonicalFood[]): NutritionMatch[] {
  const intents = [...new Set([query, ...expandNutritionProviderQueries(query)])].filter(Boolean);
  return candidates
    .map((food) => ({
      food,
      relevance: Math.max(...intents.map((intent) => scoreIntent(intent, food)), 0),
    }))
    .filter((match) => match.relevance >= 0.55)
    .sort((a, b) => {
      const relevance = b.relevance - a.relevance;
      if (relevance !== 0) return relevance;
      const sourceConfidence = b.food.provenance.confidence - a.food.provenance.confidence;
      if (sourceConfidence !== 0) return sourceConfidence;
      return Number(Boolean(a.food.brand)) - Number(Boolean(b.food.brand));
    });
}

export function selectBestNutritionMatch(query: string, candidates: readonly CanonicalFood[]): NutritionMatch | null {
  return rankNutritionMatches(query, candidates)[0] ?? null;
}
