import type { ProactiveMessage, ProactiveMessageType } from "@prisma/client";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { notificationService } from "../notifications/notification.service";
import { loadCoachData } from "./coach-data";
import { daysAgo, groupBy, sum, turkeyDayKey } from "./metrics";

/** How many consecutive recent days of low water intake trigger a nudge. */
const LOW_WATER_CONSECUTIVE_DAYS = 3;
/** Fraction of the daily water goal below which a day counts as "low". */
const LOW_WATER_RATIO = 0.6;
/** Days without any log that count as inactivity for a proactive nudge. */
const INACTIVITY_NUDGE_DAYS = 2;
/** Goal-behind check horizon (days) for weight progress. */
const GOAL_BEHIND_DAYS = 14;

/** A candidate proactive message before de-duplication/persistence. */
interface ProactiveCandidate {
  type: ProactiveMessageType;
  message: string;
}

/**
 * Proactive AI service (Sprint 19, Section 2).
 *
 * Generates AI-initiated nudges the user did not explicitly ask for, based on
 * gaps and trends in their tracking logs: a missed meal, a missing weekly
 * weigh-in, falling behind the goal, several low-water days, or a stretch of
 * inactivity. Messages are supportive coaching prompts — never diagnosis. The
 * daily job calls {@link generateForUser}; de-duplication prevents spamming the
 * same nudge more than once per day.
 */
export const proactiveAiService = {
  /**
   * Computes the proactive candidates for a user from their recent logs. Pure
   * analysis — no persistence — so it is easy to test and reuse.
   */
  async computeCandidates(userId: string): Promise<ProactiveCandidate[]> {
    const bundle = await loadCoachData(userId, 30);
    const candidates: ProactiveCandidate[] = [];
    const now = new Date();
    const todayKey = turkeyDayKey(now);

    // 1. Missed lunch/meal today (nothing logged so far today).
    const loggedToday = bundle.mealLogs.some((m) => turkeyDayKey(m.loggedAt) === todayKey);
    if (!loggedToday) {
      candidates.push({
        type: "MISSED_MEAL",
        message:
          "Bugün henüz bir öğün kaydetmedin. Ne yediğini kaydetmek, koçunun sana daha " +
          "isabetli öneriler sunmasına yardımcı olur. Bugünkü öğününü eklemek ister misin?",
      });
    }

    // 2. No weight log this week.
    const weightThisWeek = bundle.weightLogs.some((w) => w.loggedAt >= daysAgo(7));
    if (!weightThisWeek) {
      candidates.push({
        type: "MISSED_WEIGHT",
        message:
          "Bu hafta henüz kilonu kaydetmedin. Haftalık bir tartılma, ilerlemeni takip " +
          "etmenin en iyi yollarından biri. Uygun bir zamanda kilonu eklemeyi unutma.",
      });
    }

    // 3. Goal behind: over the last 14 days weight is moving away from target.
    if (bundle.profile && bundle.weightLogs.length >= 2) {
      const recent = bundle.weightLogs.filter((w) => w.loggedAt >= daysAgo(GOAL_BEHIND_DAYS));
      if (recent.length >= 2) {
        const newest = recent[0].weightKg;
        const oldest = recent[recent.length - 1].weightKg;
        const change = newest - oldest;
        const wantsToLose = bundle.profile.targetWeightKg < bundle.profile.currentWeightKg;
        const movingAway = wantsToLose ? change > 0.3 : change < -0.3;
        if (movingAway) {
          candidates.push({
            type: "GOAL_BEHIND",
            message:
              "Son iki haftadır kilon hedefinin biraz gerisinde ilerliyor gibi görünüyor. " +
              "Endişelenme — birlikte küçük ayarlamalarla yeniden yola girebiliriz. " +
              "Rutininde seni zorlayan bir şey var mı?",
          });
        }
      }
    }

    // 4. Low water for 3+ consecutive recent days (relative to the goal).
    const goalMl = bundle.profile?.dailyWaterGoalMl ?? 0;
    if (goalMl > 0 && bundle.waterLogs.length > 0) {
      const byDay = groupBy(bundle.waterLogs, (w) => turkeyDayKey(w.loggedAt));
      let consecutiveLow = 0;
      for (let i = 0; i < LOW_WATER_CONSECUTIVE_DAYS; i += 1) {
        const key = turkeyDayKey(daysAgo(i, now));
        const dayLogs = byDay.get(key) ?? [];
        const total = sum(dayLogs.map((w) => w.amountMl));
        if (total < goalMl * LOW_WATER_RATIO) consecutiveLow += 1;
        else break;
      }
      if (consecutiveLow >= LOW_WATER_CONSECUTIVE_DAYS) {
        candidates.push({
          type: "LOW_WATER",
          message:
            "Son birkaç gündür su hedefinin altında kaldın. Yeterli su içmek enerjini ve " +
            "metabolizmanı destekler. Yanına bir şişe su almayı deneyebilirsin.",
        });
      }
    }

    // 5. Inactivity: no logs of any kind for 2+ days.
    const lastActivity = [...bundle.mealLogs, ...bundle.weightLogs, ...bundle.waterLogs]
      .map((l) => l.loggedAt)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    if (!lastActivity || lastActivity < daysAgo(INACTIVITY_NUDGE_DAYS)) {
      candidates.push({
        type: "INACTIVITY",
        message:
          "Bir süredir seni göremedik! Küçük bir adım bile fark yaratır. Bugün bir öğününü " +
          "veya kilonu kaydederek kaldığın yerden devam etmeye ne dersin?",
      });
    }

    return candidates;
  },

  /**
   * Generates and persists de-duplicated proactive messages for a user, and
   * schedules a companion notification for each. Returns the created rows.
   * Best-effort per user: called by the daily job for every user.
   */
  async generateForUser(userId: string): Promise<ProactiveMessage[]> {
    const candidates = await this.computeCandidates(userId);
    const created: ProactiveMessage[] = [];

    for (const candidate of candidates) {
      // De-dup: skip if an unread message of this type already exists today.
      const existing = await prisma.proactiveMessage.findFirst({
        where: {
          userId,
          type: candidate.type,
          createdAt: { gte: daysAgo(1) },
        },
      });
      if (existing) continue;

      const message = await prisma.proactiveMessage.create({
        data: { userId, type: candidate.type, message: candidate.message },
      });
      created.push(message);

      await notificationService
        .scheduleNotification(
          userId,
          "PROACTIVE_MESSAGE",
          "Sağlık koçundan bir mesaj",
          candidate.message,
          new Date(),
          { proactiveType: candidate.type },
        )
        .catch((error: unknown) => {
          logger.warn({ err: error, userId }, "Proactive notification scheduling failed");
        });
    }

    return created;
  },

  /** Lists the user's proactive messages, newest first. */
  listMessages(userId: string, onlyUnread = false): Promise<ProactiveMessage[]> {
    return prisma.proactiveMessage.findMany({
      where: { userId, ...(onlyUnread ? { isRead: false } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  },

  /** Marks a single proactive message read (owner-scoped). Returns null if not found. */
  async markRead(userId: string, messageId: string): Promise<ProactiveMessage | null> {
    const existing = await prisma.proactiveMessage.findFirst({
      where: { id: messageId, userId },
    });
    if (!existing) return null;
    if (existing.isRead) return existing;
    return prisma.proactiveMessage.update({
      where: { id: existing.id },
      data: { isRead: true },
    });
  },
};
