import assert from "node:assert/strict";
import test from "node:test";

import { prisma } from "../lib/prisma";
import { normalizeMicronutrientSnapshot } from "../modules/nutrition-data/micronutrients";
import { trackingService } from "../modules/tracking/tracking.service";

test("meal micronutrient snapshots persist, aggregate partially, and stay owner-scoped", async (t) => {
  const stamp = Date.now();
  const userA = await prisma.user.create({
    data: {
      email: `micronutrient-a-${stamp}@example.invalid`,
      passwordHash: "integration-test-only",
    },
  });
  const userB = await prisma.user.create({
    data: {
      email: `micronutrient-b-${stamp}@example.invalid`,
      passwordHash: "integration-test-only",
    },
  });

  t.after(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    await prisma.$disconnect();
  });

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const loggedAt = now.toISOString();

  const withMicronutrients = await trackingService.logMeal(userA.id, {
    mealType: "BREAKFAST",
    name: "Provider-backed food",
    calories: 200,
    proteinG: 10,
    carbsG: 25,
    fatG: 7,
    loggedAt,
    micronutrients: {
      calcium: 200,
      iron: 4,
      vitaminC: 30,
      vitaminD: 0,
    },
  });
  await trackingService.logMeal(userA.id, {
    mealType: "LUNCH",
    name: "Legacy-style food without micronutrients",
    calories: 350,
    proteinG: 20,
    carbsG: 40,
    fatG: 12,
    loggedAt,
  });
  await trackingService.logMeal(userB.id, {
    mealType: "DINNER",
    name: "Other user's food",
    calories: 500,
    loggedAt,
    micronutrients: { calcium: 999 },
  });

  const persisted = await prisma.mealLog.findFirst({
    where: { id: withMicronutrients.id, userId: userA.id },
  });
  assert.ok(persisted);
  const snapshot = normalizeMicronutrientSnapshot(persisted.micronutrients);
  assert.ok(snapshot);
  assert.equal(snapshot.calcium, 200);
  assert.equal(snapshot.iron, 4);
  assert.equal(snapshot.vitaminD, 0);
  assert.equal(snapshot.magnesium, null);

  const summary = await trackingService.getDailyMicronutrients(userA.id, date, "UTC");
  assert.equal(summary.mealCount, 2);
  assert.equal(summary.mealsWithMicronutrients, 1);
  assert.equal(summary.coverage, "PARTIAL");
  assert.match(summary.note, /2 öğünün 1 tanesindeki/);
  assert.equal(summary.nutrients.find((item) => item.key === "calcium")?.value, 200);
  assert.equal(summary.nutrients.find((item) => item.key === "iron")?.value, 4);
  assert.equal(summary.nutrients.find((item) => item.key === "vitaminD")?.value, 0);
  assert.equal(summary.nutrients.some((item) => item.key === "magnesium"), false);

  const userBLogs = await trackingService.listMeals(userB.id);
  assert.equal(userBLogs.some((log) => log.id === withMicronutrients.id), false);
  const userBSummary = await trackingService.getDailyMicronutrients(userB.id, date, "UTC");
  assert.equal(userBSummary.nutrients.find((item) => item.key === "calcium")?.value, 999);
});

test("editing core nutrition invalidates an old micronutrient snapshot", async (t) => {
  const stamp = Date.now();
  const user = await prisma.user.create({
    data: {
      email: `micronutrient-edit-${stamp}@example.invalid`,
      passwordHash: "integration-test-only",
    },
  });

  t.after(async () => {
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
  });

  const log = await trackingService.logMeal(user.id, {
    mealType: "SNACK",
    name: "Editable food",
    calories: 100,
    micronutrients: { calcium: 120 },
  });
  assert.ok(normalizeMicronutrientSnapshot(log.micronutrients));

  const updated = await trackingService.updateMeal(user.id, log.id, { calories: 150 });
  assert.equal(normalizeMicronutrientSnapshot(updated.micronutrients), null);
});
