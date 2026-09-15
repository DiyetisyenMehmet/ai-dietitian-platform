import type {
  Notification,
  NotificationPreference,
  NotificationType,
  Prisma,
} from "@prisma/client";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { getNotificationProvider } from "./notification.provider";
import type { UpdateNotificationPreferencesInput } from "./notification.schemas";

const DEFAULT_PREFERENCES = {
  mealReminders: false,
  waterReminders: false,
  activityReminders: false,
  sleepReminders: false,
  weeklySummary: false,
  coachTips: false,
  bloodTestReminders: false,
  productUpdates: false,
  waterReminderTime: "10:00",
  activityReminderTime: "18:00",
  sleepReminderTime: "22:30",
  weeklySummaryDay: 0,
  weeklySummaryTime: "10:00",
  timezoneOffsetMinutes: 0,
} as const;

type PreferenceLike = NotificationPreference | typeof DEFAULT_PREFERENCES;

function remotePushAllowed(type: NotificationType, preferences: PreferenceLike): boolean {
  switch (type) {
    case "WEEKLY_REVIEW":
    case "MONTHLY_REVIEW":
      return preferences.weeklySummary;
    case "PROACTIVE_MESSAGE":
    case "RISK_ALERT":
    case "GOAL_REMINDER":
      return preferences.coachTips;
    case "WATER_REMINDER":
      return preferences.waterReminders;
    default:
      return false;
  }
}

export const notificationService = {
  async getPreferences(
    userId: string,
  ): Promise<NotificationPreference | typeof DEFAULT_PREFERENCES> {
    return (
      (await prisma.notificationPreference.findUnique({ where: { userId } })) ??
      DEFAULT_PREFERENCES
    );
  },

  async updatePreferences(
    userId: string,
    input: UpdateNotificationPreferencesInput,
  ): Promise<NotificationPreference> {
    return prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...DEFAULT_PREFERENCES, ...input },
      update: input,
    });
  },

  scheduleNotification(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    scheduledFor: Date,
    metadata?: Record<string, unknown>,
  ): Promise<Notification> {
    return prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        scheduledFor,
        ...(metadata ? { metadata: metadata as Prisma.InputJsonValue } : {}),
      },
    });
  },

  getScheduledNotifications(userId: string): Promise<Notification[]> {
    return prisma.notification.findMany({
      where: { userId, deliveredAt: null },
      orderBy: { scheduledFor: "asc" },
    });
  },

  async markDelivered(notificationId: string): Promise<Notification | null> {
    const existing = await prisma.notification.findUnique({ where: { id: notificationId } });
    if (!existing) return null;
    if (existing.deliveredAt) return existing;
    return prisma.notification.update({
      where: { id: notificationId },
      data: { deliveredAt: new Date() },
    });
  },

  /**
   * Dispatches due notifications only when the matching account preference is
   * enabled. A successful provider send is the only path that marks a push as
   * delivered; missing devices/provider failures remain retryable.
   */
  async dispatchDue(now: Date = new Date()): Promise<number> {
    const due = await prisma.notification.findMany({
      where: { deliveredAt: null, scheduledFor: { lte: now } },
      orderBy: { scheduledFor: "asc" },
      take: 500,
    });
    const provider = getNotificationProvider();
    const preferenceCache = new Map<string, PreferenceLike>();
    let delivered = 0;

    for (const notification of due) {
      try {
        let preferences = preferenceCache.get(notification.userId);
        if (!preferences) {
          preferences = await this.getPreferences(notification.userId);
          preferenceCache.set(notification.userId, preferences);
        }
        if (!remotePushAllowed(notification.type, preferences)) {
          await this.markDelivered(notification.id);
          continue;
        }

        const ok = await provider.send(notification);
        if (ok) {
          await this.markDelivered(notification.id);
          delivered += 1;
        }
      } catch (error) {
        logger.warn(
          { err: error, notificationId: notification.id },
          "Notification delivery failed",
        );
      }
    }
    return delivered;
  },
};
