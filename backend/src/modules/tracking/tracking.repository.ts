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

  async getWeightCheckInContext(userId: string): Promise<{
    onboardingCompleted: boolean;
    lastWeightLog: Pick<WeightLog, "loggedAt"> | null;
  } | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        onboardingCompleted: true,
        weightLogs: {
          orderBy: { loggedAt: "desc" },
          take: 1,
          select: { loggedAt: true },
        },
      },
    });
    if (!user) return null;
    return {
      onboardingCompleted: user.onboardingCompleted,
      lastWeightLog: user.weightLogs[0] ?? null,
    };
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

  async updateMealLogForUser(
    id: string,
    userId: string,
    data: {
      name?: string;
      calories?: number;
      proteinG?: number;
      carbsG?: number;
      fatG?: number;
      sodiumMg?: number;
      sugarG?: number;
    },
  ): Promise<MealLog | null> {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.mealLog.updateMany({ where: { id, userId }, data });
      if (updated.count === 0) return null;
      return tx.mealLog.findFirst({ where: { id, userId } });
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

  deleteWaterLogForUser(id: string, userId: string): Promise<{ count: number }> {
    return prisma.waterLog.deleteMany({ where: { id, userId } });
  },

  getWaterProfile(userId: string): Promise<{
    dailyWaterGoalMl: number;
    currentWeightKg: number;
    activityLevel: string;
  } | null> {
    return prisma.userProfile.findUnique({
      where: { userId },
      select: {
        dailyWaterGoalMl: true,
        currentWeightKg: true,
        activityLevel: true,
      },
    });
  },

  async updateWaterGoalForUser(
    userId: string,
    dailyWaterGoalMl: number,
  ): Promise<{ dailyWaterGoalMl: number } | null> {
    const updated = await prisma.userProfile.updateMany({
      where: { userId },
      data: { dailyWaterGoalMl },
    });
    if (updated.count === 0) return null;
    return prisma.userProfile.findUnique({
      where: { userId },
      select: { dailyWaterGoalMl: true },
    });
  },
};
