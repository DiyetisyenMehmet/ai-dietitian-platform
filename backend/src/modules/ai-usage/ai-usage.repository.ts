import type { AiUsageEvent, AiUsageFeature } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { RecordUsageInput } from "./types";

/**
 * Data-access layer for AI usage events. Append-only: rows are created per
 * successful AI call and counted within rolling windows for quota enforcement.
 * All reads are owner-scoped by `userId`.
 */
export const aiUsageRepository = {
  /** Persists a single usage event. */
  record(data: RecordUsageInput): Promise<AiUsageEvent> {
    return prisma.aiUsageEvent.create({
      data: {
        userId: data.userId,
        feature: data.feature,
        provider: data.provider,
        model: data.model,
        estimatedTokens: data.estimatedTokens ?? null,
      },
    });
  },

  /**
   * Counts a user's usage events for a feature at/after a given instant. Used
   * to evaluate the current day and month windows.
   *
   * @param userId - Owner id.
   * @param feature - Feature to count.
   * @param since - Inclusive lower bound (window start).
   */
  countSince(userId: string, feature: AiUsageFeature, since: Date): Promise<number> {
    return prisma.aiUsageEvent.count({
      where: { userId, feature, createdAt: { gte: since } },
    });
  },
};
