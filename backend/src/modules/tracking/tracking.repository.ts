import type { MealLog, WaterLog, WeightLog } from "@prisma/client";

import { prisma } from "../../lib/prisma";

/**
 * Data access for tracking logs. All reads/writes/deletes are owner-scoped by
 * `userId` so record ids from another account can never be used as an IDOR.
 */
export const trackingRepository = {
  /**
   * Persists a weight measurement and synchronizes the profile's current weight
   * in one transaction. This keeps the time-series source and the scalar profile
   * consumed by AI/nutrition calculations from drifting apart.
   */
  createWeightLog(data: {
    userId: string;
    weightKg: number;
    note?: string;
    loggedAt?: Date;
  }): Promise<WeightLog> {
    return prisma.$transaction(async (tx) => {
      const log = await tx.weightLog.create({ data });
      await tx.userProfile.updateMany({
        where: { userId: data.userId },
        data: { currentWeightKg: data.weightKg },
      });
      return log;
    });
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

  deleteMealLogForUser(id: string, userId: string): Promise<{ count: number }> {
    return prisma.mealLog.deleteMany({ where: { id, userId } });
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
