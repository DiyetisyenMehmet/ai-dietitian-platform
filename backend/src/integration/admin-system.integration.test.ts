import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { UserRole } from "@prisma/client";

import { createApp } from "../app";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { bootstrapAdminFoundation } from "../modules/admin/admin.bootstrap";
import { signAccessToken } from "../utils/jwt";
import { readSystemHealth, readOperationsSummary } from "../modules/admin/admin-system.service";

test("Owner system and operations HTTP boundaries on isolated PostgreSQL", async (t) => {
  assert.equal(env.NODE_ENV, "test", "Run only against a disposable test database");
  await bootstrapAdminFoundation();
  const ids: string[] = [];
  const roleIds: string[] = [];
  const app = createApp();
  const server = await new Promise<Server>((resolve) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin`;
  const makeUser = async (role: UserRole, isActive = true) => {
    const user = await prisma.user.create({
      data: {
        email: `admin3-${crypto.randomUUID()}@example.invalid`,
        passwordHash: "unused-test-only",
        role,
        isActive,
      },
    });
    ids.push(user.id);
    return { user, token: signAccessToken({ userId: user.id, email: user.email, role }) };
  };
  const assign = async (id: string, permissions: string[]) => {
    const role = await prisma.adminRole.create({
      data: { key: `ADMIN3_${crypto.randomUUID()}`, name: "Isolated Admin3 test" },
    });
    roleIds.push(role.id);
    for (const key of permissions) {
      const permission = await prisma.adminPermission.findUniqueOrThrow({ where: { key } });
      await prisma.adminRolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      });
    }
    await prisma.adminUserRole.create({ data: { userId: id, roleId: role.id } });
    return role;
  };
  const get = (path: string, token?: string) =>
    fetch(`${base}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await prisma.adminUserRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.adminRolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.adminRole.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });
  const regular = await makeUser(UserRole.USER);
  const limited = await makeUser(UserRole.ADMIN);
  await assign(limited.user.id, ["admin.access"]);
  const system = await makeUser(UserRole.ADMIN);
  const systemRole = await assign(system.user.id, ["admin.access", "system.read"]);
  const operations = await makeUser(UserRole.ADMIN);
  await assign(operations.user.id, ["admin.access", "operations.read"]);
  const owner = await makeUser(UserRole.ADMIN);
  const superRole = await prisma.adminRole.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
  await prisma.adminUserRole.create({ data: { userId: owner.user.id, roleId: superRole.id } });

  await t.test(
    "401 without authentication; USER and limited Admin 403 on both endpoints",
    async () => {
      for (const path of ["/system/health", "/operations/summary"]) {
        assert.equal((await get(path)).status, 401);
        assert.equal((await get(path, regular.token)).status, 403);
        assert.equal((await get(path, limited.token)).status, 403);
        assert.equal(
          (
            await fetch(`${base}${path}`, {
              method: "POST",
              headers: { authorization: `Bearer ${owner.token}` },
            })
          ).status,
          404,
        );
      }
    },
  );
  await t.test(
    "system.read and operations.read are independent, including SUPER_ADMIN",
    async () => {
      assert.equal((await get("/system/health", system.token)).status, 200);
      assert.equal((await get("/operations/summary", system.token)).status, 403);
      assert.equal((await get("/system/health", operations.token)).status, 403);
      assert.equal((await get("/operations/summary", operations.token)).status, 200);
      for (const path of ["/system/health", "/operations/summary"])
        assert.equal((await get(path, owner.token)).status, 200);
    },
  );
  await t.test(
    "health response is an explicit allowlist without secrets or environment dump",
    async () => {
      const response = await get("/system/health", owner.token);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const { data } = (await response.json()) as {
        data: Awaited<ReturnType<typeof readSystemHealth>>;
      };
      assert.deepEqual(Object.keys(data).sort(), [
        "application",
        "checks",
        "commit",
        "environment",
        "scope",
        "status",
        "timestamp",
        "version",
      ]);
      assert.equal(data.checks.database.status, "healthy");
      assert.equal(data.checks.frontend.status, "unknown");
      assert.equal(data.scope, "admin-runtime");
      for (const check of Object.values(data.checks))
        assert.deepEqual(Object.keys(check as object).sort(), ["detail", "status"]);
      const raw = JSON.stringify(data);
      for (const secret of [
        env.DATABASE_URL,
        env.JWT_ACCESS_SECRET,
        env.JWT_REFRESH_SECRET,
        "postgresql://",
        "DATABASE_URL",
        "JWT_ACCESS_SECRET",
      ])
        assert.equal(raw.includes(secret), false);
    },
  );
  await t.test("aggregate counts exclude Admins and contain no user or health data", async () => {
    const response = await get("/operations/summary", owner.token);
    const { data } = (await response.json()) as {
      data: Awaited<ReturnType<typeof readOperationsSummary>>;
    };
    assert.deepEqual(Object.keys(data).sort(), [
      "accountPlans",
      "effectiveSubscriptions",
      "planBasis",
      "scope",
      "timestamp",
      "users",
    ]);
    assert.equal(data.users.total, await prisma.user.count({ where: { role: "USER" } }));
    assert.equal(
      data.users.active,
      await prisma.user.count({ where: { role: "USER", isActive: true } }),
    );
    assert.equal(
      data.users.inactive,
      await prisma.user.count({ where: { role: "USER", isActive: false } }),
    );
    assert.equal(
      data.accountPlans.FREE + data.accountPlans.PREMIUM + data.accountPlans.PREMIUM_PLUS,
      data.users.total,
    );
    assert.equal(data.effectiveSubscriptions, null);
    assert.equal(JSON.stringify(data).includes(regular.user.email), false);
  });
  await t.test(
    "cached health does not bypass permission removal, role downgrade or inactive session",
    async () => {
      await prisma.adminRolePermission.deleteMany({
        where: { roleId: systemRole.id, permission: { key: "system.read" } },
      });
      assert.equal((await get("/system/health", system.token)).status, 403);
      await prisma.user.update({ where: { id: owner.user.id }, data: { role: "USER" } });
      assert.equal((await get("/system/health", owner.token)).status, 403);
      await prisma.user.update({ where: { id: operations.user.id }, data: { isActive: false } });
      assert.equal((await get("/operations/summary", operations.token)).status, 401);
    },
  );
  await t.test("database failure becomes a safe partial health response", async () => {
    // Prisma exposes $transaction through a proxy without an own descriptor;
    // Node 20 mock.method cannot replace it. Restore the direct test double.
    const originalTransaction = prisma.$transaction;
    prisma.$transaction = (async () => {
      throw new Error(`private failure ${env.DATABASE_URL}`);
    }) as typeof prisma.$transaction;
    try {
      const health = await readSystemHealth();
      assert.equal(health.checks.database.status, "problem");
      assert.equal(health.status, "problem");
      assert.equal(health.checks.backend.status, "healthy");
      assert.equal(JSON.stringify(health).includes("private failure"), false);
      assert.equal(JSON.stringify(health).includes(env.DATABASE_URL), false);
    } finally {
      prisma.$transaction = originalTransaction;
    }
  });
});
