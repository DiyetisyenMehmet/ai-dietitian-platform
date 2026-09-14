import assert from "node:assert/strict";
import test from "node:test";

import { prisma } from "../lib/prisma";
import { updateNotificationPreferencesSchema } from "../modules/notifications/notification.schemas";
import { notificationService } from "../modules/notifications/notification.service";

test("notification preferences are opt-in, validated and isolated by owner", async (t) => {
  const stamp = `${Date.now()}-${Math.random()}`;
  const [firstUser, secondUser] = await Promise.all([
    prisma.user.create({
      data: {
        email: `notification-a-${stamp}@example.invalid`,
        passwordHash: "integration-test-only",
      },
    }),
    prisma.user.create({
      data: {
        email: `notification-b-${stamp}@example.invalid`,
        passwordHash: "integration-test-only",
      },
    }),
  ]);

  t.after(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [firstUser.id, secondUser.id] } } });
    await prisma.$disconnect();
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
