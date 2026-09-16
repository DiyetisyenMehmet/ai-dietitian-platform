import { Prisma, type NutritionPlanDeviation, type NutritionPlanDeviationScope, type NutritionPlanDeviationType } from "@prisma/client";

import { prisma } from "../../lib/prisma";

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

export type CreateGuardedDeviationResult =
  | { kind: "created"; record: NutritionPlanDeviation }
  | { kind: "reused"; record: NutritionPlanDeviation }
  | { kind: "conflict"; record: NutritionPlanDeviation };

const RETRY_DEDUP_WINDOW_MS = 10_000;
const MUTUALLY_EXCLUSIVE_FOOD_TYPES: NutritionPlanDeviationType[] = [
  "SKIPPED",
  "REPLACED",
  "PORTION_CHANGED",
];

function sameOptional(left: string | null, right: string | undefined): boolean {
  return (left ?? undefined) === right;
}

function sameRetryPayload(
  existing: NutritionPlanDeviation,
  data: CreateNutritionPlanDeviationData,
): boolean {
  return (
    existing.dayNumber === data.dayNumber &&
    (existing.mealIndex ?? undefined) === data.mealIndex &&
    (existing.foodIndex ?? undefined) === data.foodIndex &&
    existing.scope === data.scope &&
    existing.type === data.type &&
    sameOptional(existing.actualItemName, data.actualItemName) &&
    sameOptional(existing.actualPortion, data.actualPortion) &&
    sameOptional(existing.note, data.note)
  );
}

function conflictsWith(
  existing: NutritionPlanDeviation,
  data: CreateNutritionPlanDeviationData,
): boolean {
  const mealMatches =
    data.mealIndex !== undefined &&
    existing.mealIndex !== null &&
    existing.mealIndex === data.mealIndex;

  if (
    data.scope === "FOOD" &&
    data.foodIndex !== undefined &&
    MUTUALLY_EXCLUSIVE_FOOD_TYPES.includes(data.type)
  ) {
    if (
      existing.scope === "MEAL" &&
      existing.type === "SKIPPED" &&
      mealMatches
    ) {
      return true;
    }
    return (
      existing.scope === "FOOD" &&
      mealMatches &&
      existing.foodIndex === data.foodIndex &&
      MUTUALLY_EXCLUSIVE_FOOD_TYPES.includes(existing.type)
    );
  }

  if (data.scope === "MEAL" && data.type === "SKIPPED" && data.mealIndex !== undefined) {
    if (existing.scope === "MEAL" && existing.type === "SKIPPED" && mealMatches) {
      return true;
    }
    return existing.scope === "FOOD" && mealMatches;
  }

  return false;
}

/** Owner-scoped persistence for nutrition-plan adherence ("Kaçamak") records. */
export const nutritionPlanDeviationRepository = {
  async createGuarded(
    data: CreateNutritionPlanDeviationData,
    now = new Date(),
  ): Promise<CreateGuardedDeviationResult> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await prisma.$transaction(
          async (tx) => {
            const existing = await tx.nutritionPlanDeviation.findMany({
              where: {
                userId: data.userId,
                planId: data.planId,
                dayNumber: data.dayNumber,
                ...(data.mealIndex === undefined ? {} : { mealIndex: data.mealIndex }),
              },
              orderBy: { createdAt: "desc" },
            });

            const retryCutoff = now.getTime() - RETRY_DEDUP_WINDOW_MS;
            const retry = existing.find(
              (record) =>
                record.createdAt.getTime() >= retryCutoff && sameRetryPayload(record, data),
            );
            if (retry) return { kind: "reused" as const, record: retry };

            const conflict = existing.find((record) => conflictsWith(record, data));
            if (conflict) return { kind: "conflict" as const, record: conflict };

            const record = await tx.nutritionPlanDeviation.create({ data });
            return { kind: "created" as const, record };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
        if (!retryable || attempt === 2) throw error;
      }
    }

    throw new Error("Kaçamak transaction retry budget exhausted.");
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
