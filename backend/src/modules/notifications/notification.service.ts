import { randomUUID } from "node:crypto";

import type {
  Notification,
  NotificationPreference,
  NotificationType,
  Prisma,
} from "@prisma/client";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import {
  getNotificationProvider,
  type NotificationDeliveryResult,
} from "./notification.provider";
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

const MAX_DELIVERY_ATTEMPTS = 6;
const CLAIM_LEASE_MS = 3 * 60 * 1000;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 3 * 60 * 60_000, 12 * 60 * 60_000] as const;

type PreferenceLike = NotificationPreference | typeof DEFAULT_PREFERENCES;

interface DeliveryStateRow {
  attempts: number;
  nextAttemptAt: Date | null;
  failedAt: Date | null;
  lastError: string | null;
  deliveredDeviceKeys: unknown;
}

interface ClaimedNotification {
  notification: Notification;
  claimId: string;
  attempts: number;
  deliveredDeviceKeys: string[];
}

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

function safeDeviceKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length <= 64);
}

function mergeDeviceKeys(previous: string[], next: string[]): string[] {
  return [...new Set([...previous, ...next])].slice(0, 32);
}

function boundedErrorCode(value?: string): string | null {
  const clean = value?.trim();
  return clean ? clean.slice(0, 120) : null;
}

function retryAt(attempts: number, now: Date): Date {
  const index = Math.min(Math.max(attempts - 1, 0), RETRY_DELAYS_MS.length - 1);
  return new Date(now.getTime() + RETRY_DELAYS_MS[index]);
}

async function claimNotification(notificationId: string, now: Date): Promise<ClaimedNotification | null> {
  const claimId = randomUUID();
  const claimedUntil = new Date(now.getTime() + CLAIM_LEASE_MS);

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Notification[]>`
      SELECT n.*
      FROM "notifications" n
      LEFT JOIN "notification_delivery_state" s
        ON s."notificationId" = n."id"
      WHERE n."id" = ${notificationId}
        AND n."deliveredAt" IS NULL
        AND n."scheduledFor" <= ${now}
        AND s."failedAt" IS NULL
        AND (s."nextAttemptAt" IS NULL OR s."nextAttemptAt" <= ${now})
        AND (s."claimedUntil" IS NULL OR s."claimedUntil" < ${now})
      FOR UPDATE OF n SKIP LOCKED
    `;
    const notification = locked[0];
    if (!notification) return null;

    await tx.$executeRaw`
      INSERT INTO "notification_delivery_state"
        ("notificationId", "claimId", "claimedUntil", "updatedAt")
      VALUES
        (${notificationId}, ${claimId}, ${claimedUntil}, CURRENT_TIMESTAMP)
      ON CONFLICT ("notificationId") DO UPDATE SET
        "claimId" = EXCLUDED."claimId",
        "claimedUntil" = EXCLUDED."claimedUntil",
        "updatedAt" = CURRENT_TIMESTAMP
    `;

    const stateRows = await tx.$queryRaw<DeliveryStateRow[]>`
      SELECT "attempts", "nextAttemptAt", "failedAt", "lastError", "deliveredDeviceKeys"
      FROM "notification_delivery_state"
      WHERE "notificationId" = ${notificationId}
      LIMIT 1
    `;
    const state = stateRows[0];
    return {
      notification,
      claimId,
      attempts: state?.attempts ?? 0,
      deliveredDeviceKeys: safeDeviceKeys(state?.deliveredDeviceKeys),
    };
  });
}

async function finalizePreferenceSkip(claim: ClaimedNotification, now: Date): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const released = await tx.$executeRaw`
      UPDATE "notification_delivery_state"
      SET "claimId" = NULL,
          "claimedUntil" = NULL,
          "nextAttemptAt" = NULL,
          "lastError" = NULL,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "notificationId" = ${claim.notification.id}
        AND "claimId" = ${claim.claimId}
    `;
    if (released !== 1) return false;
    const updated = await tx.notification.updateMany({
      where: { id: claim.notification.id, deliveredAt: null },
      data: { deliveredAt: now },
    });
    return updated.count === 1;
  });
}

async function finalizeDelivery(
  claim: ClaimedNotification,
  result: NotificationDeliveryResult,
  now: Date,
): Promise<boolean> {
  const attempts = claim.attempts + 1;
  const deliveredDeviceKeys = mergeDeviceKeys(
    claim.deliveredDeviceKeys,
    result.deliveredDeviceKeys,
  );
  const deliveredJson = JSON.stringify(deliveredDeviceKeys);
  const errorCode = boundedErrorCode(result.code);

  if (result.disposition === "delivered") {
    return prisma.$transaction(async (tx) => {
      const released = await tx.$executeRaw`
        UPDATE "notification_delivery_state"
        SET "attempts" = ${attempts},
            "nextAttemptAt" = NULL,
            "failedAt" = NULL,
            "lastError" = NULL,
            "deliveredDeviceKeys" = ${deliveredJson}::jsonb,
            "claimId" = NULL,
            "claimedUntil" = NULL,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "notificationId" = ${claim.notification.id}
          AND "claimId" = ${claim.claimId}
      `;
      if (released !== 1) return false;
      const updated = await tx.notification.updateMany({
        where: { id: claim.notification.id, deliveredAt: null },
        data: { deliveredAt: now },
      });
      return updated.count === 1;
    });
  }

  const retryable = result.disposition === "retry" || result.disposition === "no_devices";
  const terminal = !retryable || attempts >= MAX_DELIVERY_ATTEMPTS;
  const nextAttemptAt = terminal ? null : retryAt(attempts, now);
  const failedAt = terminal ? now : null;

  const updated = await prisma.$executeRaw`
    UPDATE "notification_delivery_state"
    SET "attempts" = ${attempts},
        "nextAttemptAt" = ${nextAttemptAt},
        "failedAt" = ${failedAt},
        "lastError" = ${errorCode},
        "deliveredDeviceKeys" = ${deliveredJson}::jsonb,
        "claimId" = NULL,
        "claimedUntil" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "notificationId" = ${claim.notification.id}
      AND "claimId" = ${claim.claimId}
  `;
  return updated === 1;
}

export function nextWeeklySummaryAt(
  preferences: Pick<
    NotificationPreference,
    "weeklySummaryDay" | "weeklySummaryTime" | "timezoneOffsetMinutes"
  >,
  from: Date = new Date(),
): Date {
  const [hour, minute] = preferences.weeklySummaryTime.split(":").map(Number);
  const offsetMs = preferences.timezoneOffsetMinutes * 60_000;
  const localNow = new Date(from.getTime() - offsetMs);
  const localCandidate = new Date(localNow);
  localCandidate.setUTCHours(hour, minute, 0, 0);

  const daysAhead = (preferences.weeklySummaryDay - localNow.getUTCDay() + 7) % 7;
  localCandidate.setUTCDate(localNow.getUTCDate() + daysAhead);
  if (localCandidate.getTime() <= localNow.getTime()) {
    localCandidate.setUTCDate(localCandidate.getUTCDate() + 7);
  }
  return new Date(localCandidate.getTime() + offsetMs);
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
   * Dispatches due notifications with a database lease so concurrent Cloud Run
   * instances cannot send the same row at the same time. Retryable failures use
   * bounded exponential-style backoff; terminal/config-disabled states stop.
   */
  async dispatchDue(now: Date = new Date()): Promise<number> {
    const candidates = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT n."id"
      FROM "notifications" n
      LEFT JOIN "notification_delivery_state" s
        ON s."notificationId" = n."id"
      WHERE n."deliveredAt" IS NULL
        AND n."scheduledFor" <= ${now}
        AND s."failedAt" IS NULL
        AND (s."nextAttemptAt" IS NULL OR s."nextAttemptAt" <= ${now})
        AND (s."claimedUntil" IS NULL OR s."claimedUntil" < ${now})
      ORDER BY n."scheduledFor" ASC
      LIMIT 500
    `;

    const provider = getNotificationProvider();
    const preferenceCache = new Map<string, PreferenceLike>();
    let delivered = 0;

    for (const candidate of candidates) {
      const claim = await claimNotification(candidate.id, now);
      if (!claim) continue;

      try {
        let preferences = preferenceCache.get(claim.notification.userId);
        if (!preferences) {
          preferences = await this.getPreferences(claim.notification.userId);
          preferenceCache.set(claim.notification.userId, preferences);
        }
        if (!remotePushAllowed(claim.notification.type, preferences)) {
          await finalizePreferenceSkip(claim, now);
          continue;
        }

        let result: NotificationDeliveryResult;
        try {
          result = await provider.send(
            claim.notification,
            new Set(claim.deliveredDeviceKeys),
          );
        } catch (error) {
          logger.warn(
            { err: error, notificationId: claim.notification.id },
            "Notification provider threw unexpectedly",
          );
          result = {
            disposition: "retry",
            code: "PROVIDER_EXCEPTION",
            deliveredDeviceKeys: [],
          };
        }

        const finalized = await finalizeDelivery(claim, result, now);
        if (finalized && result.disposition === "delivered") delivered += 1;
      } catch (error) {
        logger.warn(
          { err: error, notificationId: claim.notification.id },
          "Notification delivery failed",
        );
        await finalizeDelivery(
          claim,
          {
            disposition: "retry",
            code: "DISPATCH_EXCEPTION",
            deliveredDeviceKeys: [],
          },
          now,
        ).catch(() => undefined);
      }
    }
    return delivered;
  },
};
