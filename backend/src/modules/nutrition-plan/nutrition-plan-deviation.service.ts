import { randomUUID } from "node:crypto";

import type { MealType, NutritionPlan, NutritionPlanDeviation } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { aiUsageService } from "../ai-usage/ai-usage.service";
import { ENTITLEMENT_REQUIRED_CODE } from "../payments/constants";
import type { CreateDeviationInput } from "./dto/nutrition-plan.schemas";
import { nutritionPlanDeviationRepository } from "./nutrition-plan-deviation.repository";
import { nutritionPlanRepository } from "./nutrition-plan.repository";
import type { DailyPlan, NutritionPlanContent, PlannedFood, PlannedMeal } from "./types";

interface PlannedContext {
  day: DailyPlan;
  meal?: PlannedMeal;
  food?: PlannedFood;
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

function plannedContext(content: NutritionPlanContent, input: CreateDeviationInput): PlannedContext {
  const day = dayFromContent(content, input.dayNumber);
  if (input.scope === "DAY") return { day };

  const mealIndex = input.mealIndex;
  if (mealIndex === undefined || mealIndex >= day.meals.length) {
    throw ApiError.badRequest("The selected meal is unavailable in this plan day.");
  }
  const meal = day.meals[mealIndex];

  if (input.scope === "MEAL") {
    return { day, meal, plannedItemName: meal.name };
  }

  const foodIndex = input.foodIndex;
  if (foodIndex === undefined || foodIndex >= meal.foods.length) {
    throw ApiError.badRequest("The selected food is unavailable in this meal.");
  }
  const food = meal.foods[foodIndex];
  return {
    day,
    meal,
    food,
    plannedItemName: food.name,
    plannedPortion: food.portion,
  };
}

function planDayYmd(plan: NutritionPlan, content: NutritionPlanContent, dayNumber: number): string {
  const mapping = content.calendar?.find((item) => item.dayNumber === dayNumber);
  const dateOffsetDays = mapping?.dateOffsetDays ?? 0;
  const date = new Date(plan.startDate);
  date.setUTCDate(date.getUTCDate() + dayNumber - 1 + dateOffsetDays);
  return date.toISOString().slice(0, 10);
}

function requireStartedDay(
  plan: NutritionPlan,
  content: NutritionPlanContent,
  input: CreateDeviationInput,
): string {
  const dayYmd = planDayYmd(plan, content, input.dayNumber);
  if (dayYmd > input.localDate) {
    throw ApiError.badRequest("Kaçamak henüz başlamamış bir plan gününe eklenemez.");
  }
  return dayYmd;
}

function mealTypeFor(meal: PlannedMeal | undefined): MealType {
  if (!meal) return "SNACK";
  const name = meal.name.toLocaleLowerCase("tr-TR");
  if (name.includes("kahvalt")) return "BREAKFAST";
  if (name.includes("öğle") || name.includes("ogle")) return "LUNCH";
  if (name.includes("akşam") || name.includes("aksam")) return "DINNER";
  if (name.includes("ara") || name.includes("atıştır") || name.includes("snack")) return "SNACK";

  const hour = Number(meal.time.split(":")[0]);
  if (Number.isFinite(hour)) {
    if (hour < 11) return "BREAKFAST";
    if (hour < 15) return "LUNCH";
    if (hour >= 17 && hour < 23) return "DINNER";
  }
  return "SNACK";
}

function parsePortion(value: string | undefined): { amount: number; unit: string } | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match) return null;
  const amount = Number(match[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, unit: match[2].trim().toLocaleLowerCase("tr-TR") };
}

function derivedPortionCalories(context: PlannedContext, input: CreateDeviationInput): number | undefined {
  if (input.type !== "PORTION_CHANGED" || !context.food) return undefined;
  const planned = parsePortion(context.food.portion);
  const actual = parsePortion(input.actualPortion);
  if (!planned || !actual || planned.unit !== actual.unit) return undefined;
  const calories = context.food.calories * (actual.amount / planned.amount);
  return Number.isFinite(calories) && calories >= 0 ? Math.round(calories * 100) / 100 : undefined;
}

function actualNutritionFor(context: PlannedContext, input: CreateDeviationInput) {
  const supplied = input.actualNutrition;
  const derivedCalories = supplied?.calories ?? derivedPortionCalories(context, input);
  if (
    derivedCalories === undefined &&
    supplied?.proteinG === undefined &&
    supplied?.carbsG === undefined &&
    supplied?.fatG === undefined
  ) {
    return null;
  }

  return {
    calories: derivedCalories,
    proteinG: supplied?.proteinG,
    carbsG: supplied?.carbsG,
    fatG: supplied?.fatG,
  };
}

function actualMealName(context: PlannedContext, input: CreateDeviationInput): string | undefined {
  if (input.type === "REPLACED" || input.type === "EXTRA") return input.actualItemName;
  if (input.type === "PORTION_CHANGED") return context.plannedItemName;
  return undefined;
}

function logTimestamp(dayYmd: string, meal: PlannedMeal | undefined): Date {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(meal?.time ?? "") ? meal?.time : "12:00";
  return new Date(`${dayYmd}T${time}:00.000Z`);
}

function sameNullable<T>(left: T | null | undefined, right: T | null | undefined): boolean {
  return (left ?? null) === (right ?? null);
}

function isExactDuplicate(existing: NutritionPlanDeviation, input: CreateDeviationInput): boolean {
  return (
    existing.dayNumber === input.dayNumber &&
    sameNullable(existing.mealIndex, input.mealIndex) &&
    sameNullable(existing.foodIndex, input.foodIndex) &&
    existing.scope === input.scope &&
    existing.type === input.type &&
    sameNullable(existing.actualItemName, input.actualItemName) &&
    sameNullable(existing.actualPortion, input.actualPortion) &&
    sameNullable(existing.note, input.note)
  );
}

function conflicts(existing: NutritionPlanDeviation, input: CreateDeviationInput): boolean {
  if (existing.type === "EXTRA" || input.type === "EXTRA") return false;
  if (existing.dayNumber !== input.dayNumber) return false;

  if (existing.scope === "DAY" || input.scope === "DAY") return true;

  if (existing.mealIndex !== input.mealIndex) return false;
  if (existing.scope === "MEAL" || input.scope === "MEAL") return true;

  return existing.foodIndex === input.foodIndex;
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
 *
 * When reliable actual nutrition is available, the generated MealLog uses the
 * exact same UUID as its deviation. This deliberately avoids a second linkage
 * column/table while still making create/delete idempotent and reversible. Daily
 * nutrition totals continue to aggregate MealLog only, so deviation metadata is
 * never counted a second time.
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
    const planned = plannedContext(content, input);
    const dayYmd = requireStartedDay(plan, content, input);

    return prisma.$transaction(async (tx) => {
      const lockKey = `${userId}:${planId}:${input.dayNumber}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const existing = await tx.nutritionPlanDeviation.findMany({
        where: { userId, planId, dayNumber: input.dayNumber },
        orderBy: { createdAt: "asc" },
      });
      const duplicate = existing.find((item) => isExactDuplicate(item, input));
      if (duplicate) return duplicate;

      if (existing.some((item) => conflicts(item, input))) {
        throw ApiError.conflict(
          "Bu öğün veya besin için çelişen bir Kaçamak kaydı zaten bulunuyor. Önce mevcut kaydı geri al.",
        );
      }

      const deviationId = randomUUID();
      const deviation = await tx.nutritionPlanDeviation.create({
        data: {
          id: deviationId,
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
        },
      });

      if (input.type !== "SKIPPED") {
        const nutrition = actualNutritionFor(planned, input);
        await tx.mealLog.create({
          data: {
            id: deviationId,
            userId,
            mealType: mealTypeFor(planned.meal),
            name: actualMealName(planned, input),
            calories: nutrition?.calories,
            proteinG: nutrition?.proteinG,
            carbsG: nutrition?.carbsG,
            fatG: nutrition?.fatG,
            loggedAt: logTimestamp(dayYmd, planned.meal),
          },
        });
      }

      return deviation;
    });
  },

  async remove(userId: string, planId: string, deviationId: string): Promise<void> {
    // Deleting/correcting one's own historical adherence data remains available
    // even after a subscription downgrade; only creation is an entitlement.
    await requireReadablePlan(userId, planId);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.nutritionPlanDeviation.findFirst({
        where: { id: deviationId, planId, userId },
      });
      if (!existing) {
        throw ApiError.notFound("Kaçamak kaydı bulunamadı.");
      }

      // Only the MealLog carrying the same server-generated deviation UUID can
      // be removed here; independent tracking entries can never match this path.
      await tx.mealLog.deleteMany({ where: { id: deviationId, userId } });
      await tx.nutritionPlanDeviation.delete({ where: { id: deviationId } });
    });
  },
};
