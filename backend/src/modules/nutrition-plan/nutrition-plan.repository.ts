import type { NutritionPlan, NutritionPlanDuration, Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type {
  CalorieCalculation,
  MacroBreakdown,
  MealTimingRecommendation,
  NutritionPlanContent,
  PlanExplanations,
  WaterRecommendation,
} from "./types";

/** Casts a typed value to a Prisma JSON input value. */
function toJson(value: unknown): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

/** All data required to persist a freshly generated plan. */
export interface CreatePlanData {
  userId: string;
  duration: NutritionPlanDuration;
  startDate: Date;
  bloodTestAnalysisId: string | null;
  calories: CalorieCalculation;
  macros: MacroBreakdown;
  water: WaterRecommendation;
  mealTiming: MealTimingRecommendation;
  content: NutritionPlanContent;
  explanations: PlanExplanations;
  recommendations: string[];
  summary: string;
  aiProvider: string;
  aiModel: string;
  processingTimeMs: number;
}

export type DeviationCopyPolicy =
  | { mode: "NONE" }
  | { mode: "ALL" }
  | { mode: "BEFORE_DAY"; dayNumber: number }
  | { mode: "EXCEPT_DAY"; dayNumber: number };

export interface CreateRevisionVersionData {
  userId: string;
  source: NutritionPlan;
  duration: NutritionPlanDuration;
  content: NutritionPlanContent;
  aiProvider: string | null;
  aiModel: string | null;
  processingTimeMs: number;
  deviationCopyPolicy: DeviationCopyPolicy;
}

function deviationWhere(
  planId: string,
  userId: string,
  policy: DeviationCopyPolicy,
): Prisma.NutritionPlanDeviationWhereInput | null {
  if (policy.mode === "NONE") return null;
  const where: Prisma.NutritionPlanDeviationWhereInput = { planId, userId };
  if (policy.mode === "BEFORE_DAY") where.dayNumber = { lt: policy.dayNumber };
  if (policy.mode === "EXCEPT_DAY") where.NOT = { dayNumber: policy.dayNumber };
  return where;
}

/**
 * Data-access layer for nutrition plans. All reads are owner-scoped by `userId`.
 * New versions keep historical rows immutable while ensuring the user has one
 * current active plan across the supported 7/14/30-day horizons.
 */
export const nutritionPlanRepository = {
  async createVersioned(data: CreatePlanData): Promise<NutritionPlan> {
    return prisma.$transaction(async (tx) => {
      const latest = await tx.nutritionPlan.findFirst({
        where: { userId: data.userId, duration: data.duration },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const nextVersion = (latest?.version ?? 0) + 1;

      await tx.nutritionPlan.updateMany({
        where: {
          userId: data.userId,
          isActive: true,
          deletedAt: null,
        },
        data: { isActive: false },
      });

      return tx.nutritionPlan.create({
        data: {
          userId: data.userId,
          duration: data.duration,
          startDate: data.startDate,
          version: nextVersion,
          isActive: true,
          status: "COMPLETED",
          bloodTestAnalysisId: data.bloodTestAnalysisId,
          bmr: data.calories.bmr,
          tdee: data.calories.tdee,
          dailyCalories: data.calories.dailyCalories,
          proteinGrams: data.macros.proteinGrams,
          carbsGrams: data.macros.carbsGrams,
          fatGrams: data.macros.fatGrams,
          waterMl: data.water.waterMl,
          mealsPerDay: data.mealTiming.mealsPerDay,
          mealTiming: toJson(data.mealTiming),
          dailyPlans: toJson(data.content),
          explanations: toJson(data.explanations),
          recommendations: toJson(data.recommendations),
          summary: data.summary,
          aiProvider: data.aiProvider,
          aiModel: data.aiModel,
          processingTimeMs: data.processingTimeMs,
        },
      });
    });
  },

  /** Creates a new immutable version from an existing plan and optionally carries adherence history forward. */
  async createRevisionVersion(data: CreateRevisionVersionData): Promise<NutritionPlan> {
    return prisma.$transaction(async (tx) => {
      const latest = await tx.nutritionPlan.findFirst({
        where: { userId: data.userId, duration: data.duration },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const nextVersion = (latest?.version ?? 0) + 1;

      await tx.nutritionPlan.updateMany({
        where: { userId: data.userId, isActive: true, deletedAt: null },
        data: { isActive: false },
      });

      const plan = await tx.nutritionPlan.create({
        data: {
          userId: data.userId,
          duration: data.duration,
          startDate: data.source.startDate,
          version: nextVersion,
          isActive: true,
          status: "COMPLETED",
          bloodTestAnalysisId: data.source.bloodTestAnalysisId,
          bmr: data.source.bmr,
          tdee: data.source.tdee,
          dailyCalories: data.source.dailyCalories,
          proteinGrams: data.source.proteinGrams,
          carbsGrams: data.source.carbsGrams,
          fatGrams: data.source.fatGrams,
          waterMl: data.source.waterMl,
          mealsPerDay: data.source.mealsPerDay,
          mealTiming: toJson(data.source.mealTiming),
          dailyPlans: toJson(data.content),
          explanations: toJson(data.source.explanations),
          recommendations: toJson(data.source.recommendations),
          summary: data.source.summary,
          aiProvider: data.aiProvider,
          aiModel: data.aiModel,
          processingTimeMs: data.processingTimeMs,
        },
      });

      const where = deviationWhere(data.source.id, data.userId, data.deviationCopyPolicy);
      if (where) {
        const deviations = await tx.nutritionPlanDeviation.findMany({ where });
        if (deviations.length > 0) {
          await tx.nutritionPlanDeviation.createMany({
            data: deviations.map((item) => ({
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
              userId: item.userId,
              planId: plan.id,
              dayNumber: item.dayNumber,
              mealIndex: item.mealIndex,
              foodIndex: item.foodIndex,
              scope: item.scope,
              type: item.type,
              plannedItemName: item.plannedItemName,
              actualItemName: item.actualItemName,
              plannedPortion: item.plannedPortion,
              actualPortion: item.actualPortion,
              note: item.note,
            })),
          });
        }
      }

      return plan;
    });
  },

  /** Fetches a plan by id, scoped to the user. Callers decide whether history may include deleted rows. */
  findByIdForUser(id: string, userId: string): Promise<NutritionPlan | null> {
    return prisma.nutritionPlan.findFirst({ where: { id, userId } });
  },

  /** Lists non-deleted plan history newest first. */
  listByUser(userId: string): Promise<NutritionPlan[]> {
    return prisma.nutritionPlan.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ createdAt: "desc" }],
    });
  },

  /** Fetches the active non-deleted plan for a user + duration, if any. */
  findActive(userId: string, duration: NutritionPlanDuration): Promise<NutritionPlan | null> {
    return prisma.nutritionPlan.findFirst({
      where: { userId, duration, isActive: true, deletedAt: null },
      orderBy: { version: "desc" },
    });
  },

  /** Soft-deletes one owner-scoped plan while preserving audit/history relations. */
  async softDeleteByIdForUser(id: string, userId: string): Promise<boolean> {
    const result = await prisma.nutritionPlan.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
    return result.count > 0;
  },
};
