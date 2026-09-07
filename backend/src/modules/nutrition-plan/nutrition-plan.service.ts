import type { NutritionPlan } from "@prisma/client";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { bloodTestAnalysisRepository } from "../blood-test-analysis/blood-test-analysis.repository";
import { aiUsageService } from "../ai-usage/ai-usage.service";
import { ENTITLEMENT_REQUIRED_CODE } from "../payments/constants";
import { calculateCalories } from "./calculations/calorie-calculator";
import { calculateMacros } from "./calculations/macro-calculator";
import { calculateMealTiming } from "./calculations/meal-timing";
import { calculateWater } from "./calculations/water-calculator";
import { DURATION_DAYS, isSupportedPlanDuration } from "./constants";
import { mealGeneratorService } from "./meal-generator/meal-generator.service";
import { nutritionPlanRepository } from "./nutrition-plan.repository";
import { assessNutritionPlanSafety } from "./nutrition-plan-safety";
import type {
  BloodTestImplicationInput,
  CalendarDay,
  CalculationGender,
  NutritionPlanContent,
  NutritionProfile,
  PlanDuration,
} from "./types";

function ageFromDob(dob: Date): number {
  const diff = Date.now() - dob.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

function toCalculationGender(gender: string): CalculationGender {
  if (gender === "MALE") return "MALE";
  if (gender === "FEMALE") return "FEMALE";
  return "NEUTRAL";
}

function dateOnlyFromYmd(value?: string): Date {
  if (value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function ymdFromDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

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

function assertOrdinaryPlanSafety(profile: NutritionProfile): void {
  const assessment = assessNutritionPlanSafety(profile);
  if (assessment.eligible) return;

  throw new ApiError(
    422,
    "Bu profil için otomatik öğün planı oluşturmak güvenli değil. Kişisel plan oluşturmadan önce bir sağlık veya beslenme uzmanıyla değerlendirme yapman gerekiyor.",
    {
      code: "NUTRITION_PLAN_SAFETY_REVIEW_REQUIRED",
      details: {
        reasons: assessment.reasons,
      },
    },
  );
}

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

/** Newly generated plans map every calendar day to its own unique generated day. */
function buildCalendar(durationDays: number): CalendarDay[] {
  return Array.from({ length: durationDays }, (_, index) => ({
    dayNumber: index + 1,
    cycleIndex: index,
  }));
}

export const nutritionPlanService = {
  /** Generates exactly 7, 14, or 30 unique plan days according to the selected horizon. */
  async generate(
    userId: string,
    duration: PlanDuration,
    startDateYmd?: string,
  ): Promise<NutritionPlan> {
    const startedAt = Date.now();
    try {
      const tier = await aiUsageService.resolveTier(userId);
      if (tier === "FREE" && duration !== "SEVEN_DAY") {
        throw new ApiError(
          403,
          "Ücretsiz planda yalnızca tek seferlik 7 günlük başlangıç planı kullanılabilir.",
          {
            code: ENTITLEMENT_REQUIRED_CODE,
            details: {
              feature: "NUTRITION_PLAN",
              tier,
              reason: "FREE_DURATION_RESTRICTED",
              allowedDuration: "SEVEN_DAY",
            },
          },
        );
      }

      const profile = await buildProfile(userId);
      assertOrdinaryPlanSafety(profile);

      // Quota is only asserted after deterministic safety eligibility. Usage is
      // recorded only after a complete plan is persisted, so safety/provider
      // failures never consume a successful generation right.
      await aiUsageService.assertWithinQuota(userId, "NUTRITION_PLAN", tier);

      const { analysisId, implications } = await loadBloodTestImplications(userId);

      const calories = calculateCalories(profile);
      const macros = calculateMacros(profile, calories.dailyCalories, calories.goal);
      const water = calculateWater(profile);
      const mealTiming = calculateMealTiming(calories.goal);
      const durationDays = DURATION_DAYS[duration];
      const startDate = dateOnlyFromYmd(startDateYmd);

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
        durationDays,
      });

      const cycle = generation.output.cycle;
      if (cycle.length !== durationDays) {
        throw new ApiError(502, "The nutrition-plan provider returned an incomplete plan.", {
          code: "NUTRITION_PLAN_INCOMPLETE",
          isOperational: false,
        });
      }

      const content: NutritionPlanContent = {
        durationDays,
        cycleLengthDays: cycle.length,
        cycle,
        calendar: buildCalendar(durationDays),
      };

      const plan = await nutritionPlanRepository.createVersioned({
        userId,
        duration,
        startDate,
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

      await aiUsageService.record({
        userId,
        feature: "NUTRITION_PLAN",
        provider: generation.aiProvider,
        model: generation.aiModel,
      });

      return plan;
    } catch (error) {
      logger.error({ err: error, userId, duration }, "Nutrition plan generation failed");
      if (error instanceof ApiError) throw error;
      throw ApiError.internal("Nutrition plan generation failed.");
    }
  },

  async regenerate(userId: string, planId: string): Promise<NutritionPlan> {
    const existing = await nutritionPlanRepository.findByIdForUser(planId, userId);
    if (!existing || existing.deletedAt) {
      throw ApiError.notFound("Nutrition plan not found.");
    }
    if (!isSupportedPlanDuration(existing.duration)) {
      throw ApiError.badRequest(
        "This legacy 60-day plan can no longer be regenerated. Create a 7, 14, or 30-day plan instead.",
      );
    }
    return this.generate(userId, existing.duration, ymdFromDate(existing.startDate));
  },

  async getById(userId: string, planId: string): Promise<NutritionPlan> {
    const plan = await nutritionPlanRepository.findByIdForUser(planId, userId);
    if (!plan || plan.deletedAt) {
      throw ApiError.notFound("Nutrition plan not found.");
    }
    return plan;
  },

  async getActive(userId: string, duration: PlanDuration): Promise<NutritionPlan> {
    const plan = await nutritionPlanRepository.findActive(userId, duration);
    if (!plan) {
      throw ApiError.notFound("No active nutrition plan found for this duration.");
    }
    return plan;
  },

  async remove(userId: string, planId: string): Promise<void> {
    const existing = await nutritionPlanRepository.findByIdForUser(planId, userId);
    if (!existing || existing.deletedAt) {
      throw ApiError.notFound("Nutrition plan not found.");
    }

    const deleted = await nutritionPlanRepository.softDeleteByIdForUser(planId, userId);
    if (!deleted) {
      throw ApiError.notFound("Nutrition plan not found.");
    }
  },

  list(userId: string): Promise<NutritionPlan[]> {
    return nutritionPlanRepository.listByUser(userId);
  },
};
