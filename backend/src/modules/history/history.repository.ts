import type {
  HistoryInsight,
  HistoryInsightScope,
  HistoryInsightSource,
  Prisma,
} from "@prisma/client";

import { prisma } from "../../lib/prisma";

export const historyRepository = {
  getCurrentWaterGoal(userId: string): Promise<{ dailyWaterGoalMl: number } | null> {
    return prisma.userProfile.findUnique({
      where: { userId },
      select: { dailyWaterGoalMl: true },
    });
  },

  findInsight(
    userId: string,
    scope: HistoryInsightScope,
    periodKey: string,
    timezone: string,
  ): Promise<HistoryInsight | null> {
    return prisma.historyInsight.findUnique({
      where: {
        userId_scope_periodKey_timezone: {
          userId,
          scope,
          periodKey,
          timezone,
        },
      },
    });
  },

  upsertInsight(input: {
    userId: string;
    scope: HistoryInsightScope;
    periodKey: string;
    timezone: string;
    contextHash: string;
    content: Prisma.InputJsonValue;
    source: HistoryInsightSource;
    provider: string | null;
    model: string | null;
    generatedAt: Date;
  }): Promise<HistoryInsight> {
    const identity = {
      userId_scope_periodKey_timezone: {
        userId: input.userId,
        scope: input.scope,
        periodKey: input.periodKey,
        timezone: input.timezone,
      },
    };
    const derived = {
      contextHash: input.contextHash,
      content: input.content,
      source: input.source,
      provider: input.provider,
      model: input.model,
      generatedAt: input.generatedAt,
    };

    return prisma.historyInsight.upsert({
      where: identity,
      create: {
        userId: input.userId,
        scope: input.scope,
        periodKey: input.periodKey,
        timezone: input.timezone,
        ...derived,
      },
      update: derived,
    });
  },
};
