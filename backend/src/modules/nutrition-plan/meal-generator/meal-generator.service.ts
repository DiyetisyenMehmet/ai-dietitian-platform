/**
 * AI-backed meal recommendation generator.
 *
 * Long plans are generated in bounded provider batches and assembled into the
 * exact 7/14/30-day horizon. A small concurrency cap prevents the synchronous
 * API request from serially waiting on every batch while keeping Vertex load
 * controlled. Pantry-aware real-life generation is deliberately serialized so
 * each batch can respect the rolling 14-day food-frequency budget established
 * by the preceding generated days. Every batch is count-, allergen-, nutrition-
 * target-, realism-, and meal-structure validated before persistence.
 */

import { logger } from "../../../lib/logger";
import { ApiError } from "../../../utils/api-error";
import { getAIAdapter } from "../../blood-test-analysis/ai-adapter/ai-adapter.factory";
import { MEAL_GENERATION_BATCH_DAYS, MEAL_GENERATION_CONCURRENCY } from "../constants";
import {
  buildRealLifeProviderInsights,
  findRealLifePlanViolations,
} from "../nutrition-plan-realism";
import { findAllergenViolations } from "./allergen-validator";
import { findNutritionTargetViolations } from "./nutrition-target-validator";
import { checkNutritionProviderBudget } from "../nutrition-plan-provider-budget";
import type {
  DailyPlan,
  MealTimingRecommendation,
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

function relabelDays(cycle: DailyPlan[], startDayNumber: number): DailyPlan[] {
  return cycle.map((day, index) => ({ ...day, dayLabel: `${startDayNumber + index}. Gün` }));
}

function daySignature(day: DailyPlan): string {
  return day.meals
    .map(
      (meal) =>
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

function orderedGeneratedDays(batches: GeneratedBatch[]): DailyPlan[] {
  return [...batches]
    .sort((a, b) => a.startDayNumber - b.startDayNumber)
    .flatMap((batch) => batch.output.cycle);
}

function recentSignatures(batches: GeneratedBatch[]): string[] {
  return orderedGeneratedDays(batches)
    .slice(-MAX_AVOID_SIGNATURES)
    .map(daySignature)
    .filter(Boolean);
}

function hasInvalidMealStructure(
  cycle: DailyPlan[],
  mealTiming: MealTimingRecommendation,
): boolean {
  return cycle.some((day) => day.meals.length !== mealTiming.mealsPerDay);
}

/** Provider chooses foods/macros; backend remains authoritative for clock times. */
function applyDeterministicMealTimes(
  cycle: DailyPlan[],
  mealTiming: MealTimingRecommendation,
): DailyPlan[] {
  return cycle.map((day) => ({
    ...day,
    meals: day.meals.map((meal, index) => ({
      ...meal,
      time: mealTiming.slots[index]?.time ?? meal.time,
    })),
  }));
}

async function generateValidatedBatch(
  input: NutritionPlanAIInput,
  priorDays: DailyPlan[],
): Promise<NutritionPlanAIOutput> {
  const adapter = getAIAdapter();

  let retried = false;
  const requestOutput = async (requestInput = input) => {
    checkNutritionProviderBudget();
    try {
      const result = await adapter.generateNutritionPlan(requestInput);
      checkNutritionProviderBudget();
      return {
        ...result,
        cycle: result.cycle.map((day, index) => ({
          ...day,
          dayLabel: `${requestInput.requestedDayNumbers?.[index] ?? (requestInput.startDayNumber ?? 1) + index}. Gün`,
        })),
      };
    } catch (error) {
      // Some compatible providers throw a native JSON parser error. Keep the
      // retry bounded to this batch and expose a stable domain error instead.
      if (error instanceof SyntaxError) {
        throw new ApiError(502, "The nutrition-plan provider returned malformed output.", {
          code: "AI_PROVIDER_MALFORMED",
          isOperational: false,
        });
      }
      throw error;
    }
  };
  let output: NutritionPlanAIOutput;
  try {
    output = await requestOutput();
  } catch (error) {
    const recoverable =
      error instanceof ApiError &&
      ["AI_PROVIDER_MALFORMED", "AI_PROVIDER_EMPTY", "AI_PROVIDER_INCOMPLETE"].includes(error.code);
    if (!recoverable) throw error;
    retried = true;
    logger.warn(
      { code: error.code, startDayNumber: input.startDayNumber ?? 1 },
      "Nutrition-plan provider output could not be parsed; retrying batch once",
    );
    output = await requestOutput();
  }
  let allergenViolations = findAllergenViolations(output.cycle, input.allergies);
  let nutritionViolations = findNutritionTargetViolations(output.cycle, input);
  let realismViolations = findRealLifePlanViolations(
    output.cycle,
    input.startDayNumber ?? 1,
    priorDays,
    input.realLifePlanning,
  );
  let wrongDayCount = output.cycle.length !== input.cycleLengthDays;
  let invalidMealStructure = hasInvalidMealStructure(output.cycle, input.mealTiming);

  if (
    !retried &&
    (wrongDayCount ||
      invalidMealStructure ||
      allergenViolations.length > 0 ||
      nutritionViolations.length > 0 ||
      realismViolations.length > 0)
  ) {
    logger.warn(
      {
        requestedDays: input.cycleLengthDays,
        receivedDays: output.cycle.length,
        invalidMealStructure,
        allergenViolationCount: allergenViolations.length,
        allergenRiskCount: allergenViolations.filter((item) => item.reason === "KNOWN_RISK").length,
        allergenUnknownCount: allergenViolations.filter((item) => item.reason === "UNKNOWN").length,
        nutritionViolationCount: nutritionViolations.length,
        realismViolationCount: realismViolations.length,
        startDayNumber: input.startDayNumber ?? 1,
      },
      "Nutrition-plan batch failed deterministic validation; retrying once",
    );
    // Repair only target-invalid days when all other batch constraints passed.
    // Cross-day realism failures still require one bounded full-batch retry.
    // Provider values are preserved verbatim; no nutrient scaling or clamping.
    const repairIndices =
      !wrongDayCount &&
      !invalidMealStructure &&
      allergenViolations.length === 0 &&
      realismViolations.length === 0
        ? output.cycle.flatMap((day, index) =>
            nutritionViolations.some((violation) => violation.dayLabel === day.dayLabel)
              ? [index]
              : [],
          )
        : [];
    const feedback = output.cycle.flatMap((day, index) => {
      const issues = nutritionViolations.filter((violation) => violation.dayLabel === day.dayLabel);
      if (!issues.length) return [];
      return [
        JSON.stringify({
          dayNumber: (input.startDayNumber ?? 1) + index,
          issues: issues.map(({ field, kind }) => ({ field, kind })),
          reported: {
            calories: day.totalCalories,
            protein: day.totalProteinGrams,
            carbs: day.totalCarbsGrams,
            fat: day.totalFatGrams,
          },
          mealSum: day.meals.reduce(
            (sum, meal) => ({
              calories: sum.calories + meal.calories,
              protein: sum.protein + meal.proteinGrams,
              carbs: sum.carbs + meal.carbsGrams,
              fat: sum.fat + meal.fatGrams,
            }),
            { calories: 0, protein: 0, carbs: 0, fat: 0 },
          ),
        }),
      ];
    });
    if (repairIndices.length) {
      const requestedDayNumbers = repairIndices.map((index) => (input.startDayNumber ?? 1) + index);
      logger.info(
        { requestedDayNumbers, retainedDays: output.cycle.length - repairIndices.length },
        "Repairing only target-invalid nutrition-plan days",
      );
      const repair = await requestOutput({
        ...input,
        cycleLengthDays: repairIndices.length,
        requestedDayNumbers,
        validationFeedback: feedback,
        avoidMealSignatures: [
          ...(input.avoidMealSignatures ?? []),
          ...output.cycle.filter((_, index) => !repairIndices.includes(index)).map(daySignature),
        ].slice(-MAX_AVOID_SIGNATURES),
      });
      if (repair.cycle.length !== repairIndices.length) {
        throw new ApiError(502, "The nutrition-plan provider returned an incomplete repair.", {
          code: "NUTRITION_PLAN_INCOMPLETE",
          isOperational: false,
        });
      }
      const repairedCycle = [...output.cycle];
      repairIndices.forEach((index, repairIndex) => {
        repairedCycle[index] = repair.cycle[repairIndex];
      });
      output = { ...output, cycle: repairedCycle };
    } else {
      output = await requestOutput({ ...input, validationFeedback: feedback });
    }
    allergenViolations = findAllergenViolations(output.cycle, input.allergies);
    nutritionViolations = findNutritionTargetViolations(output.cycle, input);
    realismViolations = findRealLifePlanViolations(
      output.cycle,
      input.startDayNumber ?? 1,
      priorDays,
      input.realLifePlanning,
    );
    wrongDayCount = output.cycle.length !== input.cycleLengthDays;
    invalidMealStructure = hasInvalidMealStructure(output.cycle, input.mealTiming);
  }

  if (wrongDayCount) {
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

  if (invalidMealStructure) {
    logger.error(
      {
        expectedMealsPerDay: input.mealTiming.mealsPerDay,
        startDayNumber: input.startDayNumber ?? 1,
      },
      "Nutrition-plan provider returned an invalid meal structure after retry",
    );
    throw new ApiError(502, "The nutrition-plan provider returned an invalid meal structure.", {
      code: "NUTRITION_PLAN_MEAL_STRUCTURE_MISMATCH",
      isOperational: false,
    });
  }

  if (allergenViolations.length > 0) {
    logger.error(
      { violationCount: allergenViolations.length, startDayNumber: input.startDayNumber ?? 1 },
      "Nutrition-plan batch still contained allergen(s) after retry; rejecting batch",
    );
    throw new ApiError(
      502,
      "The nutrition-plan provider could not produce a plan with sufficiently verified ingredient and allergen information.",
      {
        code: "NUTRITION_PLAN_ALLERGEN_VALIDATION_FAILED",
        isOperational: false,
      },
    );
  }

  if (nutritionViolations.length > 0) {
    logger.error(
      { violationCount: nutritionViolations.length, startDayNumber: input.startDayNumber ?? 1 },
      "Nutrition-plan batch remained outside deterministic nutrition tolerances after retry",
    );
    throw new ApiError(502, "The nutrition-plan provider returned inconsistent nutrition totals.", {
      code: "NUTRITION_PLAN_TARGET_MISMATCH",
      isOperational: false,
    });
  }

  if (realismViolations.length > 0) {
    logger.error(
      {
        violationCount: realismViolations.length,
        violationCodes: [...new Set(realismViolations.map((item) => item.code))],
        startDayNumber: input.startDayNumber ?? 1,
      },
      "Nutrition-plan batch remained outside deterministic real-life policy after retry",
    );
    throw new ApiError(502, "The nutrition-plan provider returned an impractical meal pattern.", {
      code: "NUTRITION_PLAN_REALISM_VALIDATION_FAILED",
      isOperational: false,
    });
  }

  const timedCycle = applyDeterministicMealTimes(output.cycle, input.mealTiming);
  return { ...output, cycle: relabelDays(timedCycle, input.startDayNumber ?? 1) };
}

async function generateBatch(
  input: NutritionPlanGenerationInput,
  spec: BatchSpec,
  avoidMealSignatures: string[],
  priorDays: DailyPlan[],
): Promise<GeneratedBatch> {
  const startedAt = Date.now();
  const metadata = {
    startDayNumber: spec.startDayNumber,
    batchDays: spec.batchDays,
    durationDays: input.durationDays,
  };

  logger.info(metadata, "Nutrition-plan batch generation started");

  try {
    const realLifeInsights = buildRealLifeProviderInsights(input.realLifePlanning);
    const providerInsights = [...realLifeInsights, ...(input.behaviorInsights ?? [])].slice(0, 6);
    const output = await generateValidatedBatch(
      {
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
        behaviorInsights: providerInsights,
        realLifePlanning: input.realLifePlanning,
        cycleLengthDays: spec.batchDays,
        planDurationDays: input.durationDays,
        startDayNumber: spec.startDayNumber,
        avoidMealSignatures,
      },
      priorDays,
    );

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
  const seedSignatures = priorDays.slice(-MAX_AVOID_SIGNATURES).map(daySignature).filter(Boolean);
  // Real-life frequency rules are rolling constraints. Serializing these bounded
  // batches prevents two simultaneous batches from independently spending the
  // same remaining 14-day meat/fish budget.
  const concurrency = input.realLifePlanning ? 1 : MEAL_GENERATION_CONCURRENCY;

  for (let offset = 0; offset < specs.length; offset += concurrency) {
    const wave = specs.slice(offset, offset + concurrency);
    const avoidMealSignatures = [...seedSignatures, ...recentSignatures(generated)].slice(
      -MAX_AVOID_SIGNATURES,
    );
    const knownPriorDays = [...priorDays, ...orderedGeneratedDays(generated)];
    const results = await Promise.all(
      wave.map((spec) => generateBatch(input, spec, avoidMealSignatures, knownPriorDays)),
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

  const finalRealismViolations = findRealLifePlanViolations(
    days,
    startDayNumber,
    priorDays,
    input.realLifePlanning,
  );
  if (finalRealismViolations.length > 0) {
    throw new ApiError(502, "The nutrition-plan provider returned an impractical meal pattern.", {
      code: "NUTRITION_PLAN_REALISM_VALIDATION_FAILED",
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
