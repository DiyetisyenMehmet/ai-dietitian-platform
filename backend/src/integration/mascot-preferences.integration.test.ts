import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";
import { signAccessToken } from "../utils/jwt";
import { accountService } from "../modules/account/account.service";
import { mascotPreferencesSchema } from "../modules/account/account.schemas";

test("pilot payload accepts only bounded visual preferences", () => {
  for (const input of [{ mascotId: "mirmir" }, { mascotId: "dost" }, { animationEnabled: false }])
    assert.equal(mascotPreferencesSchema.safeParse(input).success, true);
  for (const input of [
    {},
    { mascotId: "other" },
    { animationEnabled: "false" },
    { userId: "other", mascotId: "mirmir" },
    { weightKg: 75 },
  ])
    assert.equal(mascotPreferencesSchema.safeParse(input).success, false);
});

test("two sessions share account preferences; different owners and layout remain isolated", async (t) => {
  const users = await Promise.all(
    ["a", "b"].map((id) =>
      prisma.user.create({
        data: { email: `mascot-${id}-${Date.now()}@example.invalid`, passwordHash: "test-only" },
      }),
    ),
  );
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await prisma.$disconnect();
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/account/mascot`;
  const tokens = users.map((user) =>
    signAccessToken({ userId: user.id, email: user.email, role: user.role }),
  );
  const secondSession = signAccessToken({
    userId: users[0].id,
    email: users[0].email,
    role: users[0].role,
  });
  const call = async (token?: string, body?: unknown) => {
    const response = await fetch(base, {
      method: body ? "PATCH" : "GET",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: response.status,
      body: (await response.json()) as { data: { preferences: unknown } },
    };
  };
  assert.equal((await call()).status, 401);
  assert.deepEqual((await call(tokens[0])).body.data.preferences, {
    mascotId: "classic",
    animationEnabled: true,
  });
  await accountService.updateDashboardCardPreferences(users[0].id, {
    order: ["coach", "food"],
    hidden: ["blood"],
    quickActionOrder: ["water"],
    hiddenQuickActionIds: [],
  });
  assert.equal((await call(tokens[0], { mascotId: "mirmir" })).status, 200);
  assert.deepEqual((await call(secondSession)).body.data.preferences, {
    mascotId: "mirmir",
    animationEnabled: true,
  });
  assert.deepEqual((await call(tokens[1])).body.data.preferences, {
    mascotId: "classic",
    animationEnabled: true,
  });
  // The new mascot persists through a separate session without changing owner A.
  assert.equal((await call(tokens[1], { mascotId: "dost" })).status, 200);
  const secondOwnerSession = signAccessToken({
    userId: users[1].id,
    email: users[1].email,
    role: users[1].role,
  });
  assert.deepEqual((await call(secondOwnerSession)).body.data.preferences, {
    mascotId: "dost",
    animationEnabled: true,
  });
  assert.equal((await call(tokens[0], { animationEnabled: false })).status, 200);
  await accountService.updateDashboardCardPreferences(users[0].id, { order: ["food"], hidden: [] });
  assert.deepEqual((await call(secondSession)).body.data.preferences, {
    mascotId: "mirmir",
    animationEnabled: false,
  });
  assert.deepEqual((await call(secondOwnerSession)).body.data.preferences, {
    mascotId: "dost",
    animationEnabled: true,
  });
  assert.deepEqual(
    (await accountService.getDashboardCardPreferences(users[0].id)).quickActionOrder,
    ["water"],
  );
  assert.equal((await call(tokens[0], { userId: users[1].id, mascotId: "classic" })).status, 422);
  assert.equal((await call(tokens[0], { mascotId: "other" })).status, 422);
  assert.deepEqual((await call(secondSession)).body.data.preferences, {
    mascotId: "mirmir",
    animationEnabled: false,
  });
});
