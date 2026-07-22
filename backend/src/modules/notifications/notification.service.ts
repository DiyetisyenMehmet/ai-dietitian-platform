import type { Notification, NotificationType, Prisma } from "@prisma/client";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { getNotificationProvider } from "./notification.provider";

/**
 * Notification scheduling service (Sprint 19, Section 9).
 *
 * Persists notifications to be delivered at a future time and exposes them to
 * clients. Actual delivery is delegated to a pluggable NotificationProvider
 * (a logging stub today). This is the single seam a future Firebase/APNs
 * integration plugs into — no other module needs to change.
 */
export const notificationService = {
  /** Schedules a notification for future delivery. */
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

  /**
   * Returns the user's upcoming (not-yet-delivered) notifications, soonest
   * first. Past-due undelivered notifications are included so a client can
   * flush them.
   */
  getScheduledNotifications(userId: string): Promise<Notification[]> {
    return prisma.notification.findMany({
      where: { userId, deliveredAt: null },
      orderBy: { scheduledFor: "asc" },
    });
  },

  /** Marks a notification delivered (idempotent). */
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
   * Dispatches all due, undelivered notifications through the active provider and
   * marks the successfully sent ones delivered. Invoked by the scheduler.
   */
  async dispatchDue(now: Date = new Date()): Promise<number> {
    const due = await prisma.notification.findMany({
      where: { deliveredAt: null, scheduledFor: { lte: now } },
      orderBy: { scheduledFor: "asc" },
      take: 500,
    });
    const provider = getNotificationProvider();
    let delivered = 0;
    for (const notification of due) {
      try {
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
