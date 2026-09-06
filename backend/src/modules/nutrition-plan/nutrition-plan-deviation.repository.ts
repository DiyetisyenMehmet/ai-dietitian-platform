import type {
  NutritionPlanDeviation,
  NutritionPlanDeviationScope,
  NutritionPlanDeviationType,
} from "@prisma/client";

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

/** Owner-scoped persistence for nutrition-plan adherence ("Kaçamak") records. */
export const nutritionPlanDeviationRepository = {
  create(data: CreateNutritionPlanDeviationData): Promise<NutritionPlanDeviation> {
    return prisma.nutritionPlanDeviation.create({ data });
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
