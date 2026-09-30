import type { Activity, Goal, MealLog, WaterLog, WeightLog } from "@prisma/client";

import { prisma } from "../../lib/prisma";

export const goalsRepository = {
  listGoals(userId: string): Promise<Goal[]> {
    return prisma.goal.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  },

  countGoals(userId: string): Promise<number> {
    return prisma.goal.count({ where: { userId } });
  },

  findGoal(userId: string, id: string): Promise<Goal | null> {
    return prisma.goal.findFirst({ where: { id, userId } });
  },

  createGoal(data: {
    userId: string;
    type: string;
    title: string;
    startValue: number;
    targetValue: number;
    startDate: Date;
    targetDate: Date;
    reminderTime?: string;
    notes?: string;
  }): Promise<Goal> {
    return prisma.goal.create({ data });
  },

  async updateGoal(
    userId: string,
    id: string,
    data: {
      type: string;
      title: string;
      startValue?: number;
      targetValue: number;
      startDate: Date;
      targetDate: Date;
      reminderTime?: string | null;
      notes?: string | null;
    },
  ): Promise<Goal | null> {
    const updated = await prisma.goal.updateMany({ where: { id, userId }, data });
    if (updated.count === 0) return null;
    return prisma.goal.findFirst({ where: { id, userId } });
  },

  deleteGoal(userId: string, id: string): Promise<{ count: number }> {
    return prisma.goal.deleteMany({ where: { id, userId } });
  },

  async getCurrentWeightKg(userId: string): Promise<number | null> {
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      select: { currentWeightKg: true },
    });
    return profile?.currentWeightKg ?? null;
  },

  listRecentWeight(userId: string, since: Date): Promise<WeightLog[]> {
    return prisma.weightLog.findMany({
      where: { userId, loggedAt: { gte: since } },
      orderBy: [{ loggedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
  },

  listRecentMeals(userId: string, since: Date): Promise<MealLog[]> {
    return prisma.mealLog.findMany({
      where: { userId, loggedAt: { gte: since } },
      orderBy: [{ loggedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
  },

  listRecentWater(userId: string, since: Date): Promise<WaterLog[]> {
    return prisma.waterLog.findMany({
      where: { userId, loggedAt: { gte: since } },
      orderBy: [{ loggedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
  },

  listRecentActivities(userId: string, since: Date): Promise<Activity[]> {
    return prisma.activity.findMany({
      where: { userId, loggedAt: { gte: since } },
      orderBy: [{ loggedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
  },
};
