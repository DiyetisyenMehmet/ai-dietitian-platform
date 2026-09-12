import assert from "node:assert/strict";
import test from "node:test";

import { prisma } from "../lib/prisma";
import { trackingService } from "../modules/tracking/tracking.service";

test("water lifecycle persists goal, logs, removal and reminder", async (t) => {
  const email = `water-service-${Date.now()}@example.invalid`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: "integration-test-only",
      fullName: "Water Integration",
      onboardingCompleted: true,
      profile: {
        create: {
          dateOfBirth: new Date("1990-05-20T00:00:00.000Z"),
          gender: "PREFER_NOT_TO_SAY",
          heightCm: 175,
          currentWeightKg: 70,
          targetWeightKg: 68,
          activityLevel: "MODERATE",
          healthConditions: [],
          allergies: [],
          dietaryPreference: "OMNIVORE",
          dailyWaterGoalMl: 2400,
        },
      },
    },
  });

  t.after(async () => {
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
  });

  assert.equal(await trackingService.getWaterGoal(user.id), 2400);
  assert.equal(
    await trackingService.updateWaterGoal(user.id, { dailyWaterGoalMl: 2800 }),
    2800,
  );

  const first = await trackingService.logWater(user.id, { amountMl: 250 });
  const second = await trackingService.logWater(user.id, { amountMl: 500 });
  const logs = await trackingService.listWater(user.id);
  assert.equal(logs.reduce((sum, log) => sum + log.amountMl, 0), 750);

  await trackingService.deleteWater(user.id, second.id);
  const remaining = await trackingService.listWater(user.id);
  assert.deepEqual(remaining.map((log) => log.id), [first.id]);

  const reminder = await trackingService.scheduleWaterReminder(user.id, { minutesFromNow: 60 });
  assert.equal(reminder.type, "WATER_REMINDER");
  assert.ok(reminder.scheduledFor.getTime() > Date.now());

  const profile = await prisma.userProfile.findUnique({
    where: { userId: user.id },
    select: { dailyWaterGoalMl: true },
  });
  assert.equal(profile?.dailyWaterGoalMl, 2800);

  const reminderCount = await prisma.notification.count({
    where: { userId: user.id, type: "WATER_REMINDER" },
  });
  assert.equal(reminderCount, 1);
});
