/**
 * Allergen validation guard for generated meal content.
 *
 * Allergies are HARD constraints in Diewish. Beyond instructing the model to
 * exclude them, this module performs a deterministic post-generation pass over
 * every generated food/meal and reports any allergen that slipped through so
 * the caller can regenerate or reject the plan. This defense-in-depth check
 * never silently serves an allergen to the user.
 */

import type { DailyPlan } from "../types";

/** A detected allergen occurrence within generated content. */
export interface AllergenViolation {
  /** The user-declared allergen that was matched. */
  allergen: string;
  /** Cycle day label where it was found. */
  dayLabel: string;
  /** Meal name where it was found. */
  mealName: string;
  /** The offending food name. */
  food: string;
}

/**
 * Normalizes a string for case-insensitive, accent-tolerant substring matching.
 */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    // Strip combining diacritical marks so "süt" matches "sut", etc.
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Scans a generated rotation cycle for any declared allergen appearing in a
 * food name.
 *
 * @param cycle - The generated daily plans (rotation cycle).
 * @param allergies - User-declared allergens (hard exclusions).
 * @returns All detected violations (empty when the content is clean).
 */
export function findAllergenViolations(
  cycle: DailyPlan[],
  allergies: string[],
): AllergenViolation[] {
  const normalizedAllergens = allergies
    .map((allergen) => ({ raw: allergen, norm: normalize(allergen) }))
    .filter((entry) => entry.norm.length > 0);

  if (normalizedAllergens.length === 0) return [];

  const violations: AllergenViolation[] = [];
  for (const day of cycle) {
    for (const meal of day.meals) {
      for (const food of meal.foods) {
        const foodNorm = normalize(food.name);
        for (const allergen of normalizedAllergens) {
          if (foodNorm.includes(allergen.norm)) {
            violations.push({
              allergen: allergen.raw,
              dayLabel: day.dayLabel,
              mealName: meal.name,
              food: food.name,
            });
          }
        }
      }
    }
  }
  return violations;
}
