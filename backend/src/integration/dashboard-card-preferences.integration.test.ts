import assert from "node:assert/strict";
import test from "node:test";

import { prisma } from "../lib/prisma";
import { dashboardCardPreferencesSchema } from "../modules/account/account.schemas";
import { accountService } from "../modules/account/account.service";

async function createUser(prefix: string) {
  const stamp = `${Date.now()}-${Math.random()}`;
  return prisma.user.create({
    data: {
      email: `${prefix}-${stamp}@example.invalid`,
      passwordHash: "integration-test-only",
    },
  });
}

test("dashboard card preferences are account-scoped UI data only", async (t) => {
  const [firstUser, secondUser] = await Promise.all([
    createUser("dashboard-cards-a"),
    createUser("dashboard-cards-b"),
  ]);

  t.after(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [firstUser.id, secondUser.id] } } });
  });

  assert.deepEqual(await accountService.getDashboardCardPreferences(firstUser.id), {
    order: [],
    hidden: [],
    quickActionOrder: [],
    hiddenQuickActionIds: [],
  });

  const updated = await accountService.updateDashboardCardPreferences(firstUser.id, {
    order: ["progress", "food", "food", "blood", "coach"],
    hidden: ["blood", "blood"],
    quickActionOrder: ["weight", "meal", "water", "activity", "meal"],
    hiddenQuickActionIds: ["activity", "activity"],
  });

  assert.deepEqual(updated.order, ["progress", "food", "blood", "coach"]);
  assert.deepEqual(updated.hidden, ["blood"]);
  assert.deepEqual(updated.quickActionOrder, ["weight", "meal", "water", "activity"]);
  assert.deepEqual(updated.hiddenQuickActionIds, ["activity"]);

  assert.deepEqual(await accountService.getDashboardCardPreferences(secondUser.id), {
    order: [],
    hidden: [],
    quickActionOrder: [],
    hiddenQuickActionIds: [],
  });

  const raw = await prisma.dashboardCardPreference.findUniqueOrThrow({
    where: { userId: firstUser.id },
  });
  assert.deepEqual(raw.cardOrder, ["progress", "food", "blood", "coach"]);
  assert.deepEqual(raw.hiddenCardIds, ["blood"]);
  assert.deepEqual(raw.quickActionOrder, ["weight", "meal", "water", "activity"]);
  assert.deepEqual(raw.hiddenQuickActionIds, ["activity"]);
  assert.deepEqual(
    Object.keys(raw).sort(),
    [
      "cardOrder",
      "createdAt",
      "hiddenCardIds",
      "hiddenQuickActionIds",
      "id",
      "quickActionOrder",
      "updatedAt",
      "userId",
    ].sort(),
  );
});

test("dashboard card preference payload is bounded and contains only card ids", () => {
  assert.equal(
    dashboardCardPreferencesSchema.safeParse({
      order: ["food", "blood", "progress", "coach"],
      hidden: ["blood"],
      quickActionOrder: ["meal", "water", "activity", "weight"],
      hiddenQuickActionIds: ["weight"],
    }).success,
    true,
  );
  assert.equal(
    dashboardCardPreferencesSchema.safeParse({
      order: ["food", "bad id with spaces"],
      hidden: [],
    }).success,
    false,
  );
  assert.equal(
    dashboardCardPreferencesSchema.safeParse({
      order: [],
      hidden: [],
      weightKg: 82,
    }).success,
    false,
  );
});


test("legacy card-only updates preserve existing quick-action preferences", async (t) => {
  const user = await createUser("dashboard-legacy-client");
  t.after(async () => {
    await prisma.user.deleteMany({ where: { id: user.id } });
  });

  await accountService.updateDashboardCardPreferences(user.id, {
    order: ["food", "blood", "progress", "coach"],
    hidden: [],
    quickActionOrder: ["weight", "meal", "water", "activity"],
    hiddenQuickActionIds: ["activity"],
  });

  const legacyUpdate = await accountService.updateDashboardCardPreferences(user.id, {
    order: ["progress", "food", "blood", "coach"],
    hidden: ["blood"],
  });

  assert.deepEqual(legacyUpdate.quickActionOrder, ["weight", "meal", "water", "activity"]);
  assert.deepEqual(legacyUpdate.hiddenQuickActionIds, ["activity"]);
});
