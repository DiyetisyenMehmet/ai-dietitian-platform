import type { NutritionPlan, NutritionPlanDeviation } from "@prisma/client";

import { ApiError } from "../../utils/api-error";
import { aiUsageService } from "../ai-usage/ai-usage.service";
import { ENTITLEMENT_REQUIRED_CODE } from "../payments/constants";
import type { CreateDeviationInput } from "./dto/nutrition-plan.schemas";
import { nutritionPlanDeviationRepository } from "./nutrition-plan-deviation.repository";
import { nutritionPlanRepository } from "./nutrition-plan.repository";
import type { DailyPlan, NutritionPlanContent } from "./types";

interface PlannedContext {
  plannedItemName?: string;
  plannedPortion?: string;
}

function contentFromPlan(plan: NutritionPlan): NutritionPlanContent {
  const content = plan.dailyPlans as unknown as NutritionPlanContent;
  if (!content || !Array.isArray(content.cycle) || content.cycle.length === 0) {
    throw ApiError.badRequest("Nutrition plan content is unavailable.");
  }
  return content;
}

function dayFromContent(content: NutritionPlanContent, dayNumber: number): DailyPlan {
  if (dayNumber < 1 || dayNumber > content.durationDays) {
    throw ApiError.badRequest("The selected plan day is outside this plan's duration.");
  }

  const mapping = content.calendar?.find((item) => item.dayNumber === dayNumber);
  const cycleIndex = mapping?.cycleIndex ?? dayNumber - 1;
  const day = content.cycle[cycleIndex];
  if (!day) {
    throw ApiError.badRequest("The selected plan day is unavailable.");
  }
  return day;
}

function planDayYmd(plan: NutritionPlan, content: NutritionPlanContent, dayNumber: number): string {
  dayFromContent(content, dayNumber);
  const mapping = content.calendar?.find((item) => item.dayNumber === dayNumber);
  const offset = Math.max(0, Math.trunc(mapping?.dateOffsetDays ?? 0));
  const date = new Date(plan.startDate);
  date.setUTCDate(date.getUTCDate() + dayNumber - 1 + offset);
  return date.toISOString().slice(0, 10);
}

function assertPlanDayStarted(
  plan: NutritionPlan,
  content: NutritionPlanContent,
  dayNumber: number,
  localDate: string,
): void {
  const selectedDate = planDayYmd(plan, content, dayNumber);
  if (selectedDate > localDate) {
    throw new ApiError(409, "Bu plan günü henüz başlamadı.", {
      code: "NUTRITION_PLAN_DAY_NOT_STARTED",
      details: { dayNumber, selectedDate },
    });
  }
}

function plannedContext(content: NutritionPlanContent, input: CreateDeviationInput): PlannedContext {
  const day = dayFromContent(content, input.dayNumber);
  if (input.scope === "DAY") return {};

  const mealIndex = input.mealIndex;
  if (mealIndex === undefined || mealIndex >= day.meals.length) {
    throw ApiError.badRequest("The selected meal is unavailable in this plan day.");
  }
  const meal = day.meals[mealIndex];

  if (input.scope === "MEAL") {
    return { plannedItemName: meal.name };
  }

  const foodIndex = input.foodIndex;
  if (foodIndex === undefined || foodIndex >= meal.foods.length) {
    throw ApiError.badRequest("The selected food is unavailable in this meal.");
  }
  const food = meal.foods[foodIndex];
  return {
    plannedItemName: food.name,
    plannedPortion: food.portion,
  };
}

async function requireReadablePlan(userId: string, planId: string): Promise<NutritionPlan> {
  const plan = await nutritionPlanRepository.findByIdForUser(planId, userId);
  if (!plan || plan.deletedAt) {
    throw ApiError.notFound("Nutrition plan not found.");
  }
  return plan;
}

async function requirePaidTier(userId: string): Promise<void> {
  const tier = await aiUsageService.resolveTier(userId);
  if (tier === "FREE") {
    throw new ApiError(403, "Kaçamak kaydı Premium ve Premium Plus planlarında kullanılabilir.", {
      code: ENTITLEMENT_REQUIRED_CODE,
      details: {
        feature: "NUTRITION_PLAN_ADHERENCE",
        tier,
      },
    });
  }
}

/**
 * Application service for user-reported nutrition-plan deviations ("Kaçamak").
 * Plan content is immutable; adherence records are stored separately and never
 * rewrite what the user was originally prescribed by the plan generator.
 */
export const nutritionPlanDeviationService = {
  async list(userId: string, planId: string): Promise<NutritionPlanDeviation[]> {
    await requireReadablePlan(userId, planId);
    return nutritionPlanDeviationRepository.listByPlanForUser(planId, userId);
  },

  async create(
    userId: string,
    planId: string,
    input: CreateDeviationInput,
  ): Promise<NutritionPlanDeviation> {
    await requirePaidTier(userId);
    const plan = await requireReadablePlan(userId, planId);
    const content = contentFromPlan(plan);
    assertPlanDayStarted(plan, content, input.dayNumber, input.localDate);
    const planned = plannedContext(content, input);

    const result = await nutritionPlanDeviationRepository.createGuarded({
      userId,
      planId,
      dayNumber: input.dayNumber,
      mealIndex: input.mealIndex,
      foodIndex: input.foodIndex,
      scope: input.scope,
      type: input.type,
      plannedItemName: planned.plannedItemName,
      plannedPortion: planned.plannedPortion,
      actualItemName: input.actualItemName,
      actualPortion: input.actualPortion,
      note: input.note,
    });

    if (result.kind === "conflict") {
      throw new ApiError(409, "Bu plan hedefi için çakışan bir Kaçamak kaydı zaten var.", {
        code: "NUTRITION_PLAN_DEVIATION_CONFLICT",
        details: { deviationId: result.record.id },
      });
    }

    return result.record;
  },

  async remove(userId: string, planId: string, deviationId: string): Promise<void> {
    // Deleting/correcting one's own historical adherence data remains available
    // even after a subscription downgrade; only creation is an entitlement.
    await requireReadablePlan(userId, planId);
    const existing = await nutritionPlanDeviationRepository.findByIdForUser(
      deviationId,
      planId,
      userId,
    );
    if (!existing) {
      throw ApiError.notFound("Kaçamak kaydı bulunamadı.");
    }

    const deleted = await nutritionPlanDeviationRepository.deleteByIdForUser(
      deviationId,
      planId,
      userId,
    );
    if (!deleted) {
      throw ApiError.notFound("Kaçamak kaydı bulunamadı.");
    }
  },
};
