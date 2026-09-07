import type { PlannedMeal } from "./types";

export interface AdaptiveSnackSuggestion {
  name: string;
  foods: Array<{ name: string; portion: string; calories: number }>;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  source: "SKIPPED_MEAL_BUDGET" | "PLANNED_SNACK_REALLOCATION";
  sourceMealIndex: number | null;
}

interface SnackCandidate {
  name: string;
  foods: Array<{ name: string; portion: string; calories: number }>;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  excludedFor: string[];
  allowedPreferences?: string[];
}

const CANDIDATES: SnackCandidate[] = [
  {
    name: "Yoğurt ve yaban mersini",
    foods: [
      { name: "Sade yoğurt", portion: "150 g", calories: 92 },
      { name: "Yaban mersini", portion: "60 g", calories: 34 },
    ],
    calories: 126,
    proteinGrams: 8,
    carbsGrams: 16,
    fatGrams: 4,
    excludedFor: ["milk", "dairy", "lactose", "süt", "laktoz", "yoğurt"],
    allowedPreferences: ["OMNIVORE", "VEGETARIAN", "PESCATARIAN", "MEDITERRANEAN", "GLUTEN_FREE", "OTHER"],
  },
  {
    name: "Elma ve badem",
    foods: [
      { name: "Elma", portion: "1 küçük", calories: 78 },
      { name: "Badem", portion: "10 g", calories: 58 },
    ],
    calories: 136,
    proteinGrams: 3,
    carbsGrams: 19,
    fatGrams: 6,
    excludedFor: ["almond", "badem", "tree nut", "kuruyemiş", "nuts", "fındık", "ceviz"],
  },
  {
    name: "Muz ve chia",
    foods: [
      { name: "Muz", portion: "1 küçük", calories: 90 },
      { name: "Chia tohumu", portion: "8 g", calories: 39 },
    ],
    calories: 129,
    proteinGrams: 3,
    carbsGrams: 24,
    fatGrams: 3,
    excludedFor: ["chia", "seed", "tohum"],
  },
  {
    name: "Leblebi ve mandalina",
    foods: [
      { name: "Sarı leblebi", portion: "25 g", calories: 91 },
      { name: "Mandalina", portion: "1 küçük", calories: 40 },
    ],
    calories: 131,
    proteinGrams: 5,
    carbsGrams: 24,
    fatGrams: 2,
    excludedFor: ["chickpea", "nohut", "legume", "bakliyat", "leblebi"],
  },
  {
    name: "Avokado ve salatalık",
    foods: [
      { name: "Avokado", portion: "70 g", calories: 112 },
      { name: "Salatalık", portion: "100 g", calories: 15 },
    ],
    calories: 127,
    proteinGrams: 2,
    carbsGrams: 8,
    fatGrams: 10,
    excludedFor: ["avocado", "avokado", "cucumber", "salatalık"],
  },
  {
    name: "Meyve ara öğünü",
    foods: [
      { name: "Elma", portion: "1 küçük", calories: 78 },
      { name: "Mandalina", portion: "1 küçük", calories: 40 },
    ],
    calories: 118,
    proteinGrams: 1,
    carbsGrams: 30,
    fatGrams: 0,
    excludedFor: ["apple", "elma", "mandarin", "mandalina", "citrus", "narenciye"],
  },
];

function norm(value: string): string {
  return value.toLocaleLowerCase("tr-TR").trim();
}

function isExcluded(candidate: SnackCandidate, allergies: string[]): boolean {
  const allergyText = allergies.map(norm).join(" | ");
  return candidate.excludedFor.some((token) => allergyText.includes(norm(token)));
}

function preferenceAllowed(candidate: SnackCandidate, preference: string): boolean {
  if (!candidate.allowedPreferences) return true;
  return candidate.allowedPreferences.includes(preference);
}

function macroDistance(
  candidate: SnackCandidate,
  target?: { proteinGrams: number; carbsGrams: number; fatGrams: number },
): number {
  if (!target) return 0;
  return (
    Math.abs(candidate.proteinGrams - target.proteinGrams) / Math.max(5, target.proteinGrams) +
    Math.abs(candidate.carbsGrams - target.carbsGrams) / Math.max(10, target.carbsGrams) +
    Math.abs(candidate.fatGrams - target.fatGrams) / Math.max(5, target.fatGrams)
  );
}

export function plannedSnackSuggestion(
  meal: PlannedMeal,
  mealIndex: number,
): AdaptiveSnackSuggestion {
  return {
    name: meal.name,
    foods: meal.foods.map((food) => ({
      name: food.name,
      portion: food.portion,
      calories: food.calories,
    })),
    calories: Math.round(meal.calories),
    proteinGrams: Math.round(meal.proteinGrams * 10) / 10,
    carbsGrams: Math.round(meal.carbsGrams * 10) / 10,
    fatGrams: Math.round(meal.fatGrams * 10) / 10,
    source: "PLANNED_SNACK_REALLOCATION",
    sourceMealIndex: mealIndex,
  };
}

export function chooseAdaptiveSnack(params: {
  calorieBudget: number;
  allergies: string[];
  dietaryPreference: string;
  freedMacros?: { proteinGrams: number; carbsGrams: number; fatGrams: number };
}): AdaptiveSnackSuggestion | null {
  const { calorieBudget, allergies, dietaryPreference, freedMacros } = params;
  if (calorieBudget < 90) return null;

  const eligible = CANDIDATES.filter(
    (candidate) =>
      candidate.calories <= calorieBudget + 10 &&
      !isExcluded(candidate, allergies) &&
      preferenceAllowed(candidate, dietaryPreference),
  );
  if (!eligible.length) return null;

  eligible.sort((a, b) => {
    const aScore =
      Math.abs(calorieBudget - a.calories) / Math.max(100, calorieBudget) +
      macroDistance(a, freedMacros);
    const bScore =
      Math.abs(calorieBudget - b.calories) / Math.max(100, calorieBudget) +
      macroDistance(b, freedMacros);
    return aScore - bScore;
  });

  const candidate = eligible[0];
  return {
    name: candidate.name,
    foods: candidate.foods,
    calories: candidate.calories,
    proteinGrams: candidate.proteinGrams,
    carbsGrams: candidate.carbsGrams,
    fatGrams: candidate.fatGrams,
    source: "SKIPPED_MEAL_BUDGET",
    sourceMealIndex: null,
  };
}
