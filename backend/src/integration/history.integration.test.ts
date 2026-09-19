import assert from "node:assert/strict";
import test from "node:test";
import {
  HistoryInsightScope,
  HistoryInsightSource,
} from "@prisma/client";

import { prisma } from "../lib/prisma";
import { historyComparisonService } from "../modules/history/history-comparison";
import { historyRepository } from "../modules/history/history.repository";
import { historyService } from "../modules/history/history.service";
import { sleepRepository } from "../modules/sleep/sleep.repository";

test("history read model aggregates exact-day data and keeps owner/cache isolation", async (t) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const userA = await prisma.user.create({
    data: {
      email: `history-a-${suffix}@example.invalid`,
      passwordHash: "integration-test-only",
      fullName: "History Integration A",
      onboardingCompleted: true,
      profile: {
        create: {
          dateOfBirth: new Date("1990-05-20T00:00:00.000Z"),
          gender: "PREFER_NOT_TO_SAY",
          heightCm: 175,
          currentWeightKg: 70,
          targetWeightKg: 65,
          activityLevel: "MODERATE",
          healthConditions: [],
          allergies: [],
          dietaryPreference: "OMNIVORE",
          dailyWaterGoalMl: 2500,
        },
      },
    },
  });
  const userB = await prisma.user.create({
    data: {
      email: `history-b-${suffix}@example.invalid`,
      passwordHash: "integration-test-only",
      fullName: "History Integration B",
      onboardingCompleted: true,
    },
  });

  t.after(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    await prisma.$disconnect();
  });

  await prisma.mealLog.createMany({
    data: [
      {
        userId: userA.id,
        mealType: "BREAKFAST",
        loggedAt: new Date("2026-09-10T05:00:00.000Z"),
      },
      {
        userId: userA.id,
        mealType: "LUNCH",
        name: "Known meal",
        calories: 200,
        proteinG: 20,
        carbsG: 25,
        fatG: 8,
        loggedAt: new Date("2026-09-10T09:00:00.000Z"),
      },
      {
        userId: userA.id,
        mealType: "DINNER",
        name: "Unknown nutrition meal",
        loggedAt: new Date("2026-09-10T16:00:00.000Z"),
      },
    ],
  });

  await prisma.waterLog.create({
    data: {
      userId: userA.id,
      amountMl: 300,
      loggedAt: new Date("2026-09-10T07:00:00.000Z"),
    },
  });

  await prisma.activity.create({
    data: {
      userId: userA.id,
      type: "WALKING",
      durationMinutes: 35,
      distanceKm: 2.7,
      caloriesBurned: 140,
      loggedAt: new Date("2026-09-10T12:00:00.000Z"),
    },
  });

  await prisma.weightLog.create({
    data: {
      userId: userA.id,
      weightKg: 69.8,
      loggedAt: new Date("2026-09-10T06:30:00.000Z"),
    },
  });

  await sleepRepository.create({
    userId: userA.id,
    sleepStart: new Date("2026-09-09T21:30:00.000Z"),
    wakeTime: new Date("2026-09-10T04:30:00.000Z"),
    durationMinutes: 420,
    quality: 4,
    note: "Must not leak into History payload",
  });

  const now = new Date("2026-09-19T12:00:00.000Z");
  const day = await historyService.getDay(
    userA.id,
    "2026-09-10",
    "Europe/Istanbul",
    now,
  );

  assert.equal(day.date, "2026-09-10");
  assert.equal(day.meta.partialResponse, false);
  assert.equal(day.nutrition.meals.find((meal) => meal.mealType === "BREAKFAST")?.items.length, 0);
  assert.equal(day.nutrition.totals.calories.state, "PARTIAL_VALUE");
  assert.equal(day.nutrition.totals.calories.value, 200);
  assert.equal(day.water.totalMl.state, "KNOWN_VALUE");
  assert.equal(day.water.totalMl.value, 300);
  assert.equal(day.water.historicalGoalComparisonAvailable, false);
  assert.equal(day.activity.totalActiveMinutes.value, 35);
  assert.equal(day.sleep.entries.length, 1);
  assert.equal(day.sleep.entries[0]?.wakeTime, "2026-09-10T04:30:00.000Z");
  assert.equal(day.weight.measurement?.weightKg, 69.8);
  assert.equal(day.timeline.at(-1)?.timestamp, "2026-09-10T16:00:00.000Z");
  assert.equal(
    day.timeline.every(
      (event, index, events) =>
        index === 0 ||
        new Date(events[index - 1].timestamp).getTime() <= new Date(event.timestamp).getTime(),
    ),
    true,
  );

  const otherDay = await historyService.getDay(
    userB.id,
    "2026-09-10",
    "Europe/Istanbul",
    now,
  );
  assert.equal(otherDay.nutrition.status, "NONE");
  assert.equal(otherDay.water.totalMl.state, "NO_RECORD");
  assert.equal(otherDay.activity.status, "NONE");
  assert.equal(otherDay.sleep.status, "NONE");
  assert.equal(otherDay.weight.measurement, null);

  await prisma.waterLog.createMany({
    data: [
      {
        userId: userA.id,
        amountMl: 500,
        loggedAt: new Date("2026-09-08T09:00:00.000Z"),
      },
      {
        userId: userA.id,
        amountMl: 700,
        loggedAt: new Date("2026-09-15T09:00:00.000Z"),
      },
    ],
  });

  const comparison = await historyComparisonService.getComparison(
    userA.id,
    "WEEK",
    "2026-09-16",
    "Europe/Istanbul",
    new Date("2026-09-16T12:00:00.000Z"),
  );
  assert.equal(comparison.currentPeriod.days, 3);
  assert.equal(comparison.previousPeriod.days, 3);
  assert.equal(comparison.comparisonMode, "EQUAL_ELAPSED_DAYS");
  assert.equal(comparison.metrics.water.totalMl.comparisonAvailable, true);
  assert.equal(comparison.metrics.water.totalMl.current.value, 700);
  assert.equal(comparison.metrics.water.totalMl.previous.value, 500);

  const otherComparison = await historyComparisonService.getComparison(
    userB.id,
    "WEEK",
    "2026-09-16",
    "Europe/Istanbul",
    new Date("2026-09-16T12:00:00.000Z"),
  );
  assert.equal(otherComparison.metrics.water.totalMl.current.state, "NO_RECORD");
  assert.equal(otherComparison.metrics.water.totalMl.previous.state, "NO_RECORD");

  await historyRepository.upsertInsight({
    userId: userA.id,
    scope: HistoryInsightScope.DAY,
    periodKey: "2026-09-10",
    timezone: "Europe/Istanbul",
    contextHash: "hash-a",
    content: { text: "A-only cached insight" },
    source: HistoryInsightSource.AI,
    provider: "integration",
    model: "integration",
    generatedAt: now,
  });

  assert.ok(
    await historyRepository.findInsight(
      userA.id,
      HistoryInsightScope.DAY,
      "2026-09-10",
      "Europe/Istanbul",
    ),
  );
  assert.equal(
    await historyRepository.findInsight(
      userB.id,
      HistoryInsightScope.DAY,
      "2026-09-10",
      "Europe/Istanbul",
    ),
    null,
  );
});
