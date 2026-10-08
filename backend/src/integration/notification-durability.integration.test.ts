import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../utils/password";
import { authService } from "../modules/auth/auth.service";
import { notificationService } from "../modules/notifications/notification.service";
import { updateNotificationPreferencesSchema } from "../modules/notifications/notification.schemas";

const categories = ["meals", "water", "activity", "sleep", "weekly", "coach"] as const;

test("all account preferences survive a fresh database client and real logout/login without device facts", async (t) => {
  const email = `notification-durable-${Date.now()}@example.invalid`,
    password = "Phase5OnlyTest123";
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(password) },
  });
  const other = await prisma.user.create({
    data: { email: `other-${email}`, passwordHash: "test-only" },
  });
  const fresh = new PrismaClient();
  t.after(async () => {
    await fresh.$disconnect();
    await prisma.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
  });
  const context = { userAgent: "phase5-isolated-test", ipAddress: "127.0.0.1" };
  const first = await authService.login({ email, password }, context);
  const input = updateNotificationPreferencesSchema.parse({
    mealReminders: true,
    waterReminders: true,
    activityReminders: true,
    sleepReminders: true,
    weeklySummary: true,
    coachTips: true,
    waterReminderTime: "08:15",
    activityReminderTime: "18:35",
    sleepReminderTime: "22:45",
    weeklySummaryDay: 4,
    weeklySummaryTime: "11:25",
    timezoneOffsetMinutes: -180,
    waterReminderSchedule: {
      version: 1,
      mode: "custom",
      dailyTimes: ["08:15", "13:20"],
      days: Array.from({ length: 7 }, (_, day) => ({
        day,
        enabled: day !== 0,
        times: day === 0 ? [] : ["08:15", "13:20", "19:30"],
      })),
    },
    categoryAlerts: Object.fromEntries(
      categories.map((category, i) => [
        category,
        {
          soundPreset: i % 2 ? "diewish_drop" : "silent",
          vibrationPreset: i % 2 ? "double_short" : "off",
        },
      ]),
    ),
  });
  const saved = await notificationService.updatePreferences(first.user.id, input);
  await authService.logout(first.refreshToken);
  const second = await authService.login({ email, password }, context);
  assert.equal(second.user.id, user.id);
  const reloaded = await notificationService.getPreferences(second.user.id);
  for (const key of Object.keys(input))
    assert.deepEqual(reloaded[key as keyof typeof reloaded], saved[key as keyof typeof saved]);
  await prisma.$disconnect();
  const persisted = await fresh.notificationPreference.findUniqueOrThrow({
    where: { userId: user.id },
  });
  assert.deepEqual(persisted.waterReminderSchedule, input.waterReminderSchedule);
  assert.deepEqual(persisted.categoryAlerts, input.categoryAlerts);
  await fresh.$disconnect();
  assert.equal(
    (
      await prisma.$queryRaw<
        { count: bigint }[]
      >`SELECT COUNT(*) AS count FROM notification_devices WHERE "userId" = ${user.id}`
    )[0]!.count,
    0n,
  );
  assert.equal(await prisma.notification.count({ where: { userId: user.id } }), 0);
  const isolated = await notificationService.getPreferences(other.id);
  assert.equal(isolated.waterReminders, false);
  assert.equal(isolated.mealReminders, false);
  assert.equal(
    (isolated as { waterReminderSchedule?: unknown }).waterReminderSchedule ?? null,
    null,
  );
  assert.equal((isolated as { categoryAlerts?: unknown }).categoryAlerts ?? null, null);
  for (const key of ["pushToken", "permission", "nativeChannel", "hapticSupport"])
    assert.equal(key in reloaded, false);
  for (const key of [
    "mealReminders",
    "waterReminders",
    "activityReminders",
    "sleepReminders",
    "weeklySummary",
    "coachTips",
  ] as const) {
    await notificationService.updatePreferences(user.id, { [key]: false });
    assert.equal((await notificationService.getPreferences(user.id))[key], false);
  }
});

test("account API rejects permission token channel and native recurrence fields without changing stored preferences", async (t) => {
  const user = await prisma.user.create({
    data: { email: `notification-fields-${Date.now()}@example.invalid`, passwordHash: "test-only" },
  });
  t.after(async () => {
    await prisma.user.delete({ where: { id: user.id } });
  });
  const old = await notificationService.getPreferences(user.id);
  for (const key of ["permission", "pushToken", "nativeChannel", "hapticSupport", "repeatDays"]) {
    assert.equal(
      updateNotificationPreferencesSchema.safeParse({ waterReminders: true, [key]: "device-only" })
        .success,
      false,
    );
  }
  const current = await notificationService.getPreferences(user.id);
  assert.equal(current.waterReminders, old.waterReminders);
  assert.equal(
    (current as { waterReminderSchedule?: unknown }).waterReminderSchedule ?? null,
    null,
  );
});
