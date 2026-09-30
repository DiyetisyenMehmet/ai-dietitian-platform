/**
 * Allergen validation guard for generated meal content.
 *
 * Allergies are HARD constraints in Diewish. Beyond instructing the model to
 * exclude them, this module performs a deterministic post-generation pass over
 * every generated food/meal and reports any allergen that slipped through so
 * the caller can regenerate or reject the plan. This defense-in-depth check
 * never silently serves an allergen to the user.
 */

import { assessPlannedFoodAllergenSafety } from "../../nutrition-data/allergen-safety";
import type { DailyPlan } from "../types";

/** A detected allergen occurrence within generated content. */
export interface AllergenViolation {
  /** Explicit risk or insufficient ingredient evidence. */
  reason: "KNOWN_RISK" | "UNKNOWN";
  /** User-declared allergens matched by deterministic evidence. */
  matchedAllergens: string[];
  /** Cycle day label where it was found. */
  dayLabel: string;
  /** Meal name where it was found. */
  mealName: string;
  /** The offending or insufficiently-described food name. */
  food: string;
}

/**
 * Scans a generated rotation cycle using the central allergen-safety rule.
 * Product/food name can establish an explicit risk, but cannot establish safety;
 * allergy-constrained generated foods must also carry explicit ingredients.
 *
 * @param cycle - The generated daily plans (rotation cycle).
 * @param allergies - User-declared allergens (hard exclusions).
 * @returns All detected violations (empty when the content is clean).
 */
export function findAllergenViolations(
  cycle: DailyPlan[],
  allergies: string[],
): AllergenViolation[] {
  if (allergies.map((item) => item.trim()).filter(Boolean).length === 0) return [];

  const violations: AllergenViolation[] = [];
  for (const day of cycle) {
    for (const meal of day.meals) {
      for (const food of meal.foods) {
        const assessment = assessPlannedFoodAllergenSafety(food, allergies);
        if (assessment.status === "KNOWN_SAFE") continue;
        violations.push({
          reason: assessment.status,
          matchedAllergens: assessment.matchedAllergens,
          dayLabel: day.dayLabel,
          mealName: meal.name,
          food: food.name,
        });
      }
    }
  }
  return violations;
}
