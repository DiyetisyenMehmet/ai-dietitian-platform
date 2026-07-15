/**
 * AI-backed meal recommendation generator.
 *
 * Delegates concrete meal content and plain-language explanations to the
 * provider-agnostic AI adapter (reused from the Blood Test Analysis Engine),
 * then enforces allergen exclusions with a deterministic post-generation guard.
 * If an allergen slips through, a single stricter regeneration is attempted; if
 * it still fails, the offending foods are removed rather than served.
 */

import { logger } from "../../../lib/logger";
import { getAIAdapter } from "../../blood-test-analysis/ai-adapter/ai-adapter.factory";
import { findAllergenViolations } from "./allergen-validator";
import type { DailyPlan, NutritionPlanAIInput, NutritionPlanAIOutput } from "../types";

/** The AI output plus the provider/model that produced it. */
export interface MealGenerationResult {
  output: NutritionPlanAIOutput;
  aiProvider: string;
  aiModel: string;
}

/**
 * Removes any food whose name matches a declared allergen from every meal, as a
 * last-resort safety net when the model repeatedly fails to honor exclusions.
 */
function stripAllergens(cycle: DailyPlan[], allergies: string[]): DailyPlan[] {
  const violations = findAllergenViolations(cycle, allergies);
  if (violations.length === 0) return cycle;
  const offendingFoods = new Set(violations.map((v) => `${v.dayLabel}::${v.mealName}::${v.food}`));

  return cycle.map((day) => ({
    ...day,
    meals: day.meals.map((meal) => ({
      ...meal,
      foods: meal.foods.filter(
        (food) => !offendingFoods.has(`${day.dayLabel}::${meal.name}::${food.name}`),
      ),
    })),
  }));
}

/**
 * Generates the meal rotation cycle, explanations, and recommendations for a
 * plan, enforcing allergen exclusions.
 *
 * @param input - The fully computed AI input (targets + constraints).
 * @returns The AI output and the provider/model metadata.
 */
export const mealGeneratorService = {
  async generate(input: NutritionPlanAIInput): Promise<MealGenerationResult> {
    const adapter = getAIAdapter();

    let output = await adapter.generateNutritionPlan(input);

    // Hard allergen guard: retry once if the model included an allergen.
    if (input.allergies.length > 0) {
      let violations = findAllergenViolations(output.cycle, input.allergies);
      if (violations.length > 0) {
        logger.warn(
          { violations },
          "Nutrition plan contained allergen(s); regenerating with stricter constraints",
        );
        output = await adapter.generateNutritionPlan(input);
        violations = findAllergenViolations(output.cycle, input.allergies);
        if (violations.length > 0) {
          logger.error(
            { violations },
            "Nutrition plan still contained allergen(s) after retry; stripping offending foods",
          );
          output = { ...output, cycle: stripAllergens(output.cycle, input.allergies) };
        }
      }
    }

    return { output, aiProvider: adapter.info.provider, aiModel: adapter.info.model };
  },
};
