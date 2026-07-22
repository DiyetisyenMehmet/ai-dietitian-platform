import type { MealLog, WaterLog, WeightLog } from "@prisma/client";

import { prisma } from "../../lib/prisma";

/**
 * Data access for the Sprint 19 tracking logs. Kept intentionally thin: the
 * intelligence services own the analysis; this layer only reads/writes rows.
 * All queries are owner-scoped by `userId`.
 */
export const trackingRepository = {
  createWeightLog(data: {
    userId: string;
    weightKg: number;
    note?: string;
    loggedAt?: Date;
  }): Promise<WeightLog> {
    return prisma.weightLog.create({ data });
  },

  listWeightLogs(userId: string, since?: Date): Promise<WeightLog[]> {
    return prisma.weightLog.findMany({
      where: { userId, ...(since ? { loggedAt: { gte: since } } : {}) },
      orderBy: { loggedAt: "desc" },
    });
  },

  createMealLog(data: {
    userId: string;
    mealType: MealLog["mealType"];
    name?: string;
    calories?: number;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
    sodiumMg?: number;
    sugarG?: number;
    loggedAt?: Date;
  }): Promise<MealLog> {
    return prisma.mealLog.create({ data });
  },

  listMealLogs(userId: string, since?: Date): Promise<MealLog[]> {
    return prisma.mealLog.findMany({
      where: { userId, ...(since ? { loggedAt: { gte: since } } : {}) },
      orderBy: { loggedAt: "desc" },
    });
  },

  createWaterLog(data: { userId: string; amountMl: number; loggedAt?: Date }): Promise<WaterLog> {
    return prisma.waterLog.create({ data });
  },

  listWaterLogs(userId: string, since?: Date): Promise<WaterLog[]> {
    return prisma.waterLog.findMany({
      where: { userId, ...(since ? { loggedAt: { gte: since } } : {}) },
      orderBy: { loggedAt: "desc" },
    });
  },
};
