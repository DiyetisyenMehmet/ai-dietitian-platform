import type { Notification } from "@prisma/client";

import { logger } from "../../lib/logger";

/**
 * Push notification provider abstraction (Sprint 19, Section 9).
 *
 * This sprint prepares the scheduling layer only — no Firebase/APNs integration.
 * A concrete provider implements {@link NotificationProvider.send}; the app
 * depends only on this interface so the real transport can be swapped in later
 * without touching the scheduling/service code.
 */
export interface NotificationProvider {
  /** Human-readable provider name for logging/observability. */
  readonly name: string;
  /** Delivers a single notification. Resolves true on success. */
  send(notification: Notification): Promise<boolean>;
}

/**
 * Default stub provider: logs the notification instead of sending it. Swap for a
 * Firebase/APNs-backed provider in a future sprint.
 */
export class LoggingNotificationProvider implements NotificationProvider {
  public readonly name = "logging";

  async send(notification: Notification): Promise<boolean> {
    logger.info(
      {
        notificationId: notification.id,
        userId: notification.userId,
        type: notification.type,
        title: notification.title,
        scheduledFor: notification.scheduledFor,
      },
      "[LoggingNotificationProvider] Would deliver push notification",
    );
    return true;
  }
}

/** Process-wide default provider instance. */
let activeProvider: NotificationProvider = new LoggingNotificationProvider();

/** Returns the active notification provider. */
export function getNotificationProvider(): NotificationProvider {
  return activeProvider;
}

/** DI seam: overrides the active provider (used by tests / future Firebase wiring). */
export function setNotificationProvider(provider: NotificationProvider): void {
  activeProvider = provider;
}
