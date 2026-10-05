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
  });

  const updated = await accountService.updateDashboardCardPreferences(firstUser.id, {
    order: ["progress", "food", "food", "blood", "coach"],
    hidden: ["blood", "blood"],
  });

  assert.deepEqual(updated.order, ["progress", "food", "blood", "coach"]);
  assert.deepEqual(updated.hidden, ["blood"]);

  assert.deepEqual(await accountService.getDashboardCardPreferences(secondUser.id), {
    order: [],
    hidden: [],
  });

  const raw = await prisma.dashboardCardPreference.findUniqueOrThrow({
    where: { userId: firstUser.id },
  });
  assert.deepEqual(raw.cardOrder, ["progress", "food", "blood", "coach"]);
  assert.deepEqual(raw.hiddenCardIds, ["blood"]);
  assert.deepEqual(
    Object.keys(raw).sort(),
    ["cardOrder", "createdAt", "hiddenCardIds", "id", "updatedAt", "userId"].sort(),
  );
});

test("dashboard card preference payload is bounded and contains only card ids", () => {
  assert.equal(
    dashboardCardPreferencesSchema.safeParse({
      order: ["food", "blood", "progress", "coach"],
      hidden: ["blood"],
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
    true,
  );
});
