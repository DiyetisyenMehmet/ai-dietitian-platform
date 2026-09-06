import type { Activity, ActivityType } from "@prisma/client";

import { prisma } from "../../lib/prisma";

/**
 * Data access for physical-activity logs. All reads/writes are owner-scoped by
 * `userId`; profile weight is read server-side when an activity needs a
 * best-effort energy-expenditure estimate.
 */
export const activityRepository = {
  createActivity(data: {
    userId: string;
    type: ActivityType;
    name?: string;
    durationMinutes: number;
    caloriesBurned?: number;
    note?: string;
    loggedAt?: Date;
  }): Promise<Activity> {
    return prisma.activity.create({ data });
  },

  listActivities(userId: string, since?: Date): Promise<Activity[]> {
    return prisma.activity.findMany({
      where: { userId, ...(since ? { loggedAt: { gte: since } } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  },

  async listLatestActivityIds(userId: string, limit: number): Promise<string[]> {
    const activities = await prisma.activity.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: { id: true },
    });
    return activities.map((activity) => activity.id);
  },

  /**
   * Removes one activity owned by `userId`. `deleteMany` keeps the ownership
   * check inside the mutation itself so another user's activity can never be
   * deleted even if its id is guessed or leaked.
   */
  async deleteActivity(userId: string, activityId: string): Promise<void> {
    await prisma.activity.deleteMany({
      where: { id: activityId, userId },
    });
  },

  async findCurrentWeightKg(userId: string): Promise<number | null> {
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      select: { currentWeightKg: true },
    });
    return profile?.currentWeightKg ?? null;
  },
};
