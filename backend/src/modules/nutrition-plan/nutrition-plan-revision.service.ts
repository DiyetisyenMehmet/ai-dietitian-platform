import type { NutritionPlan } from "@prisma/client";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { aiUsageService } from "../ai-usage/ai-usage.service";
import { bloodTestAnalysisRepository } from "../blood-test-analysis/blood-test-analysis.repository";
import { ENTITLEMENT_REQUIRED_CODE } from "../payments/constants";
import { DURATION_DAYS, isSupportedPlanDuration } from "./constants";
import type {
  ExtendPlanInput,
  RefreshPlanInput,
  ShiftPlanDayInput,
} from "./dto/nutrition-plan.schemas";
import { mealGeneratorService } from "./meal-generator/meal-generator.service";
import { nutritionPlanRepository } from "./nutrition-plan.repository";
import type {
  BloodTestImplicationInput,
  CalendarDay,
  DailyPlan,
  MealTimingRecommendation,
  NutritionPlanContent,
  NutritionPlanGenerationInput,
  PlanDuration,
  WeightGoal,
} from "./types";

function contentFromPlan(plan: NutritionPlan): NutritionPlanContent {
  const content = plan.dailyPlans as unknown as NutritionPlanContent;
  if (
    !content ||
    !Array.isArray(content.cycle) ||
    content.cycle.length === 0 ||
    content.cycle.length !== content.durationDays
  ) {
    throw ApiError.badRequest("Nutrition plan content is unavailable for safe revision.");
  }
  return content;
}

function goalFromPlan(plan: NutritionPlan): WeightGoal {
  if (plan.dailyCalories < plan.tdee * 0.98) return "LOSE_WEIGHT";
  if (plan.dailyCalories > plan.tdee * 1.02) return "GAIN_WEIGHT";
  return "MAINTAIN_WEIGHT";
}

async function requirePaidTier(userId: string): Promise<"PREMIUM" | "PREMIUM_PLUS"> {
  const tier = await aiUsageService.resolveTier(userId);
  if (tier === "FREE") {
    throw new ApiError(
      403,
      "Plan uzatma, kontrollü yenileme ve gün taşıma Premium ve Premium Plus planlarında kullanılabilir.",
      {
        code: ENTITLEMENT_REQUIRED_CODE,
        details: {
          feature: "NUTRITION_PLAN_REVISION",
          tier,
        },
      },
    );
  }
  return tier;
}

async function currentNutritionContext(userId: string): Promise<{
  dietaryPreference: string;
  allergies: string[];
  healthConditions: string[];
  bloodTestImplications: BloodTestImplicationInput[];
}> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: {
      dietaryPreference: true,
      allergies: true,
      healthConditions: true,
    },
  });
  if (!profile) {
    throw ApiError.badRequest("Complete your onboarding profile before revising a nutrition plan.");
  }

  const analyses = await bloodTestAnalysisRepository.listByUser(userId);
  const latest = analyses.find((analysis) => analysis.status === "COMPLETED");
  const raw = latest?.nutritionImplications as unknown;
  const bloodTestImplications: BloodTestImplicationInput[] = Array.isArray(raw)
    ? raw.map((item) => {
        const record = (item ?? {}) as Record<string, unknown>;
        return {
          biomarkerName: String(record.biomarkerName ?? ""),
          implication: String(record.implication ?? ""),
          suggestedFoods: Array.isArray(record.suggestedFoods)
            ? record.suggestedFoods.map((value) => String(value))
            : [],
          foodsToLimit: Array.isArray(record.foodsToLimit)
            ? record.foodsToLimit.map((value) => String(value))
            : [],
        };
      })
    : [];

  return {
    dietaryPreference: profile.dietaryPreference,
    allergies: profile.allergies,
    healthConditions: profile.healthConditions,
    bloodTestImplications,
  };
}

async function generationInputFromPlan(
  userId: string,
  plan: NutritionPlan,
  durationDays: number,
): Promise<NutritionPlanGenerationInput> {
  const context = await currentNutritionContext(userId);
  return {
    goal: goalFromPlan(plan),
    dailyCalories: plan.dailyCalories,
    proteinGrams: plan.proteinGrams,
    carbsGrams: plan.carbsGrams,
    fatGrams: plan.fatGrams,
    waterMl: plan.waterMl,
    mealTiming: plan.mealTiming as unknown as MealTimingRecommendation,
    dietaryPreference: context.dietaryPreference,
    allergies: context.allergies,
    healthConditions: context.healthConditions,
    bloodTestImplications: context.bloodTestImplications,
    durationDays,
  };
}

function normalizedCalendar(content: NutritionPlanContent): CalendarDay[] {
  if (Array.isArray(content.calendar) && content.calendar.length === content.durationDays) {
    return content.calendar.map((item, index) => ({
      dayNumber: index + 1,
      cycleIndex: index,
      ...(Number.isFinite(item.dateOffsetDays) && item.dateOffsetDays
        ? { dateOffsetDays: Math.max(0, Math.trunc(item.dateOffsetDays)) }
        : {}),
    }));
  }

  return Array.from({ length: content.durationDays }, (_, index) => ({
    dayNumber: index + 1,
    cycleIndex: index,
  }));
}

function extendCalendar(content: NutritionPlanContent, targetDays: number): CalendarDay[] {
  const existing = normalizedCalendar(content);
  const carryOffset = existing.at(-1)?.dateOffsetDays ?? 0;
  return [
    ...existing,
    ...Array.from({ length: targetDays - content.durationDays }, (_, index) => {
      const dayNumber = content.durationDays + index + 1;
      return {
        dayNumber,
        cycleIndex: dayNumber - 1,
        ...(carryOffset > 0 ? { dateOffsetDays: carryOffset } : {}),
      };
    }),
  ];
}

function shiftedCalendar(content: NutritionPlanContent, dayNumber: number): CalendarDay[] {
  return normalizedCalendar(content).map((item) => {
    if (item.dayNumber < dayNumber) return item;
    const dateOffsetDays = (item.dateOffsetDays ?? 0) + 1;
    return { ...item, dateOffsetDays };
  });
}

function withReplacedRange(
  source: DailyPlan[],
  startDayNumber: number,
  replacement: DailyPlan[],
): DailyPlan[] {
  const next = [...source];
  replacement.forEach((day, index) => {
    next[startDayNumber - 1 + index] = day;
  });
  return next;
}

function planDayYmd(plan: NutritionPlan, content: NutritionPlanContent, dayNumber: number): string {
  const calendar = normalizedCalendar(content);
  const mapping = calendar.find((item) => item.dayNumber === dayNumber);
  if (!mapping) throw ApiError.badRequest("The selected plan day is unavailable.");
  const date = new Date(plan.startDate);
  date.setUTCDate(date.getUTCDate() + dayNumber - 1 + (mapping.dateOffsetDays ?? 0));
  return date.toISOString().slice(0, 10);
}

async function requireSupportedSource(
  userId: string,
  planId: string,
): Promise<NutritionPlan & { duration: PlanDuration }> {
  const plan = await nutritionPlanRepository.findByIdForUser(planId, userId);
  if (!plan || plan.deletedAt) throw ApiError.notFound("Nutrition plan not found.");
  if (!isSupportedPlanDuration(plan.duration)) {
    throw ApiError.badRequest("Legacy 60-day plans cannot be extended or partially regenerated.");
  }
  return plan as NutritionPlan & { duration: PlanDuration };
}

async function persistAiRevision(params: {
  userId: string;
  source: NutritionPlan;
  duration: PlanDuration;
  content: NutritionPlanContent;
  aiProvider: string;
  aiModel: string;
  processingTimeMs: number;
  deviationCopyPolicy:
    | { mode: "ALL" }
    | { mode: "BEFORE_DAY"; dayNumber: number }
    | { mode: "EXCEPT_DAY"; dayNumber: number };
}): Promise<NutritionPlan> {
  const plan = await nutritionPlanRepository.createRevisionVersion(params);
  await aiUsageService.record({
    userId: params.userId,
    feature: "NUTRITION_PLAN",
    provider: params.aiProvider,
    model: params.aiModel,
  });
  return plan;
}

/** Paid plan-continuity operations. Past plan rows remain immutable and auditable. */
export const nutritionPlanRevisionService = {
  async refresh(
    userId: string,
    planId: string,
    input: RefreshPlanInput,
  ): Promise<NutritionPlan> {
    const source = await requireSupportedSource(userId, planId);
    const tier = await requirePaidTier(userId);
    const content = contentFromPlan(source);
    if (input.dayNumber > content.durationDays) {
      throw ApiError.badRequest("The selected plan day is outside this plan's duration.");
    }

    await aiUsageService.assertWithinQuota(userId, "NUTRITION_PLAN", tier);
    const startedAt = Date.now();
    try {
      const startDayNumber = input.dayNumber;
      const daysToGenerate = input.mode === "DAY" ? 1 : content.durationDays - startDayNumber + 1;
      const generationInput = await generationInputFromPlan(userId, source, content.durationDays);
      const generated = await mealGeneratorService.generateRange(
        generationInput,
        startDayNumber,
        daysToGenerate,
        content.cycle.slice(0, startDayNumber - 1),
      );

      const cycle = withReplacedRange(content.cycle, startDayNumber, generated.output.cycle);
      if (cycle.length !== content.durationDays || cycle.some((day) => !day)) {
        throw new ApiError(502, "The revised nutrition plan is incomplete.", {
          code: "NUTRITION_PLAN_INCOMPLETE",
          isOperational: false,
        });
      }

      const revisedContent: NutritionPlanContent = {
        ...content,
        cycleLengthDays: content.durationDays,
        cycle,
        calendar: normalizedCalendar(content),
      };

      return persistAiRevision({
        userId,
        source,
        duration: source.duration,
        content: revisedContent,
        aiProvider: generated.aiProvider,
        aiModel: generated.aiModel,
        processingTimeMs: Date.now() - startedAt,
        deviationCopyPolicy:
          input.mode === "DAY"
            ? { mode: "EXCEPT_DAY", dayNumber: startDayNumber }
            : { mode: "BEFORE_DAY", dayNumber: startDayNumber },
      });
    } catch (error) {
      logger.error(
        { err: error, userId, planId, mode: input.mode, dayNumber: input.dayNumber },
        "Nutrition plan scoped refresh failed",
      );
      if (error instanceof ApiError) throw error;
      throw ApiError.internal("Nutrition plan scoped refresh failed.");
    }
  },

  async extend(userId: string, planId: string, input: ExtendPlanInput): Promise<NutritionPlan> {
    const source = await requireSupportedSource(userId, planId);
    const tier = await requirePaidTier(userId);
    const content = contentFromPlan(source);
    const targetDays = DURATION_DAYS[input.duration];

    if (targetDays <= content.durationDays) {
      throw ApiError.badRequest("A plan can only be extended to a longer supported duration.");
    }

    await aiUsageService.assertWithinQuota(userId, "NUTRITION_PLAN", tier);
    const startedAt = Date.now();
    try {
      const startDayNumber = content.durationDays + 1;
      const daysToGenerate = targetDays - content.durationDays;
      const generationInput = await generationInputFromPlan(userId, source, targetDays);
      const generated = await mealGeneratorService.generateRange(
        generationInput,
        startDayNumber,
        daysToGenerate,
        content.cycle,
      );
      const cycle = [...content.cycle, ...generated.output.cycle];
      if (cycle.length !== targetDays) {
        throw new ApiError(502, "The extended nutrition plan is incomplete.", {
          code: "NUTRITION_PLAN_INCOMPLETE",
          isOperational: false,
        });
      }

      const extendedContent: NutritionPlanContent = {
        durationDays: targetDays,
        cycleLengthDays: targetDays,
        cycle,
        calendar: extendCalendar(content, targetDays),
      };

      return persistAiRevision({
        userId,
        source,
        duration: input.duration,
        content: extendedContent,
        aiProvider: generated.aiProvider,
        aiModel: generated.aiModel,
        processingTimeMs: Date.now() - startedAt,
        deviationCopyPolicy: { mode: "ALL" },
      });
    } catch (error) {
      logger.error(
        { err: error, userId, planId, targetDuration: input.duration },
        "Nutrition plan extension failed",
      );
      if (error instanceof ApiError) throw error;
      throw ApiError.internal("Nutrition plan extension failed.");
    }
  },

  /** Moves today's selected plan day and every later day one calendar day forward without an AI call. */
  async shiftDay(userId: string, planId: string, input: ShiftPlanDayInput): Promise<NutritionPlan> {
    const source = await requireSupportedSource(userId, planId);
    await requirePaidTier(userId);
    const content = contentFromPlan(source);
    if (input.dayNumber > content.durationDays) {
      throw ApiError.badRequest("The selected plan day is outside this plan's duration.");
    }

    const expectedDate = planDayYmd(source, content, input.dayNumber);
    if (expectedDate !== input.localDate) {
      throw new ApiError(409, "The selected plan day is no longer scheduled for today.", {
        code: "NUTRITION_PLAN_DAY_STALE",
      });
    }

    const shiftedContent: NutritionPlanContent = {
      ...content,
      calendar: shiftedCalendar(content, input.dayNumber),
    };

    return nutritionPlanRepository.createRevisionVersion({
      userId,
      source,
      duration: source.duration,
      content: shiftedContent,
      aiProvider: source.aiProvider,
      aiModel: source.aiModel,
      processingTimeMs: 0,
      deviationCopyPolicy: { mode: "ALL" },
    });
  },
};
