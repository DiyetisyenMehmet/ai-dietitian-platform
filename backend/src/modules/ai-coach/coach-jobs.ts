import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { legalService } from "../legal/legal.service";
import { notificationService } from "../notifications/notification.service";
import { aiMemoryService } from "./ai-memory.service";
import { monthlyReviewService } from "./monthly-review.service";
import { proactiveAiService } from "./proactive-ai.service";
import { weeklyReviewService } from "./weekly-review.service";
import { isUserPremium } from "./premium";

/**
 * Batch jobs orchestrating the AI Health Coach across all users. These are the
 * unit of work the scheduler invokes; each iterates users defensively so one
 * user's failure never aborts the batch. Kept separate from the scheduler
 * timing logic so they can be triggered/tested independently.
 *
 * Privacy invariant: scheduled health processing is fail-closed. A user with a
 * missing/stale mandatory consent is skipped before memory, review or provider
 * work starts. This also prevents background jobs from spending AI budget for
 * users who have withdrawn consent.
 */

/** Streams active users in pages to avoid loading the whole table at once. */
async function forEachUser(
  handler: (user: { id: string }) => Promise<void>,
): Promise<{ processed: number; failed: number; skippedNoConsent: number }> {
  const pageSize = 200;
  let cursor: string | undefined;
  let processed = 0;
  let failed = 0;
  let skippedNoConsent = 0;

  for (;;) {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true },
      orderBy: { id: "asc" },
      take: pageSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (users.length === 0) break;

    for (const user of users) {
      try {
        const missingConsent = await legalService.getMissingMandatoryConsents(user.id);
        if (missingConsent.length > 0) {
          skippedNoConsent += 1;
          continue;
        }

        await handler(user);
        processed += 1;
      } catch (error) {
        // A consent-status lookup failure also lands here and therefore fails
        // closed: the health job is not allowed to proceed for that user.
        failed += 1;
        logger.warn({ err: error, userId: user.id }, "Coach job failed for user");
      }
    }

    if (users.length < pageSize) break;
    cursor = users[users.length - 1].id;
  }

  return { processed, failed, skippedNoConsent };
}

export const coachJobs = {
  /** Daily: refresh derived memory and generate proactive nudges for consented users. */
  async runDailyProactive(): Promise<void> {
    logger.info("Coach job: daily proactive generation started");
    const result = await forEachUser(async (user) => {
      await aiMemoryService.refreshDerivedMemory(user.id, 90);
      await proactiveAiService.generateForUser(user.id);
    });
    logger.info(result, "Coach job: daily proactive generation finished");
  },

  /** Weekly (Sunday): generate the weekly review for consented users. */
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

  /** Monthly (1st): generate the monthly review for consented, currently-paid users only. */
  async runMonthlyReviews(): Promise<void> {
    logger.info("Coach job: monthly reviews started");
    const result = await forEachUser(async (user) => {
      // Resolve effective paid-through state instead of trusting a possibly
      // stale denormalized User.subscriptionTier value.
      if (!(await isUserPremium(user.id))) return;
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
