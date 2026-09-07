import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, beforeEach, test } from "node:test";

import { AccountTokenType } from "@prisma/client";

import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { accountRepository } from "../src/modules/account/account.repository";
import { accountService } from "../src/modules/account/account.service";
import { authService } from "../src/modules/auth/auth.service";
import { ApiError } from "../src/utils/api-error";
import { hashToken } from "../src/utils/jwt";
import { hashPassword, verifyPassword } from "../src/utils/password";

const context = { userAgent: "account-test", ipAddress: "127.0.0.1" };
const password = "StrongPass123";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

async function clean(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
}

async function user(email: string, rawPassword = password): Promise<string> {
  const row = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(rawPassword) },
  });
  return row.id;
}

async function accountToken(
  userId: string,
  type: AccountTokenType,
  raw: string,
  expiresAt = new Date(Date.now() + 60_000),
): Promise<void> {
  await prisma.accountToken.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      type,
      tokenHash: hashToken(raw),
      expiresAt,
    },
  });
}

function isApiError(error: unknown, status: number): boolean {
  return error instanceof ApiError && error.statusCode === status;
}

beforeEach(clean);
after(async () => {
  await clean();
  await prisma.$disconnect();
});

test("email verification token is race-safe and single-use", async () => {
  const userId = await user("verify@example.com");
  const raw = "verification-token";
  await accountToken(userId, AccountTokenType.EMAIL_VERIFICATION, raw);

  const results = await Promise.allSettled([
    accountService.verifyEmail(raw, context),
    accountService.verifyEmail(raw, context),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);

  const updated = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert.ok(updated.emailVerifiedAt);
  const token = await prisma.accountToken.findFirstOrThrow({ where: { userId } });
  assert.ok(token.usedAt);
});

test("repository claim refuses a token that expired before the atomic consume", async () => {
  const userId = await user("verify-expired@example.com");
  const raw = "expired-token";
  await accountToken(
    userId,
    AccountTokenType.EMAIL_VERIFICATION,
    raw,
    new Date(Date.now() - 1_000),
  );
  const row = await prisma.accountToken.findFirstOrThrow({ where: { userId } });
  const claimed = await accountRepository.consumeTokenAndVerifyEmail(row.id, userId, new Date());
  assert.equal(claimed, false);
});

test("password reset is single-use and revokes every active refresh session", async () => {
  const registered = await authService.register(
    { email: "reset@example.com", password, fullName: "Reset User" },
    context,
  );
  const raw = "password-reset-token";
  await accountToken(registered.user.id, AccountTokenType.PASSWORD_RESET, raw);

  const results = await Promise.allSettled([
    accountService.resetPassword(raw, "NewStrongPass123", context),
    accountService.resetPassword(raw, "NewStrongPass123", context),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);

  const updated = await prisma.user.findUniqueOrThrow({ where: { id: registered.user.id } });
  assert.equal(await verifyPassword("NewStrongPass123", updated.passwordHash), true);
  const activeSessions = await prisma.refreshToken.count({
    where: { userId: registered.user.id, revokedAt: null },
  });
  assert.equal(activeSessions, 0);
});

test("password change verifies current password and revokes sessions", async () => {
  const registered = await authService.register(
    { email: "change@example.com", password, fullName: "Change User" },
    context,
  );

  await assert.rejects(
    accountService.changePassword(registered.user.id, "WrongPass123", "NewStrongPass123", context),
    (error: unknown) => isApiError(error, 401),
  );

  await accountService.changePassword(
    registered.user.id,
    password,
    "NewStrongPass123",
    context,
  );
  assert.equal(
    await prisma.refreshToken.count({
      where: { userId: registered.user.id, revokedAt: null },
    }),
    0,
  );
});

test("deletion request can be canceled and permanent deletion cannot bypass grace period", async () => {
  const registered = await authService.register(
    { email: "delete@example.com", password, fullName: "Delete User" },
    context,
  );

  await accountService.requestAccountDeletion(registered.user.id, password, context);
  let current = await prisma.user.findUniqueOrThrow({ where: { id: registered.user.id } });
  assert.ok(current.deletionRequestedAt);
  assert.equal(
    await prisma.refreshToken.count({ where: { userId: registered.user.id, revokedAt: null } }),
    0,
  );

  assert.ok(env.ACCOUNT_DELETION_GRACE_DAYS > 0, "test expects the default non-zero grace period");
  await assert.rejects(
    accountService.deleteAccountPermanently(registered.user.id, password, context),
    (error: unknown) => isApiError(error, 409),
  );

  await accountService.cancelAccountDeletion(registered.user.id, context);
  current = await prisma.user.findUniqueOrThrow({ where: { id: registered.user.id } });
  assert.equal(current.deletionRequestedAt, null);

  await assert.rejects(
    accountService.deleteAccountPermanently(registered.user.id, password, context),
    (error: unknown) => isApiError(error, 400),
  );
});

test("eligible permanent deletion retains only minimized audit metadata", async () => {
  const userId = await user("purge@example.com");
  await accountService.requestAccountDeletion(userId, password, context);
  await prisma.user.update({
    where: { id: userId },
    data: {
      deletionRequestedAt: new Date(
        Date.now() - (env.ACCOUNT_DELETION_GRACE_DAYS * MS_PER_DAY + 1_000),
      ),
    },
  });

  await accountService.deleteAccountPermanently(userId, password, context);
  assert.equal(await prisma.user.count({ where: { id: userId } }), 0);

  const audit = await prisma.auditLog.findFirstOrThrow({
    where: { userId, action: "ACCOUNT_DELETED" },
    orderBy: { createdAt: "desc" },
  });
  assert.doesNotMatch(JSON.stringify(audit.metadata), /purge@example\.com/i);
});
