import assert from "node:assert/strict";
import test from "node:test";

import { prisma } from "../lib/prisma";
import { createActivitySchema } from "../modules/activity/activity.schemas";
import { activityService } from "../modules/activity/activity.service";

test("activity lifecycle supports FR-011 types, optional details and daily energy", async (t) => {
  const email = `activity-service-${Date.now()}@example.invalid`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: "integration-test-only",
      fullName: "Activity Integration",
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

  assert.equal(
    createActivitySchema.safeParse({
      type: "HOME_EXERCISE",
      durationMinutes: 20,
      distanceKm: 1.2,
      perceivedIntensity: 7,
    }).success,
    true,
  );
  assert.equal(
    createActivitySchema.safeParse({
      type: "PILATES",
      durationMinutes: 20,
      perceivedIntensity: 11,
    }).success,
    false,
  );
  assert.equal(
    createActivitySchema.safeParse({
      type: "WALKING",
      durationMinutes: 20,
      distanceKm: -1,
    }).success,
    false,
  );

  const pilates = await activityService.logActivity(user.id, {
    type: "PILATES",
    durationMinutes: 30,
    perceivedIntensity: 5,
  });
  assert.equal(pilates.type, "PILATES");
  assert.equal(pilates.perceivedIntensity, 5);
  assert.equal(pilates.distanceKm, null);
  assert.ok((pilates.caloriesBurned ?? 0) > 0);

  const homeExercise = await activityService.logActivity(user.id, {
    type: "HOME_EXERCISE",
    durationMinutes: 20,
    distanceKm: 1.2,
    perceivedIntensity: 7,
  });
  assert.equal(homeExercise.type, "HOME_EXERCISE");
  assert.equal(homeExercise.distanceKm, 1.2);
  assert.equal(homeExercise.perceivedIntensity, 7);
  assert.ok((homeExercise.caloriesBurned ?? 0) > 0);

  const activities = await activityService.listActivities(user.id, new Date(Date.now() - 60_000));
  assert.equal(activities.length, 2);
  const dailyEnergy = activities.reduce((sum, activity) => sum + (activity.caloriesBurned ?? 0), 0);
  assert.equal(dailyEnergy, (pilates.caloriesBurned ?? 0) + (homeExercise.caloriesBurned ?? 0));
});
