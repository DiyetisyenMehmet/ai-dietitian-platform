import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { mailer } from "../lib/mailer";
import { accountService } from "../modules/account/account.service";
import { authService } from "../modules/auth/auth.service";
import { hashPassword } from "../utils/password";

test("serving-source backport: request-based recovery and login survive the pause with synthetic email", async (t) => {
  const previous = { ...env }; t.after(() => Object.assign(env, previous));
  Object.assign(env, { DIEWISH_ENVIRONMENT: "staging", STAGING_AUTOMATION_ENABLED: false });
  const user = await prisma.user.create({ data: { email: `${crypto.randomUUID()}@example.invalid`, passwordHash: await hashPassword("OldPassword123!") } });
  t.after(async () => { await prisma.auditLog.deleteMany({ where: { userId: user.id } }); await prisma.user.delete({ where: { id: user.id } }); await prisma.$disconnect(); });
  let calls = 0; let resetToken = "";
  t.mock.method(mailer, "sendPasswordReset", async (to: string, token: string) => { assert.equal(to, user.email); calls++; resetToken = token; });
  await accountService.forgotPassword(user.email, {});
  assert.equal(calls, 1); assert.ok(resetToken);
  await accountService.forgotPassword("missing@example.invalid", {}); assert.equal(calls, 1);
  await accountService.resetPassword(resetToken, "NewPassword123!", {});
  await assert.rejects(authService.login({ email: user.email, password: "OldPassword123!" }, {}));
  assert.equal((await authService.login({ email: user.email, password: "NewPassword123!" }, {})).user.id, user.id);
  await assert.rejects(accountService.resetPassword(resetToken, "OtherPassword123!", {}));
});
