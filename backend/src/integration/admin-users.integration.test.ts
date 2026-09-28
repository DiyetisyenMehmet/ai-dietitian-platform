import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { signAccessToken } from "../utils/jwt";
import { bootstrapAdminFoundation } from "../modules/admin/admin.bootstrap";
import { ADMIN_USER_SELECT, adminUserDto } from "../modules/admin/admin-users.service";

async function read(response: Response) {
  return (await response.json()) as {
    data: {
      users: ReturnType<typeof adminUserDto>[];
      user: ReturnType<typeof adminUserDto>;
      pagination: { page: number; pageSize: number; total: number; totalPages: number };
    };
  };
}

const safeKeys = [
  "id",
  "email",
  "fullName",
  "role",
  "isActive",
  "createdAt",
  "lastLoginAt",
  "emailVerifiedAt",
  "onboardingCompleted",
  "subscriptionTier",
].sort();

test("A1 read-only user management: permissions, pagination and health firewall", async (t) => {
  await bootstrapAdminFoundation();
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/admin/users`;
  const prefix = `a1-${crypto.randomUUID()}`;
  const ids: string[] = [];
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.adminUserRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });
  async function create(suffix: string, role: UserRole, roleKey?: string, active = true) {
    const user = await prisma.user.create({
      data: {
        email: `${prefix}-${suffix}@example.com`,
        passwordHash: "A1-CREDENTIAL-SENTINEL",
        role,
        isActive: active,
        fullName: "A1 test",
      },
    });
    ids.push(user.id);
    if (roleKey) {
      const assignment = await prisma.adminRole.findUniqueOrThrow({ where: { key: roleKey } });
      await prisma.adminUserRole.create({ data: { userId: user.id, roleId: assignment.id } });
    }
    return { user, token: signAccessToken({ userId: user.id, email: user.email, role }) };
  }
  const normal = await create("normal", UserRole.USER);
  const limited = await create("limited", UserRole.ADMIN, "ADMIN_STAFF");
  const support = await create("support", UserRole.ADMIN, "SUPPORT");
  const finance = await create("finance", UserRole.ADMIN, "FINANCE");
  const owner = await create("owner", UserRole.ADMIN, "SUPER_ADMIN");
  const inactive = await create("inactive", UserRole.USER, undefined, false);
  await prisma.userProfile.create({
    data: {
      userId: normal.user.id,
      dateOfBirth: new Date("1990-01-01"),
      gender: "OTHER",
      heightCm: 170,
      currentWeightKg: 70,
      targetWeightKg: 65,
      activityLevel: "SEDENTARY",
      healthConditions: ["A1-HEALTH-SENTINEL"],
      allergies: ["A1-ALLERGY-SENTINEL"],
      dietaryPreference: "OMNIVORE",
      dailyWaterGoalMl: 2000,
    },
  });
  await prisma.refreshToken.create({
    data: {
      userId: normal.user.id,
      tokenHash: `${prefix}-TOKEN-SENTINEL`,
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  const get = (path: string, token = support.token) =>
    fetch(base + path, { headers: { authorization: `Bearer ${token}` } });
  const auditBefore = await prisma.adminAuditEvent.count({ where: { actorAdminId: { in: ids } } });

  await t.test("normal and unauthorized administrators denied on both endpoints", async () => {
    for (const token of [normal.token, limited.token])
      for (const path of ["", `/${normal.user.id}`])
        assert.equal((await get(path, token)).status, 403);
    assert.equal((await fetch(base)).status, 401);
    for (const token of [support.token, finance.token, owner.token])
      assert.equal((await get(`?search=${prefix}`, token)).status, 200);
  });
  await t.test("email, case-insensitive, exact ID and missing searches", async () => {
    for (const search of [normal.user.email, normal.user.email.toUpperCase(), normal.user.id]) {
      const response = await get(`?search=${encodeURIComponent(search)}`);
      assert.equal(response.status, 200);
      const body = await read(response);
      assert.equal(body.data.users.length, 1);
      assert.equal(body.data.users[0].id, normal.user.id);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    assert.equal((await read(await get(`?search=${prefix}-missing`))).data.users.length, 0);
  });
  await t.test("active filters, deterministic pages, bounds and validation", async () => {
    const active = (await read(await get(`?search=${prefix}&status=active`))).data;
    assert.equal(active.users.length, 5);
    assert.ok(active.users.every((u: { isActive: boolean }) => u.isActive));
    const off = (await read(await get(`?search=${prefix}&status=inactive`))).data;
    assert.deepEqual(
      off.users.map((u: { id: string }) => u.id),
      [inactive.user.id],
    );
    const one = (await read(await get(`?search=${prefix}&limit=2&page=1`))).data;
    const two = (await read(await get(`?search=${prefix}&limit=2&page=2`))).data;
    assert.deepEqual(one.pagination, { page: 1, pageSize: 2, total: 6, totalPages: 3 });
    assert.equal(two.users.length, 2);
    assert.ok(
      !one.users.some((u: { id: string }) => two.users.some((v: { id: string }) => u.id === v.id)),
    );
    assert.equal((await get("?limit=100")).status, 200);
    for (const q of [
      "limit=101",
      "limit=0",
      "page=0",
      "page=100001",
      "status=deleted",
      `search=${"x".repeat(255)}`,
    ])
      assert.equal((await get(`?${q}`)).status, 422);
  });
  await t.test("detail and explicit query/DTO firewall", async () => {
    assert.deepEqual(Object.keys(ADMIN_USER_SELECT).sort(), safeKeys);
    // Even a widened repository object cannot leak unknown fields through the DTO.
    const contaminated = {
      ...normal.user,
      token: "TOKEN-SENTINEL",
      profile: { healthConditions: ["HEALTH-SENTINEL"] },
    };
    assert.deepEqual(Object.keys(adminUserDto(contaminated)).sort(), safeKeys);
    for (const path of [`?search=${prefix}`, `/${normal.user.id}`]) {
      const res = await get(path);
      assert.equal(res.status, 200);
      const body = await read(res);
      const rows = body.data.users ?? [body.data.user];
      for (const row of rows) assert.deepEqual(Object.keys(row).sort(), safeKeys);
      assert.doesNotMatch(
        JSON.stringify(body),
        /passwordHash|refreshToken|tokenHash|profile|healthConditions|allergies|mealLogs|weightLogs|bloodTest|sleep|SENTINEL/i,
      );
    }
    assert.equal((await get(`/${crypto.randomUUID()}`)).status, 404);
    assert.equal((await get("/invalid-id")).status, 422);
    assert.equal(
      await prisma.adminAuditEvent.count({ where: { actorAdminId: { in: ids } } }),
      auditBefore,
    );
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: inactive.user.id } })).isActive,
      false,
    );
  });
  await t.test("production fails closed even for super administrator", async () => {
    const previous = env.DIEWISH_ENVIRONMENT;
    try {
      env.DIEWISH_ENVIRONMENT = "production";
      for (const path of ["", `/${normal.user.id}`])
        assert.equal((await get(path, owner.token)).status, 403);
    } finally {
      env.DIEWISH_ENVIRONMENT = previous;
    }
  });
});
