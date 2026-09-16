import type {
  NutritionPlanDeviation,
  NutritionPlanDeviationScope,
  NutritionPlanDeviationType,
} from "@prisma/client";

import { prisma } from "../../lib/prisma";
import {
  findDeviationConflict,
  findExactDeviationDuplicate,
  type DeviationConflictReason,
} from "./nutrition-plan-deviation-policy";

export interface CreateNutritionPlanDeviationData {
  userId: string;
  planId: string;
  dayNumber: number;
  mealIndex?: number;
  foodIndex?: number;
  scope: NutritionPlanDeviationScope;
  type: NutritionPlanDeviationType;
  plannedItemName?: string;
  actualItemName?: string;
  plannedPortion?: string;
  actualPortion?: string;
  note?: string;
}

export type GuardedDeviationCreateResult =
  | { status: "CREATED"; deviation: NutritionPlanDeviation }
  | { status: "EXISTING"; deviation: NutritionPlanDeviation }
  | { status: "CONFLICT"; reason: DeviationConflictReason };

function mutationLockKey(data: CreateNutritionPlanDeviationData): string {
  // Meal-level lock deliberately serializes whole-meal skip with food-level
  // writes in the same meal. DAY entries use a day-only key.
  return [
    "nutrition-plan-deviation",
    data.userId,
    data.planId,
    data.dayNumber,
    data.mealIndex ?? "day",
  ].join(":");
}

/** Owner-scoped persistence for nutrition-plan adherence ("Kaçamak") records. */
export const nutritionPlanDeviationRepository = {
  async createGuarded(
    data: CreateNutritionPlanDeviationData,
  ): Promise<GuardedDeviationCreateResult> {
    return prisma.$transaction(async (tx) => {
      const lockKey = mutationLockKey(data);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`;

      const existing = await tx.nutritionPlanDeviation.findMany({
        where: {
          userId: data.userId,
          planId: data.planId,
          dayNumber: data.dayNumber,
          ...(data.mealIndex !== undefined ? { mealIndex: data.mealIndex } : {}),
        },
        orderBy: { createdAt: "asc" },
      });

      const duplicate = findExactDeviationDuplicate(existing, data);
      if (duplicate) {
        return { status: "EXISTING" as const, deviation: duplicate };
      }

      const conflict = findDeviationConflict(existing, data);
      if (conflict) {
        return { status: "CONFLICT" as const, reason: conflict };
      }

      const deviation = await tx.nutritionPlanDeviation.create({ data });
      return { status: "CREATED" as const, deviation };
    });
  },

  listByPlanForUser(planId: string, userId: string): Promise<NutritionPlanDeviation[]> {
    return prisma.nutritionPlanDeviation.findMany({
      where: { planId, userId },
      orderBy: [{ dayNumber: "asc" }, { createdAt: "asc" }],
    });
  },

  findByIdForUser(
    id: string,
    planId: string,
    userId: string,
  ): Promise<NutritionPlanDeviation | null> {
    return prisma.nutritionPlanDeviation.findFirst({
      where: { id, planId, userId },
    });
  },

  async deleteByIdForUser(id: string, planId: string, userId: string): Promise<boolean> {
    const result = await prisma.nutritionPlanDeviation.deleteMany({
      where: { id, planId, userId },
    });
    return result.count > 0;
  },
};
