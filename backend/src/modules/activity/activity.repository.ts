import type { Activity, ActivityType } from "@prisma/client";

import { prisma } from "../../lib/prisma";

/**
 * Data access for the Sprint 22 Activity log. Mirrors the thin Sprint 19
 * tracking repository: this layer only reads/writes rows — the service owns
 * business logic. All queries are owner-scoped by `userId`.
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
};
