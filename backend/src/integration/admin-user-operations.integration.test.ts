import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { signAccessToken, signRefreshToken, hashToken } from "../utils/jwt";
import { bootstrapAdminFoundation } from "../modules/admin/admin.bootstrap";
import { adminUserOperationsService } from "../modules/admin/admin-user-operations.service";
import { hashPassword } from "../utils/password";
import { lifecycleService } from "../modules/identity/lifecycle.service";
import { reactivationService } from "../modules/identity/reactivation.service";
import { authService } from "../modules/auth/auth.service";

test("A2 controlled consumer account/session operations and transactional audit", async (t) => {
  await bootstrapAdminFoundation();
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const prefix = `a2-${crypto.randomUUID()}`;
  const ids: string[] = [];
  const roleIds: string[] = [];
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.adminUserRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.adminRolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.adminRole.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });
  async function user(suffix: string, role: UserRole, permissions?: string[]) {
    const row = await prisma.user.create({
      data: { email: `${prefix}-${suffix}@example.com`, passwordHash: "A2-secret-sentinel", role },
    });
    ids.push(row.id);
    if (permissions) {
      const custom = await prisma.adminRole.create({
        data: { key: `${prefix}-${suffix}`, name: suffix, isSystem: false },
      });
      roleIds.push(custom.id);
      const allowed = await prisma.adminPermission.findMany({
        where: { key: { in: ["admin.access", "users.read", ...permissions] } },
        select: { id: true },
      });
      await prisma.adminRolePermission.createMany({
        data: allowed.map((p) => ({ roleId: custom.id, permissionId: p.id })),
      });
      await prisma.adminUserRole.create({ data: { userId: row.id, roleId: custom.id } });
    }
    return { ...row, bearer: signAccessToken({ userId: row.id, email: row.email, role }) };
  }
  const target = await user("target", UserRole.USER);
  const other = await user("other", UserRole.USER);
  const reader = await user("reader", UserRole.ADMIN, []);
  const manager = await user("manager", UserRole.ADMIN, ["users.manage"]);
  const revoker = await user("revoker", UserRole.ADMIN, ["users.sessions.revoke"]);
  const reason = "Approved A2 isolated integration test";
  const call = (path: string, method = "GET", bearer = manager.bearer, body?: unknown) =>
    fetch(`${origin}/api/admin/users/${path}`, {
      method,
      headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  async function session(userId = target.id) {
    const id = crypto.randomUUID();
    const raw = signRefreshToken({ userId, tokenId: id });
    await prisma.refreshToken.create({
      data: {
        id,
        userId,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + 86400000),
        userAgent: "Mozilla/5.0 Android Chrome/120.0 A2-SECRET",
        ipAddress: "192.0.2.1",
      },
    });
    return { id, raw };
  }
  const statusBody = { isActive: false, reason, confirmed: true };
  const mutationBody = { reason, confirmed: true };

  await t.test("independent backend permissions and normal user rejection", async () => {
    for (const bearer of [target.bearer, reader.bearer, revoker.bearer]) {
      assert.equal((await call(`${target.id}/status`, "PATCH", bearer, statusBody)).status, 403);
    }
    const record = await session();
    for (const bearer of [target.bearer, reader.bearer, manager.bearer]) {
      assert.equal((await call(`${target.id}/sessions`, "GET", bearer)).status, 403);
      for (const path of [`${target.id}/sessions/${record.id}`, `${target.id}/sessions`])
        assert.equal((await call(path, "DELETE", bearer, mutationBody)).status, 403);
    }
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).isActive,
      true,
    );
  });
  await t.test(
    "status requires reason/confirmation, excludes staff and audits exact before/after",
    async () => {
      for (const body of [
        { ...statusBody, reason: "   " },
        { ...statusBody, confirmed: false },
        { isActive: false, reason },
        { ...statusBody, unexpected: true },
      ])
        assert.equal(
          (await call(`${target.id}/status`, "PATCH", manager.bearer, body)).status,
          422,
        );
      assert.equal(
        (await call(`${reader.id}/status`, "PATCH", manager.bearer, statusBody)).status,
        403,
      );
      assert.equal(
        (await call(`${manager.id}/status`, "PATCH", manager.bearer, statusBody)).status,
        403,
      );
      assert.equal(
        (await call(`${crypto.randomUUID()}/status`, "PATCH", manager.bearer, statusBody)).status,
        404,
      );
      const refresh = await session();
      assert.equal(
        (await call(`${target.id}/status`, "PATCH", manager.bearer, statusBody)).status,
        200,
      );
      // Existing access is denied immediately for inactive accounts, not just at refresh.
      assert.equal(
        (
          await fetch(`${origin}/api/auth/me`, {
            headers: { authorization: `Bearer ${target.bearer}` },
          })
        ).status,
        401,
      );
      await assert.rejects(authService.refresh(refresh.raw, {}));
      assert.equal(
        (await call(`${target.id}/status`, "PATCH", manager.bearer, statusBody)).status,
        409,
      );
      const audit = await prisma.adminAuditEvent.findFirstOrThrow({
        where: {
          actorAdminId: manager.id,
          targetId: target.id,
          action: "admin.users.status_update",
        },
      });
      assert.deepEqual(audit.beforeState, { isActive: true, selfDeactivated: false });
      assert.deepEqual(audit.afterState, { isActive: false, selfDeactivated: false });
      assert.equal(audit.reason, reason);
      assert.equal(audit.targetType, "user");
      assert.ok(audit.requestId);
      assert.ok(audit.createdAt);
      assert.equal(
        (
          await call(`${target.id}/status`, "PATCH", manager.bearer, {
            ...statusBody,
            isActive: true,
          })
        ).status,
        200,
      );
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).isActive,
        true,
      );
    },
  );
  await t.test(
    "session allowlist, target binding, confirmation and actual refresh denial",
    async () => {
      const record = await session();
      const foreign = await session(other.id);
      const response = await call(`${target.id}/sessions`, "GET", revoker.bearer);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const { data } = (await response.json()) as {
        data: { sessions: { id: string }[]; total: number };
      };
      assert.ok(data.total > 0);
      for (const row of data.sessions)
        assert.deepEqual(Object.keys(row).sort(), ["createdAt", "device", "expiresAt", "id"]);
      assert.doesNotMatch(JSON.stringify(data), /token|hash|secret|userAgent|ipAddress|192\.0\.2/i);
      for (const body of [
        { reason: "  ", confirmed: true },
        { reason },
        { ...mutationBody, confirmed: false },
      ])
        assert.equal(
          (await call(`${target.id}/sessions/${record.id}`, "DELETE", revoker.bearer, body)).status,
          422,
        );
      for (const id of [foreign.id, crypto.randomUUID()])
        assert.equal(
          (await call(`${target.id}/sessions/${id}`, "DELETE", revoker.bearer, mutationBody))
            .status,
          404,
        );
      assert.equal((await call(`${reader.id}/sessions`, "GET", revoker.bearer)).status, 403);
      assert.equal(
        (await call(`${target.id}/sessions/${record.id}`, "DELETE", revoker.bearer, mutationBody))
          .status,
        200,
      );
      const audit = await prisma.adminAuditEvent.findFirstOrThrow({
        where: { targetId: target.id, action: "admin.users.session_revoke" },
      });
      assert.deepEqual(audit.beforeState, { sessionId: record.id, active: true });
      assert.deepEqual(audit.afterState, { sessionId: record.id, active: false });
      assert.equal(audit.reason, reason);
      assert.doesNotMatch(JSON.stringify(audit), /A2-secret|tokenHash|refreshToken/);
      assert.equal(
        (await call(`${target.id}/sessions/${record.id}`, "DELETE", revoker.bearer, mutationBody))
          .status,
        409,
      );
      await assert.rejects(authService.refresh(record.raw, {}));
      assert.equal(
        (await prisma.refreshToken.findUniqueOrThrow({ where: { id: foreign.id } })).revokedAt,
        null,
      );
    },
  );
  await t.test("revocation follows rotation and revoke-all affects only the target", async () => {
    const old = await session();
    const renewed = await authService.refresh(old.raw, {});
    assert.equal(
      (await call(`${target.id}/sessions/${old.id}`, "DELETE", revoker.bearer, mutationBody))
        .status,
      200,
    );
    await assert.rejects(authService.refresh(renewed.refreshToken, {}));
    await session();
    await session();
    const foreign = await session(other.id);
    const result = await call(`${target.id}/sessions`, "DELETE", revoker.bearer, mutationBody);
    assert.equal(result.status, 200);
    assert.ok(((await result.json()) as { data: { revokedCount: number } }).data.revokedCount >= 2);
    assert.equal(
      await prisma.refreshToken.count({
        where: { userId: target.id, revokedAt: null, expiresAt: { gt: new Date() } },
      }),
      0,
    );
    assert.equal(
      (await prisma.refreshToken.findUniqueOrThrow({ where: { id: foreign.id } })).revokedAt,
      null,
    );
    assert.equal(
      (await call(`${target.id}/sessions`, "DELETE", revoker.bearer, mutationBody)).status,
      409,
    );
    const audit = await prisma.adminAuditEvent.findFirstOrThrow({
      where: { targetId: target.id, action: "admin.users.sessions_revoke_all" },
    });
    assert.ok(audit.beforeState);
    assert.ok(audit.afterState);
  });
  await t.test("concurrent duplicate requests produce only one mutation and audit", async () => {
    const before = await prisma.adminAuditEvent.count({
      where: { actorAdminId: manager.id, targetId: target.id },
    });
    const results = await Promise.all(
      [1, 2].map(() => call(`${target.id}/status`, "PATCH", manager.bearer, statusBody)),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      await prisma.adminAuditEvent.count({
        where: { actorAdminId: manager.id, targetId: target.id },
      }),
      before + 1,
    );
    await call(`${target.id}/status`, "PATCH", manager.bearer, { ...statusBody, isActive: true });
  });
  await t.test("audit failure rolls back account and session changes", async () => {
    const context = { actorAdminId: manager.id, requestId: null as unknown as string };
    // Missing required request metadata causes the audit write to fail inside the transaction.
    await assert.rejects(adminUserOperationsService.status(context, target.id, false, reason));
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).isActive,
      true,
    );
    const record = await session();
    await assert.rejects(adminUserOperationsService.revoke(context, target.id, record.id, reason));
    assert.equal(
      (await prisma.refreshToken.findUniqueOrThrow({ where: { id: record.id } })).revokedAt,
      null,
    );
  });
  await t.test("admin status cannot be bypassed by self-service reactivation", async () => {
    const password = "A2-local-test-password-123!";
    await prisma.user.update({
      where: { id: target.id },
      data: { passwordHash: await hashPassword(password) },
    });
    await lifecycleService.deactivate(target.id);
    assert.ok((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).deactivatedAt);
    assert.equal(
      (
        await call(`${target.id}/status`, "PATCH", manager.bearer, {
          ...statusBody,
          isActive: true,
        })
      ).status,
      200,
    );
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).deactivatedAt,
      null,
    );
    assert.equal(
      (await call(`${target.id}/status`, "PATCH", manager.bearer, statusBody)).status,
      200,
    );
    await assert.rejects(reactivationService.withPassword(target.email, password, {}));
    await assert.rejects(lifecycleService.deactivate(target.id));
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).isActive,
      false,
    );
    await call(`${target.id}/status`, "PATCH", manager.bearer, { ...statusBody, isActive: true });
  });
  await t.test("A1 remains read-only and production remains closed", async () => {
    assert.equal((await call(target.id, "GET", reader.bearer)).status, 200);
    const previous = env.DIEWISH_ENVIRONMENT;
    try {
      env.DIEWISH_ENVIRONMENT = "production";
      assert.equal(
        (await call(`${target.id}/status`, "PATCH", manager.bearer, statusBody)).status,
        403,
      );
      assert.equal(
        (await call(`${target.id}/sessions`, "DELETE", revoker.bearer, mutationBody)).status,
        403,
      );
    } finally {
      env.DIEWISH_ENVIRONMENT = previous;
    }
  });
});
