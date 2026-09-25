import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { UserRole } from "@prisma/client";

import { createApp } from "../app";
import { prisma } from "../lib/prisma";
import { signAccessToken } from "../utils/jwt";
import { hashPassword } from "../utils/password";
import { buildAuditSnapshot, runAuditedAdminMutation } from "../modules/admin/admin-audit.service";
import { resolveRuntimeEnvironment } from "../modules/admin/admin.environment";
import { ADMIN_PERMISSIONS, isAdminPermissionKey } from "../modules/admin/admin.permissions";
import { resolveAdminAccess } from "../modules/admin/admin-rbac.repository";
import { bootstrapAdminFoundation } from "../modules/admin/admin.bootstrap";
import { firebaseAuthProvider } from "../modules/identity/firebase-auth.provider";

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
  const app = createApp();
  let server: Server | undefined;
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  assert.ok(server);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return { server, baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}` };
}

async function createUser(role: UserRole, suffix: string, isActive = true) {
  return prisma.user.create({
    data: {
      email: `admin.phase1.${suffix}.${crypto.randomUUID()}@example.com`,
      passwordHash: "not-used-in-this-test",
      role,
      isActive,
    },
  });
}

function tokenFor(user: { id: string; email: string; role: UserRole }): string {
  return signAccessToken({ userId: user.id, email: user.email, role: user.role });
}

async function getEnvironment(
  baseUrl: string,
  token?: string,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${baseUrl}/api/admin/environment`, {
    headers: { ...extraHeaders, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
}

test("Phase 1 admin authorization, RBAC and transactional audit", async (t) => {
  await bootstrapAdminFoundation();
  const { server, baseUrl } = await startServer();
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdPermissionIds: string[] = [];

  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await prisma.adminAuditEvent.deleteMany({
      where: { targetId: { in: [...createdUserIds, ...createdRoleIds] } },
    });
    await prisma.adminUserRole.deleteMany({ where: { userId: { in: createdUserIds } } });
    if (createdRoleIds.length) {
      await prisma.adminRolePermission.deleteMany({ where: { roleId: { in: createdRoleIds } } });
      await prisma.adminRole.deleteMany({ where: { id: { in: createdRoleIds } } });
    }
    if (createdPermissionIds.length) {
      await prisma.adminPermission.deleteMany({ where: { id: { in: createdPermissionIds } } });
    }
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  await t.test("authorization matrix and immediate permission removal", async () => {
    assert.equal((await getEnvironment(baseUrl)).status, 401);

    const normal = await createUser(UserRole.USER, "user");
    createdUserIds.push(normal.id);
    assert.equal((await getEnvironment(baseUrl, tokenFor(normal))).status, 403);

    const inactive = await createUser(UserRole.ADMIN, "inactive", false);
    createdUserIds.push(inactive.id);
    assert.equal((await getEnvironment(baseUrl, tokenFor(inactive))).status, 401);

    const admin = await createUser(UserRole.ADMIN, "admin");
    createdUserIds.push(admin.id);
    const adminToken = tokenFor(admin);
    assert.equal((await getEnvironment(baseUrl, adminToken)).status, 403);

    const accessPermission = await prisma.adminPermission.findUniqueOrThrow({
      where: { key: ADMIN_PERMISSIONS.ACCESS },
    });
    const role = await prisma.adminRole.create({
      data: { key: `PHASE1_ACCESS_${crypto.randomUUID()}`, name: "Phase 1 Access" },
    });
    createdRoleIds.push(role.id);
    await prisma.adminRolePermission.create({
      data: { roleId: role.id, permissionId: accessPermission.id },
    });
    await prisma.adminUserRole.create({ data: { userId: admin.id, roleId: role.id } });

    const allowed = await getEnvironment(baseUrl, adminToken, {
      "x-diewish-environment": "production",
    });
    assert.equal(allowed.status, 200);
    const allowedBody = (await allowed.json()) as {
      success: boolean;
      data: { environment: string };
    };
    assert.equal(allowedBody.success, true);
    assert.equal(allowedBody.data.environment, resolveRuntimeEnvironment());

    await prisma.adminRolePermission.delete({
      where: { roleId_permissionId: { roleId: role.id, permissionId: accessPermission.id } },
    });
    assert.equal((await getEnvironment(baseUrl, adminToken)).status, 403);

    await prisma.adminRolePermission.create({
      data: { roleId: role.id, permissionId: accessPermission.id },
    });
    await prisma.user.update({ where: { id: admin.id }, data: { role: UserRole.USER } });
    assert.equal((await getEnvironment(baseUrl, adminToken)).status, 403);
  });

  await t.test("RBAC constraints, multiple roles and permission union", async () => {
    const admin = await createUser(UserRole.ADMIN, "union");
    createdUserIds.push(admin.id);
    const access = await prisma.adminPermission.findUniqueOrThrow({
      where: { key: ADMIN_PERMISSIONS.ACCESS },
    });
    const security = await prisma.adminPermission.findUniqueOrThrow({
      where: { key: ADMIN_PERMISSIONS.SECURITY_READ },
    });

    const roleA = await prisma.adminRole.create({
      data: { key: `PHASE1_ROLE_A_${crypto.randomUUID()}`, name: "A" },
    });
    const roleB = await prisma.adminRole.create({
      data: { key: `PHASE1_ROLE_B_${crypto.randomUUID()}`, name: "B" },
    });
    createdRoleIds.push(roleA.id, roleB.id);

    await prisma.adminRolePermission.create({ data: { roleId: roleA.id, permissionId: access.id } });
    await prisma.adminRolePermission.create({ data: { roleId: roleB.id, permissionId: security.id } });
    await prisma.adminUserRole.create({ data: { userId: admin.id, roleId: roleA.id } });
    await prisma.adminUserRole.create({ data: { userId: admin.id, roleId: roleB.id } });

    const injected = await prisma.adminPermission.create({
      data: { key: "admin.access OR 1=1", description: "negative-test fixture" },
    });
    createdPermissionIds.push(injected.id);
    await prisma.adminRolePermission.create({
      data: { roleId: roleA.id, permissionId: injected.id },
    });

    const resolved = await resolveAdminAccess(admin.id);
    assert.ok(resolved);
    assert.deepEqual(
      new Set(resolved.permissions),
      new Set([ADMIN_PERMISSIONS.ACCESS, ADMIN_PERMISSIONS.SECURITY_READ]),
    );

    await assert.rejects(
      prisma.adminUserRole.create({ data: { userId: admin.id, roleId: roleA.id } }),
    );
    await assert.rejects(
      prisma.adminRolePermission.create({ data: { roleId: roleA.id, permissionId: access.id } }),
    );
    assert.equal(isAdminPermissionKey("admin.access"), true);
    assert.equal(isAdminPermissionKey("admin.access OR 1=1"), false);
  });

  await t.test("audit is minimized, correlated and transactionally fail-closed", async () => {
    const admin = await createUser(UserRole.ADMIN, "audit");
    createdUserIds.push(admin.id);

    const snapshot = buildAuditSnapshot(
      { role: "TEST_ROLE", harmless: true, accessToken: "must-not-appear" },
      ["role", "harmless"],
    );
    assert.deepEqual(snapshot, { role: "TEST_ROLE", harmless: true });
    assert.throws(() => buildAuditSnapshot({ passwordHash: "secret" }, ["passwordHash"]));

    const roleId = crypto.randomUUID();
    createdRoleIds.push(roleId);
    await runAuditedAdminMutation(
      {
        actorAdminId: admin.id,
        action: "admin.test.role_create",
        targetType: "admin_role",
        targetId: roleId,
        reason: "Phase 1 transactional audit proof",
        environment: resolveRuntimeEnvironment(),
        correlationId: "phase1-correlation",
        requestId: "phase1-request",
        riskLevel: "LOW",
      },
      async (tx) => {
        const role = await tx.adminRole.create({
          data: { id: roleId, key: `PHASE1_AUDIT_${crypto.randomUUID()}`, name: "Audit proof" },
        });
        return {
          result: role,
          before: buildAuditSnapshot({}, []),
          after: buildAuditSnapshot({ key: role.key }, ["key"]),
        };
      },
    );

    const audit = await prisma.adminAuditEvent.findFirstOrThrow({
      where: { targetId: roleId, action: "admin.test.role_create" },
    });
    assert.equal(audit.actorAdminId, admin.id);
    assert.equal(audit.correlationId, "phase1-correlation");
    assert.equal(audit.requestId, "phase1-request");
    assert.equal(audit.environment, resolveRuntimeEnvironment());

    const rollbackRoleId = crypto.randomUUID();
    createdRoleIds.push(rollbackRoleId);
    await assert.rejects(
      runAuditedAdminMutation(
        {
          actorAdminId: admin.id,
          action: "admin.test.rollback",
          targetType: "admin_role",
          targetId: rollbackRoleId,
          environment: resolveRuntimeEnvironment(),
          correlationId: "rollback",
          requestId: "rollback",
          riskLevel: "NOT_A_REAL_LEVEL" as never,
        },
        async (tx) => {
          const role = await tx.adminRole.create({
            data: {
              id: rollbackRoleId,
              key: `PHASE1_ROLLBACK_${crypto.randomUUID()}`,
              name: "Must roll back",
            },
          });
          return { result: role, after: buildAuditSnapshot({ key: role.key }, ["key"]) };
        },
      ),
      (error: unknown) =>
        error instanceof Error && error.message === "Admin audit write failed.",
    );
    assert.equal(await prisma.adminRole.count({ where: { id: rollbackRoleId } }), 0);
  });

  await t.test("Management Center authentication accepts only existing RBAC admins", async () => {
    const password = "AdminLoginPass123";
    const passwordHash = await hashPassword(password);
    const superRole = await prisma.adminRole.findUniqueOrThrow({
      where: { key: "SUPER_ADMIN" },
    });

    const admin = await prisma.user.create({
      data: {
        email: `admin.login.${crypto.randomUUID()}@example.com`,
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true,
      },
    });
    createdUserIds.push(admin.id);
    await prisma.adminUserRole.create({
      data: { userId: admin.id, roleId: superRole.id },
    });

    const emailLogin = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: admin.email, password }),
    });
    assert.equal(emailLogin.status, 200);
    assert.match(emailLogin.headers.get("set-cookie") ?? "", /HttpOnly/i);

    const normal = await prisma.user.create({
      data: {
        email: `admin.normal.${crypto.randomUUID()}@example.com`,
        passwordHash,
        role: UserRole.USER,
        isActive: true,
      },
    });
    createdUserIds.push(normal.id);

    const normalLogin = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: normal.email, password }),
    });
    assert.equal(normalLogin.status, 403);
    const normalLoginBody = (await normalLogin.json()) as {
      error: { code: string };
    };
    assert.equal(normalLoginBody.error.code, "ADMIN_AUTH_FORBIDDEN");

    const phoneNumber = "+905551112233";
    const phoneAdmin = await prisma.user.create({
      data: {
        email: "phone.905551112233@phone.diewish.invalid",
        passwordHash: "external-login-secret",
        role: UserRole.ADMIN,
        isActive: true,
      },
    });
    createdUserIds.push(phoneAdmin.id);
    await prisma.adminUserRole.create({
      data: { userId: phoneAdmin.id, roleId: superRole.id },
    });

    const originalVerify = firebaseAuthProvider.verifyIdToken;
    try {
      firebaseAuthProvider.verifyIdToken = async () => ({
        uid: "admin-phone-fixture",
        email: null,
        emailVerified: false,
        phoneNumber,
        displayName: null,
        providers: ["phone"],
      });

      const phoneLogin = await fetch(`${baseUrl}/api/admin/auth/phone`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: "x".repeat(32) }),
      });
      assert.equal(phoneLogin.status, 200);

      const beforeUnknown = await prisma.user.count();
      firebaseAuthProvider.verifyIdToken = async () => ({
        uid: "unknown-phone-fixture",
        email: null,
        emailVerified: false,
        phoneNumber: "+905559998877",
        displayName: null,
        providers: ["phone"],
      });
      const unknownPhone = await fetch(`${baseUrl}/api/admin/auth/phone`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: "y".repeat(32) }),
      });
      assert.equal(unknownPhone.status, 401);
      assert.equal(await prisma.user.count(), beforeUnknown);
    } finally {
      firebaseAuthProvider.verifyIdToken = originalVerify;
    }
  });

});
