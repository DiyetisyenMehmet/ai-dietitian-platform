/**
 * AI-backed meal recommendation generator.
 *
 * Long plans are generated in bounded provider batches and assembled into the
 * exact 7/14/30-day horizon. A small concurrency cap prevents the synchronous
 * API request from serially waiting on every batch while keeping Vertex load
 * controlled. Every batch is count-validated and allergen-guarded before the
 * final plan can be persisted.
 */

import { logger } from "../../../lib/logger";
import { ApiError } from "../../../utils/api-error";
import { getAIAdapter } from "../../blood-test-analysis/ai-adapter/ai-adapter.factory";
import { MEAL_GENERATION_BATCH_DAYS, MEAL_GENERATION_CONCURRENCY } from "../constants";
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

interface BatchSpec {
  startDayNumber: number;
  batchDays: number;
}

interface GeneratedBatch {
  startDayNumber: number;
  output: NutritionPlanAIOutput;
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

function buildBatchSpecs(startDayNumber: number, daysToGenerate: number): BatchSpec[] {
  const specs: BatchSpec[] = [];
  const finalDayNumber = startDayNumber + daysToGenerate - 1;
  for (
    let batchStart = startDayNumber;
    batchStart <= finalDayNumber;
    batchStart += MEAL_GENERATION_BATCH_DAYS
  ) {
    specs.push({
      startDayNumber: batchStart,
      batchDays: Math.min(MEAL_GENERATION_BATCH_DAYS, finalDayNumber - batchStart + 1),
    });
  }
  return specs;
}

function recentSignatures(batches: GeneratedBatch[]): string[] {
  return [...batches]
    .sort((a, b) => a.startDayNumber - b.startDayNumber)
    .flatMap((batch) => batch.output.cycle)
    .slice(-MAX_AVOID_SIGNATURES)
    .map(daySignature)
    .filter(Boolean);
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

async function generateBatch(
  input: NutritionPlanGenerationInput,
  spec: BatchSpec,
  avoidMealSignatures: string[],
): Promise<GeneratedBatch> {
  const startedAt = Date.now();
  const metadata = {
    startDayNumber: spec.startDayNumber,
    batchDays: spec.batchDays,
    durationDays: input.durationDays,
  };

  logger.info(metadata, "Nutrition-plan batch generation started");

  try {
    const output = await generateValidatedBatch({
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
      cycleLengthDays: spec.batchDays,
      planDurationDays: input.durationDays,
      startDayNumber: spec.startDayNumber,
      avoidMealSignatures,
    });

    logger.info(
      { ...metadata, processingTimeMs: Date.now() - startedAt },
      "Nutrition-plan batch generation completed",
    );
    return { startDayNumber: spec.startDayNumber, output };
  } catch (error) {
    logger.error(
      { err: error, ...metadata, processingTimeMs: Date.now() - startedAt },
      "Nutrition-plan batch generation failed",
    );
    throw error;
  }
}

async function generateRangeInternal(
  input: NutritionPlanGenerationInput,
  startDayNumber: number,
  daysToGenerate: number,
  priorDays: DailyPlan[],
): Promise<MealGenerationResult> {
  if (
    !Number.isInteger(startDayNumber) ||
    !Number.isInteger(daysToGenerate) ||
    startDayNumber < 1 ||
    daysToGenerate < 1 ||
    startDayNumber + daysToGenerate - 1 > input.durationDays
  ) {
    throw ApiError.badRequest("The requested nutrition-plan day range is invalid.");
  }

  const adapter = getAIAdapter();
  const generated: GeneratedBatch[] = [];
  const specs = buildBatchSpecs(startDayNumber, daysToGenerate);
  const seedSignatures = priorDays
    .slice(-MAX_AVOID_SIGNATURES)
    .map(daySignature)
    .filter(Boolean);

  for (let offset = 0; offset < specs.length; offset += MEAL_GENERATION_CONCURRENCY) {
    const wave = specs.slice(offset, offset + MEAL_GENERATION_CONCURRENCY);
    const avoidMealSignatures = [...seedSignatures, ...recentSignatures(generated)].slice(
      -MAX_AVOID_SIGNATURES,
    );
    const results = await Promise.all(
      wave.map((spec) => generateBatch(input, spec, avoidMealSignatures)),
    );
    generated.push(...results);
  }

  generated.sort((a, b) => a.startDayNumber - b.startDayNumber);
  const days = generated.flatMap((batch) => batch.output.cycle);
  const recommendations = generated.flatMap((batch) => batch.output.recommendations);
  const explanations: PlanExplanations | null = generated[0]?.output.explanations ?? null;
  const summary = generated.find((batch) => batch.output.summary.trim())?.output.summary ?? "";

  if (days.length !== daysToGenerate || !explanations) {
    throw new ApiError(502, "The nutrition-plan provider returned an incomplete plan.", {
      code: "NUTRITION_PLAN_INCOMPLETE",
      isOperational: false,
    });
  }

  return {
    output: {
      cycle: days,
      explanations,
      recommendations: uniqueStrings(recommendations).slice(0, 6),
      summary,
    },
    aiProvider: adapter.info.provider,
    aiModel: adapter.info.model,
  };
}

export const mealGeneratorService = {
  generate(input: NutritionPlanGenerationInput): Promise<MealGenerationResult> {
    return generateRangeInternal(input, 1, input.durationDays, []);
  },

  /** Generates only the requested contiguous range while preserving full-horizon context. */
  generateRange(
    input: NutritionPlanGenerationInput,
    startDayNumber: number,
    daysToGenerate: number,
    priorDays: DailyPlan[] = [],
  ): Promise<MealGenerationResult> {
    return generateRangeInternal(input, startDayNumber, daysToGenerate, priorDays);
  },
};
