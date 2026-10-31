import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { createApp } from "../app";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { signAccessToken } from "../utils/jwt";
import { bootstrapAdminFoundation } from "../modules/admin/admin.bootstrap";

test("A2 existing read APIs preserve permissions and exact-user isolation", async (t) => {
  assert.equal(env.NODE_ENV, "test", "Disposable test database only");
  await bootstrapAdminFoundation();
  const ids: string[] = [];
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/admin`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.adminAuditEvent.deleteMany({ where: { actorAdminId: { in: ids } } });
    await prisma.adminUserRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });
  async function make(role: UserRole, roleKey?: string, email?: string) {
    const user = await prisma.user.create({
      data: {
        role,
        email: email ?? `a2-${crypto.randomUUID()}@example.invalid`,
        fullName: "A2 isolated account",
        passwordHash: "A2_PRIVATE_PASSWORD_SENTINEL",
      },
    });
    ids.push(user.id);
    if (roleKey) {
      const row = await prisma.adminRole.findUniqueOrThrow({ where: { key: roleKey } });
      await prisma.adminUserRole.create({ data: { userId: user.id, roleId: row.id } });
    }
    return { user, token: signAccessToken({ userId: user.id, email: user.email, role }) };
  }
  const target = await make(UserRole.USER);
  const collision = await make(UserRole.USER, undefined, `${target.user.id}@example.invalid`);
  const support = await make(UserRole.ADMIN, "SUPPORT");
  const finance = await make(UserRole.ADMIN, "FINANCE");
  const owner = await make(UserRole.ADMIN, "SUPER_ADMIN");
  const limited = await make(UserRole.ADMIN, "ADMIN_STAFF");
  const get = (path: string, token?: string) =>
    fetch(base + path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  const paths = [
    `/users?search=${target.user.id}`,
    `/users/${target.user.id}`,
    `/users/${target.user.id}/subscription`,
    `/users/${target.user.id}/sessions`,
    `/audit?user=${target.user.id}`,
  ];
  await t.test("anonymous 401, normal USER and unprivileged Admin 403", async () => {
    for (const path of paths) {
      assert.equal((await get(path)).status, 401);
      assert.equal((await get(path, target.token)).status, 403);
      assert.equal((await get(path, limited.token)).status, 403);
    }
  });
  await t.test(
    "existing independent session, entitlement and audit permissions stay enforced",
    async () => {
      assert.equal((await get(paths[0]!, support.token)).status, 200);
      assert.equal((await get(paths[1]!, support.token)).status, 200);
      assert.equal((await get(paths[2]!, support.token)).status, 403);
      assert.equal((await get(paths[3]!, support.token)).status, 200);
      assert.equal((await get(paths[4]!, support.token)).status, 403);
      assert.equal((await get(paths[2]!, finance.token)).status, 200);
      assert.equal((await get(paths[3]!, finance.token)).status, 403);
      for (const path of paths) assert.equal((await get(path, owner.token)).status, 200);
    },
  );
  await t.test(
    "UUID search cannot include a different account whose email contains that UUID",
    async () => {
      const response = await get(`/users?search=${target.user.id.toUpperCase()}`, support.token);
      const { data } = (await response.json()) as { data: { users: Array<{ id: string }> } };
      assert.deepEqual(
        data.users.map((row) => row.id),
        [target.user.id],
      );
      const emailResponse = await get(
        `/users?search=${encodeURIComponent(collision.user.email.toUpperCase())}`,
        support.token,
      );
      const email = (await emailResponse.json()) as { data: { users: Array<{ id: string }> } };
      assert.deepEqual(
        email.data.users.map((row) => row.id),
        [collision.user.id],
      );
      assert.equal((await get(`/users/${crypto.randomUUID()}`, support.token)).status, 404);
    },
  );
  await t.test("UUID audit filter returns only the selected user's actual events", async () => {
    for (const user of [target.user, collision.user])
      await prisma.adminAuditEvent.create({
        data: {
          actorAdminId: owner.user.id,
          action: "admin.users.deactivate",
          targetType: "user",
          targetId: user.id,
          environment: "test",
          riskLevel: "LOW",
          requestId: crypto.randomUUID(),
          correlationId: crypto.randomUUID(),
          beforeState: { isActive: true },
          afterState: { isActive: false },
        },
      });
    const { data } = (await (
      await get(`/audit?user=${target.user.id.toUpperCase()}`, owner.token)
    ).json()) as {
      data: { events: Array<{ targetId: string }> };
    };
    assert.equal(data.events.length, 1);
    assert.equal(data.events[0]?.targetId, target.user.id);
  });
  await t.test(
    "read APIs disclose no credentials/health data and do not mutate account state",
    async () => {
      const before = await prisma.user.findUniqueOrThrow({ where: { id: target.user.id } });
      for (const path of paths.slice(0, 4)) {
        const response = await get(path, owner.token);
        const body = await response.text();
        assert.equal(response.status, 200);
        assert.doesNotMatch(
          body,
          /A2_PRIVATE_PASSWORD_SENTINEL|passwordHash|tokenHash|refreshToken|healthConditions|bloodTest|weightLogs|mealLogs|ipAddress/,
        );
      }
      const after = await prisma.user.findUniqueOrThrow({ where: { id: target.user.id } });
      assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime());
      assert.equal(after.isActive, before.isActive);
    },
  );
});
