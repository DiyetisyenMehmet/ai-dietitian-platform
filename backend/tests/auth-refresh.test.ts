import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { prisma } from "../src/lib/prisma";
import { authService } from "../src/modules/auth/auth.service";
import { ApiError } from "../src/utils/api-error";
import { hashToken, verifyRefreshToken } from "../src/utils/jwt";

const context = { userAgent: "diewish-test-agent", ipAddress: "127.0.0.1" };
const password = "StrongPass123";

async function cleanDatabase(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.healthCheck.deleteMany();
}

async function register(email: string) {
  return authService.register({ email, password, fullName: "Test User" }, context);
}

async function expectApiError(
  operation: Promise<unknown>,
  statusCode: number,
  messageIncludes?: string,
): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    if (!(error instanceof ApiError)) return false;
    assert.equal(error.statusCode, statusCode);
    if (messageIncludes) assert.match(error.message, new RegExp(messageIncludes, "i"));
    return true;
  });
}

beforeEach(cleanDatabase);
after(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

test("register, duplicate register, login and wrong password behave deterministically", async () => {
  const first = await register("auth-basic@example.com");
  assert.equal(first.user.email, "auth-basic@example.com");
  assert.ok(first.tokens.accessToken);
  assert.ok(first.tokens.refreshToken);

  await expectApiError(register("auth-basic@example.com"), 409, "already exists");

  const login = await authService.login(
    { email: "auth-basic@example.com", password },
    context,
  );
  assert.equal(login.user.id, first.user.id);

  await expectApiError(
    authService.login({ email: "auth-basic@example.com", password: "WrongPassword123" }, context),
    401,
    "invalid email or password",
  );
});

test("inactive user cannot log in", async () => {
  const created = await register("inactive@example.com");
  await prisma.user.update({ where: { id: created.user.id }, data: { isActive: false } });

  await expectApiError(
    authService.login({ email: "inactive@example.com", password }, context),
    403,
    "deactivated",
  );
});

test("normal refresh rotates old token and leaves exactly one active successor", async () => {
  const created = await register("refresh-normal@example.com");
  const oldClaims = verifyRefreshToken(created.tokens.refreshToken);

  const rotated = await authService.refresh(created.tokens.refreshToken, context);
  const newClaims = verifyRefreshToken(rotated.tokens.refreshToken);
  assert.notEqual(newClaims.jti, oldClaims.jti);

  const oldRow = await prisma.refreshToken.findUniqueOrThrow({ where: { id: oldClaims.jti } });
  assert.ok(oldRow.revokedAt);
  assert.equal(oldRow.replacedById, newClaims.jti);

  const active = await prisma.refreshToken.findMany({
    where: { userId: created.user.id, revokedAt: null },
  });
  assert.equal(active.length, 1);
  assert.equal(active[0]?.id, newClaims.jti);
});

test("concurrent refresh requests produce one success and never two successors", async () => {
  const created = await register("refresh-race@example.com");
  const oldClaims = verifyRefreshToken(created.tokens.refreshToken);

  const results = await Promise.allSettled([
    authService.refresh(created.tokens.refreshToken, context),
    authService.refresh(created.tokens.refreshToken, context),
  ]);

  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);

  const oldRow = await prisma.refreshToken.findUniqueOrThrow({ where: { id: oldClaims.jti } });
  assert.ok(oldRow.revokedAt);
  assert.ok(oldRow.replacedById);

  const allRows = await prisma.refreshToken.findMany({ where: { userId: created.user.id } });
  assert.equal(allRows.length, 2, "old token + exactly one successor must exist");

  const activeRows = allRows.filter((row) => row.revokedAt === null);
  assert.equal(activeRows.length, 1, "concurrent loser must not revoke the legitimate successor");
  assert.equal(activeRows[0]?.id, oldRow.replacedById);
});

test("reusing an older revoked refresh token triggers user-wide session revocation", async () => {
  const created = await register("refresh-reuse@example.com");
  const oldClaims = verifyRefreshToken(created.tokens.refreshToken);
  const rotated = await authService.refresh(created.tokens.refreshToken, context);
  const successorClaims = verifyRefreshToken(rotated.tokens.refreshToken);

  // Move the old revocation outside the very small in-flight concurrency grace.
  await prisma.refreshToken.update({
    where: { id: oldClaims.jti },
    data: { revokedAt: new Date(Date.now() - 10_000) },
  });

  await expectApiError(
    authService.refresh(created.tokens.refreshToken, context),
    401,
    "already been used",
  );

  const successor = await prisma.refreshToken.findUniqueOrThrow({
    where: { id: successorClaims.jti },
  });
  assert.ok(successor.revokedAt, "reuse response must revoke the active successor/session");
});

test("DB-expired refresh token is rejected without creating a successor", async () => {
  const created = await register("refresh-expired@example.com");
  const claims = verifyRefreshToken(created.tokens.refreshToken);
  await prisma.refreshToken.update({
    where: { id: claims.jti },
    data: { expiresAt: new Date(Date.now() - 1_000) },
  });

  await expectApiError(authService.refresh(created.tokens.refreshToken, context), 401);
  assert.equal(await prisma.refreshToken.count({ where: { userId: created.user.id } }), 1);
});

test("refresh hash mismatch is rejected even when the JWT itself is valid", async () => {
  const created = await register("refresh-hash@example.com");
  const claims = verifyRefreshToken(created.tokens.refreshToken);
  await prisma.refreshToken.update({
    where: { id: claims.jti },
    data: { tokenHash: hashToken("different-raw-token") },
  });

  await expectApiError(authService.refresh(created.tokens.refreshToken, context), 401);
  assert.equal(await prisma.refreshToken.count({ where: { userId: created.user.id } }), 1);
});

test("tampered refresh JWT is rejected", async () => {
  const created = await register("refresh-tampered@example.com");
  const raw = created.tokens.refreshToken;
  const tampered = `${raw.slice(0, -1)}${raw.endsWith("a") ? "b" : "a"}`;

  await expectApiError(authService.refresh(tampered, context), 401);
});

test("logout is idempotent and revokes the refresh record", async () => {
  const created = await register("logout@example.com");
  const claims = verifyRefreshToken(created.tokens.refreshToken);

  await authService.logout(created.tokens.refreshToken);
  await authService.logout(created.tokens.refreshToken);

  const row = await prisma.refreshToken.findUniqueOrThrow({ where: { id: claims.jti } });
  assert.ok(row.revokedAt);
});

test("invalid refresh JWT is rejected", async () => {
  await expectApiError(authService.refresh("not-a-jwt", context), 401);
});
