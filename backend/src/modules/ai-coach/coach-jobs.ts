import type { SubscriptionTier } from "@prisma/client";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { notificationService } from "../notifications/notification.service";
import { aiMemoryService } from "./ai-memory.service";
import { monthlyReviewService } from "./monthly-review.service";
import { proactiveAiService } from "./proactive-ai.service";
import { weeklyReviewService } from "./weekly-review.service";
import { isPremiumTier } from "./premium";

/**
 * Batch jobs orchestrating the AI Health Coach across all users. These are the
 * unit of work the scheduler invokes; each iterates users defensively so one
 * user's failure never aborts the batch. Kept separate from the scheduler
 * timing logic so they can be triggered/tested independently.
 */

/** Streams active users in pages to avoid loading the whole table at once. */
async function forEachUser(
  handler: (user: { id: string; subscriptionTier: SubscriptionTier }) => Promise<void>,
): Promise<{ processed: number; failed: number }> {
  const pageSize = 200;
  let cursor: string | undefined;
  let processed = 0;
  let failed = 0;

  for (;;) {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, subscriptionTier: true },
      orderBy: { id: "asc" },
      take: pageSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (users.length === 0) break;

    for (const user of users) {
      try {
        await handler(user);
        processed += 1;
      } catch (error) {
        failed += 1;
        logger.warn({ err: error, userId: user.id }, "Coach job failed for user");
      }
    }

    if (users.length < pageSize) break;
    cursor = users[users.length - 1].id;
  }

  return { processed, failed };
}

export const coachJobs = {
  /** Daily: refresh derived memory and generate proactive nudges for everyone. */
  async runDailyProactive(): Promise<void> {
    logger.info("Coach job: daily proactive generation started");
    const result = await forEachUser(async (user) => {
      await aiMemoryService.refreshDerivedMemory(user.id, 90);
      await proactiveAiService.generateForUser(user.id);
    });
    logger.info(result, "Coach job: daily proactive generation finished");
  },

  /** Weekly (Sunday): generate the weekly review for everyone. */
  async runWeeklyReviews(): Promise<void> {
    logger.info("Coach job: weekly reviews started");
    const result = await forEachUser(async (user) => {
      const review = await weeklyReviewService.generateWeeklyReview(user.id);
      await notificationService.scheduleNotification(
        user.id,
        "WEEKLY_REVIEW",
        "Haftalık değerlendirmen hazır",
        `Bu haftaki puanın ${review.score}/100. Detayları görmek için uygulamayı aç.`,
        new Date(),
        { weekNumber: review.weekNumber, year: review.year },
      );
    });
    logger.info(result, "Coach job: weekly reviews finished");
  },

  /** Monthly (1st): generate the monthly review for premium users only. */
  async runMonthlyReviews(): Promise<void> {
    logger.info("Coach job: monthly reviews started");
    const result = await forEachUser(async (user) => {
      // Monthly review is a premium-only experience.
      if (!isPremiumTier(user.subscriptionTier)) return;
      const now = new Date();
      // Summarize the month that just ended.
      const prevMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const month = prevMonthDate.getUTCMonth() + 1;
      const year = prevMonthDate.getUTCFullYear();
      await monthlyReviewService.generateMonthlyReview(user.id, month, year);
      await notificationService.scheduleNotification(
        user.id,
        "MONTHLY_REVIEW",
        "Aylık değerlendirmen hazır",
        "Geçen ayın kapsamlı koçluk değerlendirmesi hazır. İncelemek için uygulamayı aç.",
        new Date(),
        { month, year },
      );
    });
    logger.info(result, "Coach job: monthly reviews finished");
  },

  /** Every tick: deliver any due, undelivered notifications. */
  async dispatchNotifications(): Promise<void> {
    const delivered = await notificationService.dispatchDue();
    if (delivered > 0) {
      logger.info({ delivered }, "Coach job: notifications dispatched");
    }
  },
};
