import assert from "node:assert/strict";
import test from "node:test";

import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/api-error";
import { goalsService } from "../modules/goals/goals.service";
import { trackingService } from "../modules/tracking/tracking.service";

async function createUser(label: string) {
  return prisma.user.create({
    data: {
      email: "goals-" + label + "-" + Date.now() + "@example.invalid",
      passwordHash: "integration-test-only",
      fullName: "Goals " + label,
      onboardingCompleted: true,
      profile: {
        create: {
          dateOfBirth: new Date("1990-05-20T00:00:00.000Z"),
          gender: "PREFER_NOT_TO_SAY",
          heightCm: 175,
          currentWeightKg: 70,
          targetWeightKg: 66,
          activityLevel: "MODERATE",
          healthConditions: [],
          allergies: [],
          dietaryPreference: "OMNIVORE",
          dailyWaterGoalMl: 2400,
        },
      },
    },
  });
}

test("goals persist per user and progress comes from real tracking data", async (t) => {
  const owner = await createUser("owner");
  const stranger = await createUser("stranger");

  t.after(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, stranger.id] } } });
    await prisma.$disconnect();
  });

  assert.deepEqual(await goalsService.listGoals(owner.id, "UTC"), []);

  await trackingService.logWater(owner.id, { amountMl: 500 });

  const weightGoal = await goalsService.createGoal(
    owner.id,
    {
      type: "lose-weight",
      title: "Kalıcı kilo hedefi",
      targetValue: 66,
      startDate: new Date().toISOString().slice(0, 10),
      targetDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      reminderTime: "",
      notes: "",
    },
    "UTC",
  );
  assert.equal(weightGoal.startValue, 70);
  assert.equal(weightGoal.currentValue, 70);

  const waterGoal = await goalsService.createGoal(
    owner.id,
    {
      type: "water",
      title: "Su hedefim",
      targetValue: 2400,
      startDate: new Date().toISOString().slice(0, 10),
      targetDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      reminderTime: "",
      notes: "",
    },
    "UTC",
  );
  assert.equal(waterGoal.currentValue, 500);

  const reloaded = await goalsService.listGoals(owner.id, "UTC");
  assert.equal(reloaded.length, 2);
  assert.equal(reloaded.find((goal) => goal.id === waterGoal.id)?.currentValue, 500);
  assert.deepEqual(await goalsService.listGoals(stranger.id, "UTC"), []);

  await assert.rejects(
    () => goalsService.getGoal(stranger.id, weightGoal.id, "UTC"),
    (error: unknown) => error instanceof ApiError && error.statusCode === 404,
  );

  await assert.rejects(
    () =>
      goalsService.updateGoal(
        stranger.id,
        weightGoal.id,
        {
          type: "lose-weight",
          title: "Başkasının hedefi",
          targetValue: 60,
          startDate: weightGoal.startDate,
          targetDate: weightGoal.targetDate,
          reminderTime: "",
          notes: "",
        },
        "UTC",
      ),
    (error: unknown) => error instanceof ApiError && error.statusCode === 404,
  );

  await assert.rejects(
    () => goalsService.deleteGoal(stranger.id, weightGoal.id),
    (error: unknown) => error instanceof ApiError && error.statusCode === 404,
  );

  assert.ok(await goalsService.getGoal(owner.id, weightGoal.id, "UTC"));
});
