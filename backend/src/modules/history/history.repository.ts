import { prisma } from "../../lib/prisma";

export const historyRepository = {
  getCurrentWaterGoal(userId: string): Promise<{ dailyWaterGoalMl: number } | null> {
    return prisma.userProfile.findUnique({
      where: { userId },
      select: { dailyWaterGoalMl: true },
    });
  },
};
