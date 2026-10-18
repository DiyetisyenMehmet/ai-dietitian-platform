import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import jwt from "jsonwebtoken";
import { externalLoginService } from "../modules/identity/external-login.service";
import { firebaseAuthProvider } from "../modules/identity/firebase-auth.provider";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { mailer } from "../lib/mailer";
import { accountService } from "../modules/account/account.service";
import { accountRepository } from "../modules/account/account.repository";
import { drainPasswordResetDeliveries } from "../modules/account/password-reset-delivery";
import { authService } from "../modules/auth/auth.service";
import { authRepository } from "../modules/auth/auth.repository";
import { hashPassword } from "../utils/password";
import { generateOpaqueToken, hashToken } from "../utils/jwt";

const oldPassword = "RecoveryOldPass123!";
const newPassword = "RecoveryNewPass456!";

test("normal user password recovery: HTTP, persistence, delivery and isolation", async (t) => {
  const ids: string[] = [];
  const originalEnv = { ...env };
  const delivered: { to: string; token: string }[] = [];
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  let ip = 0;
  async function post(path: string, body: unknown, source?: string) {
    const res = await fetch(base + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": source ?? `192.0.2.${++ip}`,
      },
      body: JSON.stringify(body),
    });
    return {
      status: res.status,
      body: (await res.json()) as {
        success: boolean;
        data?: { message: string };
        error: { code: string; message: string };
      },
      cookie: res.headers.get("set-cookie")?.split(";")[0],
    };
  }
  async function user(role: "USER" | "ADMIN" = "USER", isActive = true) {
    const u = await prisma.user.create({
      data: {
        email: `recovery.${crypto.randomUUID()}@example.com`,
        passwordHash: await hashPassword(oldPassword),
        role,
        isActive,
      },
    });
    ids.push(u.id);
    return u;
  }
  async function token(
    userId: string,
    expiresAt = new Date(Date.now() + 60_000),
    type: "PASSWORD_RESET" | "EMAIL_VERIFICATION" = "PASSWORD_RESET",
  ) {
    const raw = generateOpaqueToken();
    const row = await prisma.accountToken.create({
      data: { userId, tokenHash: hashToken(raw), type, expiresAt },
    });
    return { raw, row };
  }
  async function waitDelivery(userId: string) {
    for (let i = 0; i < 100; i++) {
      const row = await prisma.passwordResetDelivery.findUnique({ where: { userId } });
      if (row?.completedAt || (row?.attempts && !row.leaseId)) return row;
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.fail("Synthetic delivery did not finish");
  }
  t.after(async () => {
    Object.assign(env, originalEnv);
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });
  const normal = await user();
  const other = await user();
  const admin = await user("ADMIN");
  const inactive = await user("USER", false);

  await t.test("missing SMTP configuration is an honest global 503", async () => {
    env.SMTP_HOST = "";
    const known = await post("/auth/forgot-password", { email: normal.email });
    const unknown = await post("/auth/forgot-password", { email: "unknown@example.com" });
    assert.equal(known.status, 503);
    assert.equal(unknown.status, 503);
    assert.equal(known.body.error.code, "EMAIL_DELIVERY_UNAVAILABLE");
    assert.equal(known.body.error.message, unknown.body.error.message);
  });
  Object.assign(env, {
    SMTP_HOST: "smtp.example.invalid",
    SMTP_USER: "synthetic",
    SMTP_PASSWORD: "synthetic",
    SMTP_FROM: "no-reply@example.com",
  });
  t.mock.method(mailer, "sendPasswordReset", async (to: string, raw: string) => {
    delivered.push({ to, token: raw });
  });

  await t.test(
    "canonical HTTP endpoint queues and delivers; old and new aliases share one cooldown",
    async () => {
      const known = await post("/auth/forgot-password", {
        email: ` ${normal.email.toUpperCase()} `,
      });
      const unknown = await post("/auth/forgot-password", { email: "unknown@example.com" });
      const excluded = await post("/account/password/forgot", { email: admin.email });
      const disabled = await post("/account/password/forgot", { email: inactive.email });
      assert.equal(known.status, 200);
      assert.deepEqual(known.body, unknown.body);
      assert.deepEqual(known.body, excluded.body);
      assert.deepEqual(known.body, disabled.body);
      await waitDelivery(normal.id);
      assert.equal(delivered.length, 1);
      assert.equal(delivered[0]!.to, normal.email);
      await post("/account/password/forgot", { email: normal.email });
      await drainPasswordResetDeliveries();
      assert.equal(delivered.length, 1);
      const stored = await prisma.accountToken.findFirstOrThrow({
        where: { userId: normal.id, type: "PASSWORD_RESET", usedAt: null },
      });
      assert.equal(stored.tokenHash, hashToken(delivered[0]!.token));
      assert.notEqual(stored.tokenHash, delivered[0]!.token);
      assert.equal(
        await prisma.passwordResetDelivery.count({
          where: { userId: { in: [admin.id, inactive.id] } },
        }),
        0,
      );
    },
  );

  await t.test(
    "equivalent and bcrypt-truncated passwords cannot count as a successful reset",
    async () => {
      const same = await post("/auth/reset-password", {
        token: delivered[0]!.token,
        newPassword: oldPassword,
      });
      assert.equal(same.status, 422);
      const tooLong = await post("/auth/reset-password", {
        token: delivered[0]!.token,
        newPassword: "Strong1" + "ş".repeat(40),
      });
      assert.equal(tooLong.status, 422);
      assert.equal(
        (
          await prisma.accountToken.findFirstOrThrow({
            where: { tokenHash: hashToken(delivered[0]!.token) },
          })
        ).usedAt,
        null,
      );
    },
  );

  await t.test(
    "reset changes the actual login password and immediately revokes old access/refresh sessions",
    async () => {
      const before = await authService.login({ email: normal.email, password: oldPassword }, {});
      const snapshot = await authRepository.findUserById(normal.id);
      const reset = await post("/auth/reset-password", { token: delivered[0]!.token, newPassword });
      assert.equal(reset.status, 200);
      assert.equal(
        (await post("/auth/login", { email: normal.email, password: oldPassword })).status,
        401,
      );
      assert.equal(
        (await post("/auth/login", { email: normal.email, password: newPassword })).status,
        200,
      );
      assert.equal(
        (
          await fetch(base + "/auth/me", {
            headers: { authorization: `Bearer ${before.tokens.accessToken}` },
          })
        ).status,
        401,
      );
      await assert.rejects(authService.refresh(before.refreshToken, {}));
      await assert.rejects(authService.login({ email: normal.email, password: oldPassword }, {}));
      // An in-flight password login that read the old hash cannot create a fresh surviving refresh token.
      await assert.rejects(
        authRepository.createRefreshToken({
          id: crypto.randomUUID(),
          userId: normal.id,
          tokenHash: "synthetic-stale-login",
          expiresAt: new Date(Date.now() + 60_000),
          authVersion: snapshot!.authVersion,
        }),
      );
      assert.equal(
        (
          await post("/auth/reset-password", {
            token: delivered[0]!.token,
            newPassword: oldPassword,
          })
        ).status,
        400,
      );
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).authVersion,
        0,
      );
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).authVersion,
        0,
      );
    },
  );

  await t.test(
    "Firebase password identity cannot bypass a local reset, while Google sign-in stays available",
    async () => {
      t.mock.method(firebaseAuthProvider, "verifyIdToken", async () => ({
        uid: normal.id,
        email: normal.email,
        emailVerified: true,
        phoneNumber: null,
        displayName: null,
        providers: ["google.com", "password"],
      }));
      const firebaseToken = (provider: string) =>
        jwt.sign(
          { sub: normal.id, firebase: { sign_in_provider: provider } },
          "synthetic-provider-fixture",
        );
      await assert.rejects(externalLoginService.login(firebaseToken("password"), {}));
      const google = await externalLoginService.login(firebaseToken("google.com"), {});
      assert.equal(google.user.id, normal.id);
      assert.equal(
        (
          await fetch(base + "/auth/me", {
            headers: { authorization: `Bearer ${google.tokens.accessToken}` },
          })
        ).status,
        200,
      );
    },
  );

  await t.test(
    "invalid, expired, wrong-purpose, inactive and admin links are rejected",
    async () => {
      const expired = await token(normal.id, new Date(Date.now() - 1));
      const wrong = await token(normal.id, undefined, "EMAIL_VERIFICATION");
      const adminLink = await token(admin.id);
      const inactiveLink = await token(inactive.id);
      for (const raw of [
        "invalid-token",
        expired.raw,
        wrong.raw,
        adminLink.raw,
        inactiveLink.raw,
      ]) {
        const result = await post("/auth/reset-password", { token: raw, newPassword });
        assert.equal(result.status, 400);
        assert.equal(result.body.error.code, "TOKEN_INVALID");
      }
      const late = await token(other.id, new Date(Date.now() - 1));
      assert.equal(
        await accountRepository.consumeTokenAndResetPassword(
          late.row.id,
          other.id,
          "never-applied",
        ),
        false,
      );
      assert.equal(
        (await post("/auth/reset-password", { token: late.raw, password: newPassword })).status,
        422,
      );
      assert.equal(
        (await post("/auth/reset-password", { token: late.raw, newPassword: "weak" })).status,
        422,
      );
    },
  );

  await t.test(
    "concurrent reset of one link succeeds exactly once; newest issuance invalidates predecessors",
    async () => {
      const first = await token(other.id);
      const result = await Promise.allSettled([
        accountService.resetPassword(first.raw, newPassword, {}),
        accountService.resetPassword(first.raw, newPassword, {}),
      ]);
      assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
      const stale = await token(other.id);
      await accountRepository.issueToken({
        id: crypto.randomUUID(),
        userId: other.id,
        type: "PASSWORD_RESET",
        tokenHash: hashToken(generateOpaqueToken()),
        expiresAt: new Date(Date.now() + 60_000),
      });
      await assert.rejects(accountService.resetPassword(stale.raw, oldPassword, {}));
    },
  );

  await t.test(
    "SMTP failure is private, invalidates its token and leaves bounded retry metadata",
    async () => {
      t.mock.method(mailer, "sendPasswordReset", async () => {
        throw new Error("synthetic SMTP rejection");
      });
      const response = await post("/auth/forgot-password", { email: other.email });
      assert.equal(response.status, 200);
      const pending = await waitDelivery(other.id);
      assert.equal(pending?.completedAt, null);
      assert.equal(pending?.attempts, 1);
      assert.equal(
        await prisma.accountToken.count({
          where: { userId: other.id, type: "PASSWORD_RESET", usedAt: null },
        }),
        0,
      );
      await prisma.passwordResetDelivery.update({
        where: { userId: other.id },
        data: { attempts: 3 },
      });
      await drainPasswordResetDeliveries();
      assert.equal(
        (await prisma.passwordResetDelivery.findUniqueOrThrow({ where: { userId: other.id } }))
          .attempts,
        3,
      );
    },
  );

  await t.test(
    "forgot rate budget is shared across aliases and reset has independent budget",
    async () => {
      for (let i = 0; i < 5; i++)
        assert.equal(
          (
            await post(
              i % 2 ? "/account/password/forgot" : "/auth/forgot-password",
              { email: "unknown@example.com" },
              "198.51.100.1",
            )
          ).status,
          200,
        );
      assert.equal(
        (await post("/auth/forgot-password", { email: "unknown@example.com" }, "198.51.100.1"))
          .status,
        429,
      );
      assert.equal(
        (await post("/auth/reset-password", { token: "invalid", newPassword }, "198.51.100.1"))
          .status,
        400,
      );
    },
  );
});
