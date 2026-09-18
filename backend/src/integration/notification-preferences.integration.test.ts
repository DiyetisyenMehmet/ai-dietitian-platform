import assert from "node:assert/strict";
import test from "node:test";

import type { Notification } from "@prisma/client";

import { prisma } from "../lib/prisma";
import {
  buildFcmMessage,
  classifyFcmFailure,
  getNotificationProvider,
  privacySafeRemoteCopy,
  setNotificationProvider,
  type NotificationDeliveryResult,
  type NotificationProvider,
} from "../modules/notifications/notification.provider";
import {
  registerNotificationDeviceSchema,
  updateNotificationPreferencesSchema,
} from "../modules/notifications/notification.schemas";
import {
  nextWeeklySummaryAt,
  notificationService,
} from "../modules/notifications/notification.service";

class FakeNotificationProvider implements NotificationProvider {
  public readonly name = "test-provider";
  public calls = 0;

  constructor(
    private readonly result: NotificationDeliveryResult,
    private readonly delayMs = 0,
  ) {}

  async send(
    _notification: Notification,
    _alreadyDeliveredDeviceKeys?: ReadonlySet<string>,
  ): Promise<NotificationDeliveryResult> {
    this.calls += 1;
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    return this.result;
  }
}

async function createUser(prefix: string) {
  const stamp = `${Date.now()}-${Math.random()}`;
  return prisma.user.create({
    data: {
      email: `${prefix}-${stamp}@example.invalid`,
      passwordHash: "integration-test-only",
    },
  });
}

test("notification preferences are opt-in, validated and isolated by owner", async (t) => {
  const [firstUser, secondUser] = await Promise.all([
    createUser("notification-a"),
    createUser("notification-b"),
  ]);

  t.after(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [firstUser.id, secondUser.id] } } });
  });

  const defaults = await notificationService.getPreferences(firstUser.id);
  assert.equal(defaults.mealReminders, false);
  assert.equal(defaults.waterReminders, false);
  assert.equal(defaults.activityReminders, false);
  assert.equal(defaults.sleepReminders, false);

  assert.equal(
    updateNotificationPreferencesSchema.safeParse({ waterReminderTime: "25:00" }).success,
    false,
  );
  assert.equal(
    updateNotificationPreferencesSchema.safeParse({ weeklySummaryDay: 7 }).success,
    false,
  );
  assert.equal(updateNotificationPreferencesSchema.safeParse({}).success, false);

  const updated = await notificationService.updatePreferences(firstUser.id, {
    waterReminders: true,
    activityReminders: true,
    waterReminderTime: "09:30",
    timezoneOffsetMinutes: -180,
  });
  assert.equal(updated.waterReminders, true);
  assert.equal(updated.activityReminders, true);
  assert.equal(updated.waterReminderTime, "09:30");
  assert.equal(updated.timezoneOffsetMinutes, -180);

  const other = await notificationService.getPreferences(secondUser.id);
  assert.equal(other.waterReminders, false);
  assert.equal(other.activityReminders, false);
});

test("disabled notification preference suppresses provider delivery", async (t) => {
  const user = await createUser("notification-disabled");
  const originalProvider = getNotificationProvider();
  const provider = new FakeNotificationProvider({
    disposition: "delivered",
    deliveredDeviceKeys: ["device-a"],
  });
  setNotificationProvider(provider);

  t.after(async () => {
    setNotificationProvider(originalProvider);
    await prisma.user.delete({ where: { id: user.id } });
  });

  const now = new Date();
  const notification = await notificationService.scheduleNotification(
    user.id,
    "WATER_REMINDER",
    "Su zamanı",
    "Su hatırlatması",
    new Date(now.getTime() - 1_000),
  );

  assert.equal(await notificationService.dispatchDue(now), 0);
  assert.equal(provider.calls, 0);
  const stored = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
  assert.ok(stored.deliveredAt instanceof Date);
});

test("concurrent dispatchers claim a due notification only once", async (t) => {
  const user = await createUser("notification-concurrent");
  await notificationService.updatePreferences(user.id, { waterReminders: true });
  const originalProvider = getNotificationProvider();
  const provider = new FakeNotificationProvider(
    { disposition: "delivered", deliveredDeviceKeys: ["device-a"] },
    75,
  );
  setNotificationProvider(provider);

  t.after(async () => {
    setNotificationProvider(originalProvider);
    await prisma.user.delete({ where: { id: user.id } });
  });

  const now = new Date();
  const notification = await notificationService.scheduleNotification(
    user.id,
    "WATER_REMINDER",
    "Su zamanı",
    "Su hatırlatması",
    new Date(now.getTime() - 1_000),
  );

  const results = await Promise.all([
    notificationService.dispatchDue(now),
    notificationService.dispatchDue(now),
  ]);
  assert.equal(results.reduce((sum, value) => sum + value, 0), 1);
  assert.equal(provider.calls, 1);

  const stored = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
  assert.ok(stored.deliveredAt instanceof Date);
});

test("retryable delivery stops after the bounded maximum", async (t) => {
  const user = await createUser("notification-retry");
  await notificationService.updatePreferences(user.id, { waterReminders: true });
  const originalProvider = getNotificationProvider();
  const provider = new FakeNotificationProvider({
    disposition: "retry",
    code: "UNAVAILABLE",
    deliveredDeviceKeys: [],
  });
  setNotificationProvider(provider);

  t.after(async () => {
    setNotificationProvider(originalProvider);
    await prisma.user.delete({ where: { id: user.id } });
  });

  let now = new Date();
  const notification = await notificationService.scheduleNotification(
    user.id,
    "WATER_REMINDER",
    "Su zamanı",
    "Su hatırlatması",
    new Date(now.getTime() - 1_000),
  );

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    await notificationService.dispatchDue(now);
    const rows = await prisma.$queryRaw<
      Array<{ attempts: number; nextAttemptAt: Date | null; failedAt: Date | null }>
    >`
      SELECT "attempts", "nextAttemptAt", "failedAt"
      FROM "notification_delivery_state"
      WHERE "notificationId" = ${notification.id}
    `;
    const state = rows[0];
    assert.equal(state.attempts, attempt);
    if (attempt < 6) {
      assert.ok(state.nextAttemptAt instanceof Date);
      assert.equal(state.failedAt, null);
      now = new Date(state.nextAttemptAt.getTime() + 1);
    } else {
      assert.ok(state.failedAt instanceof Date);
      assert.equal(state.nextAttemptAt, null);
    }
  }

  assert.equal(provider.calls, 6);
  await notificationService.dispatchDue(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  assert.equal(provider.calls, 6);
});

test("FCM failures distinguish invalid tokens, temporary errors and config errors", () => {
  assert.equal(classifyFcmFailure(404, "UNREGISTERED"), "invalid-token");
  assert.equal(classifyFcmFailure(400, "SENDER_ID_MISMATCH"), "invalid-token");
  assert.equal(classifyFcmFailure(503, "UNAVAILABLE"), "retryable");
  assert.equal(classifyFcmFailure(429, "QUOTA_EXCEEDED"), "retryable");
  assert.equal(classifyFcmFailure(403, "THIRD_PARTY_AUTH_ERROR"), "config");
  assert.equal(classifyFcmFailure(401), "config");
  assert.equal(classifyFcmFailure(400, "INVALID_ARGUMENT"), "permanent");
});

test("weekly summary time converts the browser timezone offset to UTC", () => {
  const scheduled = nextWeeklySummaryAt(
    {
      weeklySummaryDay: 0,
      weeklySummaryTime: "10:00",
      timezoneOffsetMinutes: -180,
    },
    new Date("2026-09-20T06:00:00.000Z"),
  );
  assert.equal(scheduled.toISOString(), "2026-09-20T07:00:00.000Z");
});


test("notification device registration accepts Android and Web only", () => {
  const token = "t".repeat(32);
  assert.equal(
    registerNotificationDeviceSchema.safeParse({ token, platform: "android" }).success,
    true,
  );
  assert.equal(
    registerNotificationDeviceSchema.safeParse({ token, platform: "web" }).success,
    true,
  );
  assert.equal(
    registerNotificationDeviceSchema.safeParse({ token, platform: "ios" }).success,
    false,
  );
});

test("FCM envelopes stay data-only and apply platform-specific transport config", () => {
  const now = new Date("2026-09-18T18:00:00.000Z");
  const notification = {
    id: "notification-1",
    userId: "user-1",
    type: "PROACTIVE_MESSAGE",
    title: "Diewish",
    body: "Test",
    scheduledFor: now,
    deliveredAt: null,
    metadata: null,
    createdAt: now,
  } as Notification;

  const android = buildFcmMessage(notification, {
    token: "android-token",
    platform: "android",
  });
  assert.equal(android.token, "android-token");
  assert.equal(android.data.type, "PROACTIVE_MESSAGE");
  assert.equal(android.data.title, "Diewish Koç");
  assert.equal(android.data.body, "Yeni bir koç mesajın var.");
  assert.equal(android.android?.priority, "high");
  assert.equal(android.webpush, undefined);
  assert.equal("notification" in android, false);

  const web = buildFcmMessage(notification, {
    token: "web-token",
    platform: "web",
  });
  assert.equal(web.token, "web-token");
  assert.equal(web.webpush?.headers.Urgency, "high");
  assert.equal(web.android, undefined);
  assert.equal("notification" in web, false);
});


test("remote notification copy never forwards stored personalized body text", () => {
  const weekly = privacySafeRemoteCopy("WEEKLY_REVIEW");
  assert.equal(weekly.title, "Haftalık özet");
  assert.equal(weekly.body, "Yeni haftalık özetin hazır.");

  const risk = privacySafeRemoteCopy("RISK_ALERT");
  assert.equal(risk.title, "Diewish");
  assert.equal(risk.body, "Diewish'te yeni bir bilgilendirme var.");
});
