import type { NutritionPlan, NutritionPlanDuration } from "@prisma/client";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { bloodTestAnalysisRepository } from "../blood-test-analysis/blood-test-analysis.repository";
import { calculateCalories } from "./calculations/calorie-calculator";
import { calculateMacros } from "./calculations/macro-calculator";
import { calculateMealTiming } from "./calculations/meal-timing";
import { calculateWater } from "./calculations/water-calculator";
import { DURATION_DAYS, MEAL_CYCLE_LENGTH_DAYS } from "./constants";
import { mealGeneratorService } from "./meal-generator/meal-generator.service";
import { nutritionPlanRepository } from "./nutrition-plan.repository";
import type {
  BloodTestImplicationInput,
  CalendarDay,
  CalculationGender,
  NutritionPlanContent,
  NutritionProfile,
} from "./types";

/** Derives an age in whole years from a date of birth. */
function ageFromDob(dob: Date): number {
  const diff = Date.now() - dob.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

/** Maps the Prisma `Gender` enum onto the calculation gender. */
function toCalculationGender(gender: string): CalculationGender {
  if (gender === "MALE") return "MALE";
  if (gender === "FEMALE") return "FEMALE";
  return "NEUTRAL";
}

/**
 * Builds the normalized nutrition profile from the mandatory onboarding profile
 * (Sprint 9). Throws 400 when onboarding is incomplete, since a personalized
 * plan cannot be produced without it.
 */
async function buildProfile(userId: string): Promise<NutritionProfile> {
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw ApiError.badRequest(
      "Complete your onboarding profile before generating a nutrition plan.",
    );
  }
  return {
    ageYears: ageFromDob(profile.dateOfBirth),
    gender: toCalculationGender(profile.gender),
    heightCm: profile.heightCm,
    currentWeightKg: profile.currentWeightKg,
    targetWeightKg: profile.targetWeightKg,
    activityLevel: profile.activityLevel,
    dietaryPreference: profile.dietaryPreference,
    healthConditions: profile.healthConditions,
    allergies: profile.allergies,
    dailyWaterGoalMl: profile.dailyWaterGoalMl,
  };
}

/**
 * Loads the nutrition implications from the user's latest COMPLETED blood-test
 * analysis (Sprint 12), if one exists. Returns the implications plus the source
 * analysis id so the plan can be linked back to it.
 */
async function loadBloodTestImplications(userId: string): Promise<{
  analysisId: string | null;
  implications: BloodTestImplicationInput[];
}> {
  const analyses = await bloodTestAnalysisRepository.listByUser(userId);
  const latest = analyses.find((a) => a.status === "COMPLETED");
  if (!latest) return { analysisId: null, implications: [] };

  const raw = latest.nutritionImplications as unknown;
  const implications: BloodTestImplicationInput[] = Array.isArray(raw)
    ? raw.map((item) => {
        const record = (item ?? {}) as Record<string, unknown>;
        return {
          biomarkerName: String(record.biomarkerName ?? ""),
          implication: String(record.implication ?? ""),
          suggestedFoods: Array.isArray(record.suggestedFoods)
            ? record.suggestedFoods.map((f) => String(f))
            : [],
          foodsToLimit: Array.isArray(record.foodsToLimit)
            ? record.foodsToLimit.map((f) => String(f))
            : [],
        };
      })
    : [];

  return { analysisId: latest.id, implications };
}

/**
 * Maps a rotation cycle across a full plan duration. Day N (1-based) uses cycle
 * index (N-1) mod cycleLength, giving repeating weekly variety without asking
 * the AI for a unique plan per calendar day.
 */
function buildCalendar(durationDays: number, cycleLength: number): CalendarDay[] {
  if (cycleLength <= 0) return [];
  const calendar: CalendarDay[] = [];
  for (let day = 1; day <= durationDays; day += 1) {
    calendar.push({ dayNumber: day, cycleIndex: (day - 1) % cycleLength });
  }
  return calendar;
}

/**
 * Orchestrates Diewish's Personalized Nutrition Plan Engine: load profile →
 * load latest blood analysis (optional) → deterministic calculations → AI meal
 * generation (allergen-guarded) → assemble → persist a new versioned plan.
 */
export const nutritionPlanService = {
  /**
   * Generates and persists a new nutrition plan for the authenticated user.
   *
   * @param userId - Authenticated owner id.
   * @param duration - Plan horizon (30- or 60-day).
   * @returns The persisted, active plan record (a new version).
   * @throws {ApiError} 400 when the onboarding profile is missing.
   */
  async generate(userId: string, duration: NutritionPlanDuration): Promise<NutritionPlan> {
    const startedAt = Date.now();
    try {
      const profile = await buildProfile(userId);
      const { analysisId, implications } = await loadBloodTestImplications(userId);

      // 1. Deterministic calculations.
      const calories = calculateCalories(profile);
      const macros = calculateMacros(profile, calories.dailyCalories, calories.goal);
      const water = calculateWater(profile);
      const mealTiming = calculateMealTiming(calories.goal);

      // 2. AI meal generation (allergen-guarded).
      const generation = await mealGeneratorService.generate({
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
        cycleLengthDays: MEAL_CYCLE_LENGTH_DAYS,
      });

      // 3. Assemble the day-by-day content by mapping the cycle across the term.
      const durationDays = DURATION_DAYS[duration];
      const cycle = generation.output.cycle;
      const content: NutritionPlanContent = {
        durationDays,
        cycleLengthDays: cycle.length,
        cycle,
        calendar: buildCalendar(durationDays, cycle.length),
      };

      // 4. Persist as a new immutable version (previous active plan retained).
      return await nutritionPlanRepository.createVersioned({
        userId,
        duration,
        bloodTestAnalysisId: analysisId,
        calories,
        macros,
        water,
        mealTiming,
        content,
        explanations: generation.output.explanations,
        recommendations: generation.output.recommendations,
        summary: generation.output.summary,
        aiProvider: generation.aiProvider,
        aiModel: generation.aiModel,
        processingTimeMs: Date.now() - startedAt,
      });
    } catch (error) {
      logger.error({ err: error, userId, duration }, "Nutrition plan generation failed");
      if (error instanceof ApiError) throw error;
      throw ApiError.internal("Nutrition plan generation failed.");
    }
  },

  /**
   * Regenerates a plan based on an existing plan's duration, creating a new
   * version without discarding the original.
   *
   * @param userId - Authenticated owner id.
   * @param planId - The plan to base the regeneration's duration on.
   * @returns The newly generated, active plan.
   * @throws {ApiError} 404 when the source plan is not found/owned.
   */
  async regenerate(userId: string, planId: string): Promise<NutritionPlan> {
    const existing = await nutritionPlanRepository.findByIdForUser(planId, userId);
    if (!existing) {
      throw ApiError.notFound("Nutrition plan not found.");
    }
    return this.generate(userId, existing.duration);
  },

  /**
   * Returns a plan by id, or 404 when not found / not owned.
   *
   * @param userId - Authenticated owner id.
   * @param planId - The plan id.
   */
  async getById(userId: string, planId: string): Promise<NutritionPlan> {
    const plan = await nutritionPlanRepository.findByIdForUser(planId, userId);
    if (!plan) {
      throw ApiError.notFound("Nutrition plan not found.");
    }
    return plan;
  },

  /**
   * Returns the active plan for a duration, or 404 when none exists yet.
   *
   * @param userId - Authenticated owner id.
   * @param duration - Plan horizon.
   */
  async getActive(userId: string, duration: NutritionPlanDuration): Promise<NutritionPlan> {
    const plan = await nutritionPlanRepository.findActive(userId, duration);
    if (!plan) {
      throw ApiError.notFound("No active nutrition plan found for this duration.");
    }
    return plan;
  },

  /**
   * Lists all of the authenticated user's plans (all versions, newest first).
   *
   * @param userId - Authenticated owner id.
   */
  list(userId: string): Promise<NutritionPlan[]> {
    return nutritionPlanRepository.listByUser(userId);
  },
};
