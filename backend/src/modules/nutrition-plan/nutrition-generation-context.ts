import { createHash } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { legalService } from "../legal/legal.service";
import { trackingService } from "../tracking/tracking.service";
import {
  buildProfile,
  assertOrdinaryPlanSafety,
  loadBloodTestImplications,
} from "./nutrition-plan.service";
import { nutritionPlanAdaptationService } from "./nutrition-plan-adaptation.service";
import { calculateCalories } from "./calculations/calorie-calculator";
import { calculateMacros } from "./calculations/macro-calculator";
import { calculateWater } from "./calculations/water-calculator";
import { calculateMealTiming } from "./calculations/meal-timing";
import { buildRealLifePlanningContext, findRealLifePlanViolations } from "./nutrition-plan-realism";
import { findAllergenViolations } from "./meal-generator/allergen-validator";
import { findNutritionTargetViolations } from "./meal-generator/nutrition-target-validator";
import { DURATION_DAYS } from "./constants";
import {
  createNutritionTimings,
  timeNutritionPhase,
  timeNutritionCheck,
} from "./nutrition-plan-generation-timings";
import type { DailyPlan, NutritionPlanGenerationInput, PlanDuration } from "./types";

export function contextDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function prepareNutritionContext(
  userId: string,
  duration: PlanDuration,
  pantryText?: string,
  metrics = createNutritionTimings(),
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, deactivatedAt: true, deletionRequestedAt: true },
  });
  if (!user?.isActive || user.deactivatedAt || user.deletionRequestedAt)
    throw ApiError.forbidden("Account is unavailable.");
  if ((await legalService.getMissingMandatoryConsents(userId)).length)
    throw new ApiError(403, "Consent required.", { code: "CONSENT_REQUIRED" });
  await trackingService.requireCurrentWeightCheckIn(userId);
  const profile = await timeNutritionPhase(metrics, "goalPreparationMs", () =>
    buildProfile(userId),
  );
  timeNutritionCheck(metrics, "healthValidationMs", () => assertOrdinaryPlanSafety(profile));
  const [{ analysisId, implications }, adaptation, active] = await timeNutritionPhase(
    metrics,
    "nutritionDataMs",
    () =>
      Promise.all([
        loadBloodTestImplications(userId),
        nutritionPlanAdaptationService.build(userId, profile.workScheduleType),
        prisma.nutritionPlan.findFirst({
          where: { userId, isActive: true, deletedAt: null },
          orderBy: { updatedAt: "desc" },
        }),
      ]),
  );
  const goalsStartedAt = performance.now();
  const calories = calculateCalories(profile),
    macros = calculateMacros(profile, calories.dailyCalories, calories.goal),
    water = calculateWater(profile);
  const mealTiming = calculateMealTiming(calories.goal, {
    usualWakeTime: profile.usualWakeTime,
    usualSleepTime: profile.usualSleepTime,
    workScheduleType: profile.workScheduleType,
    preferredSnackTime: adaptation.preferredSnackTime,
  });
  const input: NutritionPlanGenerationInput = {
    goal: calories.goal,
    dailyCalories: calories.dailyCalories,
    proteinGrams: macros.proteinGrams,
    carbsGrams: macros.carbsGrams,
    fatGrams: macros.fatGrams,
    waterMl: water.waterMl,
    mealTiming,
    dietaryPreference: profile.dietaryPreference,
    allergies: profile.allergies,
    healthConditions: profile.healthConditions,
    bloodTestImplications: implications,
    behaviorInsights: adaptation.behaviorInsights,
    realLifePlanning: buildRealLifePlanningContext(pantryText),
    durationDays: DURATION_DAYS[duration],
  };
  metrics.goalPreparationMs += performance.now() - goalsStartedAt;
  // Water-only changes may reuse foods. All health/target/timing changes fail closed.
  const { waterMl: _water, ...foodInput } = input;
  const { dailyWaterGoalMl: _waterGoal, ...foodProfile } = profile;
  const hash = contextDigest({ schema: "nutrition-job-v1", foodInput, foodProfile, analysisId });
  const { durationDays: _horizon, behaviorInsights: _behavior, ...safetyInput } = foodInput;
  const safetyHash = contextDigest({
    schema: "nutrition-safety-v1",
    safetyInput,
    foodProfile,
    analysisId,
  });
  const { usualWakeTime: _wake, usualSleepTime: _sleep, ...reusableProfile } = foodProfile;
  const reuseHash = contextDigest({
    schema: "nutrition-job-v1",
    foodProfile: reusableProfile,
    foodInput: {
      ...foodInput,
      mealTiming: {
        ...mealTiming,
        slots: mealTiming.slots.map(({ time: _time, ...slot }) => slot),
      },
    },
    analysisId,
  });
  const edits = active
    ? await prisma.nutritionPlanDeviation.findMany({
        where: { planId: active.id, userId },
        orderBy: { id: "asc" },
        select: { id: true, updatedAt: true },
      })
    : [];
  const activeHash = contextDigest({
    id: active?.id ?? null,
    updatedAt: active?.updatedAt ?? null,
    content: active?.dailyPlans ?? null,
    edits,
  });
  return {
    input,
    hash,
    reuseHash,
    safetyHash,
    calories,
    macros,
    water,
    mealTiming,
    analysisId,
    active,
    activeHash,
  };
}

/** Same validators used by the existing generator, applied to persisted/reused content. */
export function assertCompleteNutrition(
  cycle: DailyPlan[],
  input: NutritionPlanGenerationInput,
  expectedDays = input.durationDays,
): void {
  if (
    cycle.length !== expectedDays ||
    new Set(cycle.map((day) => day.dayLabel)).size !== expectedDays
  )
    throw new ApiError(502, "Incomplete plan.", { code: "NUTRITION_PLAN_INCOMPLETE" });
  if (cycle.some((day) => day.meals.length !== input.mealTiming.mealsPerDay))
    throw new ApiError(502, "Invalid meal structure.", {
      code: "NUTRITION_PLAN_MEAL_STRUCTURE_MISMATCH",
    });
  if (findAllergenViolations(cycle, input.allergies).length)
    throw new ApiError(502, "Allergen validation failed.", {
      code: "NUTRITION_PLAN_ALLERGEN_VALIDATION_FAILED",
    });
  if (findNutritionTargetViolations(cycle, { ...input, cycleLengthDays: cycle.length }).length)
    throw new ApiError(502, "Target validation failed.", {
      code: "NUTRITION_PLAN_TARGET_MISMATCH",
    });
  if (findRealLifePlanViolations(cycle, 1, [], input.realLifePlanning).length)
    throw new ApiError(502, "Realism validation failed.", {
      code: "NUTRITION_PLAN_REALISM_VALIDATION_FAILED",
    });
}
