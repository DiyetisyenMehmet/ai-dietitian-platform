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
      orderBy: { loggedAt: "desc" },
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
