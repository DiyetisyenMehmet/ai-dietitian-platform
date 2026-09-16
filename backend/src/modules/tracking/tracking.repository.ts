import type { MealLog, WaterLog, WeightLog } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import {
  createWeightLogAndSyncCurrent,
  lockUserWeightMutation,
  syncCurrentWeightFromHistory,
  WEIGHT_BASELINE_NOTE,
  weightLogOrderBy,
} from "./weight-persistence";

const MAX_WEIGHT_HISTORY_LOGS = 500;

/**
 * Data access for tracking logs. All reads/writes/deletes are owner-scoped by
 * `userId` so record ids from another account can never be used as an IDOR.
 */
export const trackingRepository = {
  /**
   * Persists a weight measurement and synchronizes the profile's current weight
   * from the chronologically latest WeightLog in the same transaction.
   */
  createWeightLog(data: {
    userId: string;
    weightKg: number;
    note?: string;
    loggedAt?: Date;
  }): Promise<WeightLog> {
    return prisma.$transaction(async (tx) => {
      await lockUserWeightMutation(tx, data.userId);
      return createWeightLogAndSyncCurrent(tx, data);
    });
  },

  async listWeightLogs(userId: string, since?: Date): Promise<WeightLog[]> {
    const logs = await prisma.weightLog.findMany({
      where: { userId, ...(since ? { loggedAt: { gte: since } } : {}) },
      orderBy: weightLogOrderBy(),
      take: MAX_WEIGHT_HISTORY_LOGS,
    });

    // The client uses the onboarding baseline for starting-weight semantics. If
    // a very long history reaches the safety cap, retain that one canonical row
    // without allowing an unbounded response. `since` requests intentionally
    // remain strict to their requested time window.
    if (
      since ||
      logs.length < MAX_WEIGHT_HISTORY_LOGS ||
      logs.some((log) => log.note === WEIGHT_BASELINE_NOTE)
    ) {
      return logs;
    }

    const baseline = await prisma.weightLog.findFirst({
      where: { userId, note: WEIGHT_BASELINE_NOTE },
      orderBy: [{ loggedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    if (!baseline || logs.some((log) => log.id === baseline.id)) return logs;
    return [...logs.slice(0, MAX_WEIGHT_HISTORY_LOGS - 1), baseline];
  },

  getWeightLogForUser(id: string, userId: string): Promise<WeightLog | null> {
    return prisma.weightLog.findFirst({ where: { id, userId } });
  },

  async updateWeightLogForUser(
    id: string,
    userId: string,
    data: { weightKg?: number; note?: string; loggedAt?: Date },
  ) {
    return prisma.$transaction(async (tx) => {
      await lockUserWeightMutation(tx, userId);
      const existing = await tx.weightLog.findFirst({ where: { id, userId } });
      if (!existing) return { status: "NOT_FOUND" as const };
      if (existing.note === WEIGHT_BASELINE_NOTE) {
        return { status: "BASELINE_IMMUTABLE" as const };
      }

      const log = await tx.weightLog.update({ where: { id }, data });
      await syncCurrentWeightFromHistory(tx, userId);
      return { status: "UPDATED" as const, log };
    });
  },

  async deleteWeightLogForUser(id: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      await lockUserWeightMutation(tx, userId);
      const existing = await tx.weightLog.findFirst({ where: { id, userId } });
      if (!existing) return { status: "NOT_FOUND" as const };
      if (existing.note === WEIGHT_BASELINE_NOTE) {
        return { status: "BASELINE_IMMUTABLE" as const };
      }

      const remaining = await tx.weightLog.findFirst({
        where: { userId, id: { not: id } },
        orderBy: weightLogOrderBy(),
        select: { id: true },
      });
      if (!remaining) return { status: "LAST_ENTRY" as const };

      await tx.weightLog.delete({ where: { id } });
      await syncCurrentWeightFromHistory(tx, userId);
      return { status: "DELETED" as const };
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
          orderBy: weightLogOrderBy(),
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
