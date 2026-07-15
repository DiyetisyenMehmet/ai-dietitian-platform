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

/**
 * Data-access layer for nutrition plans. All reads are owner-scoped by `userId`
 * so a user can never access another user's plan. Plans are immutable and
 * versioned: creating a new version atomically deactivates the previous active
 * plan for the same (user, duration) while retaining its row.
 */
export const nutritionPlanRepository = {
  /**
   * Creates a new plan as the next version for its (user, duration), marking it
   * active and deactivating any previously active plan in the same transaction.
   * Prior plans are never deleted, so history is preserved.
   *
   * @param data - The fully computed plan data.
   * @returns The persisted, active plan row.
   */
  async createVersioned(data: CreatePlanData): Promise<NutritionPlan> {
    return prisma.$transaction(async (tx) => {
      const latest = await tx.nutritionPlan.findFirst({
        where: { userId: data.userId, duration: data.duration },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const nextVersion = (latest?.version ?? 0) + 1;

      // Retain history: only flip the active flag on prior plans.
      await tx.nutritionPlan.updateMany({
        where: { userId: data.userId, duration: data.duration, isActive: true },
        data: { isActive: false },
      });

      return tx.nutritionPlan.create({
        data: {
          userId: data.userId,
          duration: data.duration,
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

  /** Fetches a plan by id, scoped to the user. */
  findByIdForUser(id: string, userId: string): Promise<NutritionPlan | null> {
    return prisma.nutritionPlan.findFirst({ where: { id, userId } });
  },

  /** Lists all of a user's plans, newest first. */
  listByUser(userId: string): Promise<NutritionPlan[]> {
    return prisma.nutritionPlan.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }],
    });
  },

  /** Fetches the active plan for a user + duration, if any. */
  findActive(userId: string, duration: NutritionPlanDuration): Promise<NutritionPlan | null> {
    return prisma.nutritionPlan.findFirst({
      where: { userId, duration, isActive: true },
      orderBy: { version: "desc" },
    });
  },
};
