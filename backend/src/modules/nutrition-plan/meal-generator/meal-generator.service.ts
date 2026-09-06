/**
 * AI-backed meal recommendation generator.
 *
 * Longer plans are generated in bounded seven-day batches so 7/14/30-day
 * requests produce the exact number of plan days instead of mapping one weekly
 * cycle repeatedly. Every batch is count-validated and allergen-guarded before
 * the final plan can be persisted.
 */

import { logger } from "../../../lib/logger";
import { ApiError } from "../../../utils/api-error";
import { getAIAdapter } from "../../blood-test-analysis/ai-adapter/ai-adapter.factory";
import { MEAL_GENERATION_BATCH_DAYS } from "../constants";
import { findAllergenViolations } from "./allergen-validator";
import type {
  DailyPlan,
  NutritionPlanAIInput,
  NutritionPlanAIOutput,
  NutritionPlanGenerationInput,
  PlanExplanations,
} from "../types";

export interface MealGenerationResult {
  output: NutritionPlanAIOutput;
  aiProvider: string;
  aiModel: string;
}

const MAX_AVOID_SIGNATURES = 28;

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

function relabelDays(cycle: DailyPlan[], startDayNumber: number): DailyPlan[] {
  return cycle.map((day, index) => ({ ...day, dayLabel: `${startDayNumber + index}. Gün` }));
}

function daySignature(day: DailyPlan): string {
  return day.meals
    .map((meal) =>
      `${meal.name}:${meal.foods
        .map((food) => food.name.trim().toLocaleLowerCase("tr-TR"))
        .filter(Boolean)
        .join("+")}`,
    )
    .join("|");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

async function generateValidatedBatch(input: NutritionPlanAIInput): Promise<NutritionPlanAIOutput> {
  const adapter = getAIAdapter();

  let output = await adapter.generateNutritionPlan(input);
  let violations = findAllergenViolations(output.cycle, input.allergies);
  const wrongDayCount = output.cycle.length !== input.cycleLengthDays;

  if (wrongDayCount || violations.length > 0) {
    logger.warn(
      {
        requestedDays: input.cycleLengthDays,
        receivedDays: output.cycle.length,
        allergenViolationCount: violations.length,
        startDayNumber: input.startDayNumber ?? 1,
      },
      "Nutrition-plan batch failed deterministic validation; retrying once",
    );
    output = await adapter.generateNutritionPlan(input);
    violations = findAllergenViolations(output.cycle, input.allergies);
  }

  if (output.cycle.length !== input.cycleLengthDays) {
    logger.error(
      {
        requestedDays: input.cycleLengthDays,
        receivedDays: output.cycle.length,
        startDayNumber: input.startDayNumber ?? 1,
      },
      "Nutrition-plan provider returned the wrong number of days after retry",
    );
    throw new ApiError(502, "The nutrition-plan provider returned an incomplete plan.", {
      code: "NUTRITION_PLAN_INCOMPLETE",
      isOperational: false,
    });
  }

  if (violations.length > 0) {
    logger.error(
      { violationCount: violations.length, startDayNumber: input.startDayNumber ?? 1 },
      "Nutrition-plan batch still contained allergen(s) after retry; stripping offending foods",
    );
    output = { ...output, cycle: stripAllergens(output.cycle, input.allergies) };
  }

  return { ...output, cycle: relabelDays(output.cycle, input.startDayNumber ?? 1) };
}

export const mealGeneratorService = {
  async generate(input: NutritionPlanGenerationInput): Promise<MealGenerationResult> {
    const adapter = getAIAdapter();
    const days: DailyPlan[] = [];
    const recommendations: string[] = [];
    let explanations: PlanExplanations | null = null;
    let summary = "";
    let startDayNumber = 1;

    while (startDayNumber <= input.durationDays) {
      const batchDays = Math.min(
        MEAL_GENERATION_BATCH_DAYS,
        input.durationDays - startDayNumber + 1,
      );
      const avoidMealSignatures = days
        .slice(-MAX_AVOID_SIGNATURES)
        .map(daySignature)
        .filter(Boolean);

      const batch = await generateValidatedBatch({
        goal: input.goal,
        dailyCalories: input.dailyCalories,
        proteinGrams: input.proteinGrams,
        carbsGrams: input.carbsGrams,
        fatGrams: input.fatGrams,
        waterMl: input.waterMl,
        mealTiming: input.mealTiming,
        dietaryPreference: input.dietaryPreference,
        allergies: input.allergies,
        healthConditions: input.healthConditions,
        bloodTestImplications: input.bloodTestImplications,
        cycleLengthDays: batchDays,
        planDurationDays: input.durationDays,
        startDayNumber,
        avoidMealSignatures,
      });

      days.push(...batch.cycle);
      recommendations.push(...batch.recommendations);
      explanations ??= batch.explanations;
      summary ||= batch.summary;
      startDayNumber += batchDays;
    }

    if (days.length !== input.durationDays || !explanations) {
      throw new ApiError(502, "The nutrition-plan provider returned an incomplete plan.", {
        code: "NUTRITION_PLAN_INCOMPLETE",
        isOperational: false,
      });
    }

    return {
      output: {
        cycle: days,
        explanations,
        recommendations: uniqueStrings(recommendations).slice(0, 12),
        summary,
      },
      aiProvider: adapter.info.provider,
      aiModel: adapter.info.model,
    };
  },
};
