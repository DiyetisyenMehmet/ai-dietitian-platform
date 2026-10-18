import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { createApp } from "../app";
import { ApiError } from "../utils/api-error";
import { hashPassword, verifyPassword } from "../utils/password";
import { hashToken } from "../utils/jwt";
import { accountRepository } from "../modules/account/account.repository";
import { accountService } from "../modules/account/account.service";
import { authRepository } from "../modules/auth/auth.repository";
import { authService } from "../modules/auth/auth.service";
import {
  firebaseAuthProvider,
  type VerifiedExternalIdentity,
} from "../modules/identity/firebase-auth.provider";
import { smsRecoveryService as recovery } from "../modules/identity/sms-recovery.service";
import { phonePasswordService } from "../modules/identity/phone-password.service";
import { proofEventHash } from "../modules/identity/safe-linking.policy";
const oldPass = "RecoveryOldPassword123",
  newPass = "RecoveryNewPassword456",
  otherPass = "ConcurrentPassword789";
const input = (password = newPass) => ({ newPassword: password, passwordConfirmation: password });
const rejected =
  (code = "SMS_RECOVERY_INVALID") =>
  (error: unknown) =>
    error instanceof ApiError && error.code === code;

test("A4 SMS password recovery: only new behavior on accepted security foundation", async (t) => {
  assert.equal(env.PHONE_SMS_RECOVERY_ENABLED, false);
  const initial = [
    env.ACCOUNT_SAFE_LINKING_ENABLED,
    env.PHONE_PASSWORD_AUTH_ENABLED,
    env.PHONE_SMS_RECOVERY_ENABLED,
  ];
  const originalVerify = firebaseAuthProvider.verifyIdToken,
    originalWrite = accountRepository.changePassword;
  const proofs = new Map<string, VerifiedExternalIdentity>(),
    ids: string[] = [],
    numbers: string[] = [];
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  firebaseAuthProvider.verifyIdToken = async (token) => {
    const p = proofs.get(token);
    if (!p) throw ApiError.unauthorized("Invalid synthetic proof");
    return p;
  };
  const number = () => {
    const n = `+905${crypto.randomInt(100000000, 999999999)}`;
    numbers.push(n);
    return n;
  };
  async function user(n = number(), extra: Record<string, unknown> = {}, binding = true) {
    const u = await prisma.user.create({
      data: {
        email: `phone.${n.slice(1)}@phone.diewish.invalid`,
        passwordHash: await hashPassword(oldPass),
        hasUsablePassword: true,
        ...extra,
      },
    });
    ids.push(u.id);
    if (binding)
      await prisma.accountIdentity.create({
        data: {
          userId: u.id,
          kind: "PHONE",
          identifier: n,
          verifiedAt: new Date(Date.now() - 1000),
        },
      });
    return { ...u, number: n };
  }
  function sms(n: string, overrides: Partial<VerifiedExternalIdentity> = {}) {
    const token = crypto.randomBytes(32).toString("base64url");
    proofs.set(token, {
      uid: crypto.randomUUID(),
      phoneNumber: n,
      phoneAuthenticationVerified: true,
      signInProvider: "phone",
      providers: ["phone"],
      email: null,
      emailVerified: false,
      displayName: null,
      authTime: Math.floor(Date.now() / 1000),
      ...overrides,
    });
    return token;
  }
  const begin = (n: string, old?: string) => recovery.begin({ phoneNumber: n }, old);
  async function verified(u: Awaited<ReturnType<typeof user>>) {
    const op = await begin(u.number);
    const token = sms(u.number);
    await recovery.verify(op.secret, { idToken: token });
    return { ...op, token };
  }
  async function post(
    path: string,
    body: unknown,
    cookie?: string,
    extra: Record<string, string> = {},
  ) {
    return fetch(base + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-diewish-phone-setup": "1",
        ...(cookie ? { cookie } : {}),
        ...extra,
      },
      body: JSON.stringify(body),
    });
  }
  const cookie = (secret: string) => `diewish_sms_recovery=${secret}`;
  const saved = (id: string) => prisma.user.findUniqueOrThrow({ where: { id } });
  t.after(async () => {
    [
      env.ACCOUNT_SAFE_LINKING_ENABLED,
      env.PHONE_PASSWORD_AUTH_ENABLED,
      env.PHONE_SMS_RECOVERY_ENABLED,
    ] = initial;
    firebaseAuthProvider.verifyIdToken = originalVerify;
    accountRepository.changePassword = originalWrite;
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.phonePasswordChallenge.deleteMany({ where: { phoneNumber: { in: numbers } } });
    await prisma.$disconnect();
  });
  await t.test(
    "all three gates required; disabled response before any proof handling",
    async () => {
      for (const flags of [
        [false, true, true],
        [true, false, true],
        [true, true, false],
      ]) {
        [
          env.ACCOUNT_SAFE_LINKING_ENABLED,
          env.PHONE_PASSWORD_AUTH_ENABLED,
          env.PHONE_SMS_RECOVERY_ENABLED,
        ] = flags;
        assert.equal((await post("/identity/sms-recovery/begin", {})).status, 503);
      }
      env.ACCOUNT_SAFE_LINKING_ENABLED =
        env.PHONE_PASSWORD_AUTH_ENABLED =
        env.PHONE_SMS_RECOVERY_ENABLED =
          true;
    },
  );
  await t.test(
    "begin does not enumerate account eligibility or create users/sessions; cookie is hashed and scoped",
    async () => {
      const n = number();
      const before = await prisma.user.count();
      const response = await post("/identity/sms-recovery/begin", { phoneNumber: n });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const header = response.headers.get("set-cookie")!;
      assert.match(header, /HttpOnly/);
      assert.match(header, /Path=\/api\/identity\/sms-recovery/);
      const raw = header.split(";")[0]!.slice("diewish_sms_recovery=".length);
      const body = (await response.json()) as { data: { expiresAt: string } };
      assert.deepEqual(Object.keys(body.data), ["expiresAt"]);
      const stored = await prisma.phonePasswordChallenge.findUniqueOrThrow({
        where: { secretHash: hashToken(raw) },
      });
      assert.equal(stored.expectedUserId, null);
      assert.equal(stored.proofEventHash, null);
      assert.ok(!JSON.stringify(stored).includes(raw));
      assert.equal(await prisma.user.count(), before);
      assert.ok(Date.parse(body.data.expiresAt) <= Date.now() + 300000);
      assert.equal((await recovery.status(raw)).verified, false);
      assert.equal(
        (await recovery.status(crypto.randomBytes(32).toString("base64url"))).pending,
        false,
      );
    },
  );
  await t.test("actual fresh SMS must match requested phone and postdate the intent", async () => {
    const u = await user();
    for (const override of [
      { signInProvider: "google.com" },
      { phoneAuthenticationVerified: false },
      { phoneNumber: number() },
      { authTime: Math.floor(Date.now() / 1000) - 301 },
      { authTime: Math.floor(Date.now() / 1000) - 10 },
      { authTime: Math.floor(Date.now() / 1000) + 60 },
    ]) {
      const op = await begin(number()); // each budget isolated; use owner number below
      await prisma.phonePasswordChallenge.update({
        where: { secretHash: hashToken(op.secret) },
        data: { phoneNumber: u.number },
      });
      await assert.rejects(
        recovery.verify(op.secret, { idToken: sms(u.number, override) }),
        rejected(),
      );
    }
    assert.ok(await verifyPassword(oldPass, (await saved(u.id)).passwordHash));
  });
  await t.test(
    "unverified, unknown, passwordless, suspended, deleting and Admin accounts fail without mutation",
    async () => {
      const cases = [
        await user(undefined, {}, false),
        await user(undefined, { hasUsablePassword: false }),
        await user(undefined, { hasUsablePassword: null }),
        await user(undefined, { isActive: false }),
        await user(undefined, { isActive: false, deactivatedAt: new Date() }),
        await user(undefined, { deletionRequestedAt: new Date() }),
        await user(undefined, { role: "ADMIN" }),
      ];
      const unknown = number();
      const missing = await begin(unknown);
      await assert.rejects(recovery.verify(missing.secret, { idToken: sms(unknown) }), rejected());
      for (const u of cases) {
        const before = await saved(u.id),
          op = await begin(u.number);
        await assert.rejects(recovery.verify(op.secret, { idToken: sms(u.number) }), rejected());
        assert.deepEqual(await saved(u.id), before);
      }
    },
  );
  await t.test(
    "verification issues no session and cannot be used as A3 registration or initial-password proof",
    async () => {
      const u = await user(),
        op = await verified(u);
      assert.equal((await recovery.status(op.secret)).verified, true);
      assert.equal(await prisma.refreshToken.count({ where: { userId: u.id } }), 0);
      await assert.rejects(
        phonePasswordService.complete(
          op.secret,
          { password: newPass, passwordConfirmation: newPass },
          {},
        ),
      );
      await phonePasswordService.cancel(op.secret); // different purpose cannot consume recovery
      assert.equal((await recovery.status(op.secret)).verified, true);
      assert.equal((await phonePasswordService.status(op.secret)).pending, false);
      await assert.rejects(recovery.complete(undefined, input()), rejected());
    },
  );
  await t.test(
    "same account/data preserved; old access/refresh/password rejected; one new password for email and phone",
    async () => {
      const u = await user(undefined, {
        email: `a4.${crypto.randomUUID()}@example.com`,
        emailVerifiedAt: new Date(),
        onboardingCompleted: true,
      });
      await prisma.accountIdentity.create({
        data: {
          userId: u.id,
          kind: "GOOGLE",
          identifier: `a4-google-${crypto.randomUUID()}`,
          verifiedAt: new Date(),
        },
      });
      await prisma.weightLog.create({ data: { userId: u.id, weightKg: 71 } });
      await prisma.chatConversation.create({
        data: {
          userId: u.id,
          title: "preserved Coach",
          messages: { create: { role: "USER", content: "synthetic preserved message" } },
        },
      });
      await prisma.subscription.create({
        data: { userId: u.id, tier: "PREMIUM", status: "ACTIVE", provider: "IYZICO" },
      });
      const snapshot = () =>
        prisma.user.findUniqueOrThrow({
          where: { id: u.id },
          select: {
            id: true,
            email: true,
            emailVerifiedAt: true,
            onboardingCompleted: true,
            accountIdentities: true,
            weightLogs: true,
            chatConversations: { include: { messages: true } },
            subscriptions: true,
          },
        });
      const before = await snapshot(),
        session = await authService.login({ email: u.email, password: oldPass }, {});
      const op = await verified(u);
      assert.deepEqual(await recovery.complete(op.secret, input()), { reset: true });
      assert.deepEqual(await snapshot(), before);
      assert.equal((await saved(u.id)).authVersion, u.authVersion + 1);
      assert.equal(
        (
          await fetch(base + "/auth/me", {
            headers: { authorization: `Bearer ${session.tokens.accessToken}` },
          })
        ).status,
        401,
      );
      await assert.rejects(authService.refresh(session.refreshToken, {}));
      await assert.rejects(authService.login({ email: u.email, password: oldPass }, {}));
      assert.equal(
        (await authService.login({ email: u.email, password: newPass }, {})).user.id,
        u.id,
      );
      assert.equal(
        (await phonePasswordService.login({ phoneNumber: u.number, password: newPass }, {})).user
          .id,
        u.id,
      );
      await assert.rejects(
        authRepository.createRefreshToken({
          id: crypto.randomUUID(),
          userId: u.id,
          tokenHash: "synthetic-stale-A4-login",
          expiresAt: new Date(Date.now() + 60000),
          authVersion: u.authVersion,
        }),
      );
    },
  );
  await t.test(
    "strict HTTP password policy and cookie/origin binding prevent target substitution",
    async () => {
      const u = await user(),
        op = await verified(u);
      for (const body of [
        input("weak"),
        { newPassword: newPass, passwordConfirmation: oldPass },
        input("Aa1" + "ü".repeat(36)),
        { ...input(), userId: u.id },
        { ...input(), phoneNumber: number() },
      ])
        assert.equal(
          (await post("/identity/sms-recovery/complete", body, cookie(op.secret))).status,
          422,
        );
      assert.equal(
        (
          await post("/identity/sms-recovery/complete", input(), cookie(op.secret), {
            origin: "https://attacker.invalid",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await post("/identity/sms-recovery/complete", input(), cookie(op.secret), {
            "x-diewish-phone-setup": "",
          })
        ).status,
        403,
      );
      assert.equal((await post("/identity/sms-recovery/complete", input())).status, 400);
      const done = await post("/identity/sms-recovery/complete", input(), cookie(op.secret));
      assert.equal(done.status, 200);
      assert.match(done.headers.get("set-cookie")!, /Path=\/api\/auth/);
      assert.doesNotMatch(done.headers.get("set-cookie")!, /Bearer/);
      const body = (await done.json()) as { data: unknown };
      assert.deepEqual(body.data, { reset: true });
    },
  );
  await t.test(
    "same proof cannot complete twice or create two sessions under concurrent submits",
    async () => {
      const u = await user(),
        op = await verified(u);
      const done = await Promise.allSettled([
        recovery.complete(op.secret, input()),
        recovery.complete(op.secret, input(otherPass)),
      ]);
      assert.equal(done.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal((await saved(u.id)).authVersion, u.authVersion + 1);
      assert.equal(await prisma.refreshToken.count({ where: { userId: u.id } }), 0);
    },
  );
  await t.test(
    "two independent proofs for same owner: winner invalidates the other, no stale overwrite",
    async () => {
      const u = await user(),
        first = await verified(u),
        second = await verified(u);
      await recovery.complete(first.secret, input());
      await assert.rejects(recovery.complete(second.secret, input(otherPass)), rejected());
      assert.ok(await verifyPassword(newPass, (await saved(u.id)).passwordHash));
    },
  );
  await t.test("expiry, cancellation and wrong cookie fail without changing password", async () => {
    const u = await user(),
      op = await verified(u);
    await prisma.phonePasswordChallenge.update({
      where: { secretHash: hashToken(op.secret) },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await assert.rejects(recovery.complete(op.secret, input()), rejected());
    const second = await verified(u);
    await recovery.cancel(second.secret);
    await assert.rejects(recovery.complete(second.secret, input()), rejected());
    assert.ok(await verifyPassword(oldPass, (await saved(u.id)).passwordHash));
  });
  await t.test(
    "phone binding/lifecycle/password security changes invalidate already verified proof",
    async () => {
      for (const change of ["phone", "inactive", "delete", "password"] as const) {
        const u = await user(),
          op = await verified(u);
        if (change === "phone")
          await prisma.accountIdentity.deleteMany({ where: { userId: u.id, kind: "PHONE" } });
        if (change === "inactive")
          await prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
        if (change === "delete")
          await prisma.user.update({
            where: { id: u.id },
            data: { deletionRequestedAt: new Date() },
          });
        if (change === "password")
          await accountRepository.changePassword(u.id, await hashPassword(otherPass), {
            passwordHash: u.passwordHash,
            authVersion: u.authVersion,
          });
        await assert.rejects(recovery.complete(op.secret, input()), rejected());
      }
    },
  );
  await t.test(
    "PR49 email reset wins first: pending SMS cannot overwrite its newer password",
    async () => {
      const u = await user(undefined, { email: `a4.${crypto.randomUUID()}@example.com` }),
        op = await verified(u),
        raw = crypto.randomBytes(32).toString("base64url");
      await prisma.accountToken.create({
        data: {
          userId: u.id,
          type: "PASSWORD_RESET",
          tokenHash: hashToken(raw),
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      await accountService.resetPassword(raw, otherPass, {});
      await assert.rejects(recovery.complete(op.secret, input()), rejected());
      assert.ok(await verifyPassword(otherPass, (await saved(u.id)).passwordHash));
    },
  );
  await t.test(
    "SMS reset invalidates old email delivery, reset token and link/phone operations atomically",
    async () => {
      const u = await user(undefined, { email: `a4.${crypto.randomUUID()}@example.com` }),
        op = await verified(u);
      const reset = await prisma.accountToken.create({
        data: {
          userId: u.id,
          type: "PASSWORD_RESET",
          tokenHash: hashToken(crypto.randomUUID()),
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      await prisma.passwordResetDelivery.create({
        data: { userId: u.id, requestedAt: new Date() },
      });
      const link = await prisma.accountIdentityOperation.create({
        data: {
          userId: u.id,
          purpose: "LINK_METHOD",
          kind: "PHONE",
          identifier: u.number,
          sessionHash: "a".repeat(64),
          securityStamp: "b".repeat(64),
          reauthenticatedAt: new Date(),
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      await recovery.complete(op.secret, input());
      assert.ok((await prisma.accountToken.findUniqueOrThrow({ where: { id: reset.id } })).usedAt);
      assert.ok(
        (await prisma.passwordResetDelivery.findUniqueOrThrow({ where: { userId: u.id } }))
          .completedAt,
      );
      assert.ok(
        (await prisma.accountIdentityOperation.findUniqueOrThrow({ where: { id: link.id } }))
          .consumedAt,
      );
    },
  );
  await t.test("reused SMS event is rejected across intents and A2 operations", async () => {
    const u = await user(),
      a = await verified(u),
      b = await begin(u.number);
    await assert.rejects(recovery.verify(b.secret, { idToken: a.token }), rejected());
    await assert.rejects(
      prisma.accountIdentityOperation.create({
        data: {
          userId: u.id,
          purpose: "LINK_METHOD",
          kind: "PHONE",
          identifier: u.number,
          sessionHash: "a".repeat(64),
          securityStamp: "b".repeat(64),
          reauthenticatedAt: new Date(),
          expiresAt: new Date(Date.now() + 60000),
          consumedAt: new Date(),
          proofEventHash: proofEventHash(proofs.get(a.token)!, "PHONE", u.number),
        },
      }),
    );
    const v = await user(),
      before = await begin(v.number),
      token = sms(v.number);
    await prisma.accountIdentityOperation.create({
      data: {
        userId: v.id,
        purpose: "LINK_METHOD",
        kind: "PHONE",
        identifier: v.number,
        sessionHash: "a".repeat(64),
        securityStamp: "b".repeat(64),
        reauthenticatedAt: new Date(),
        expiresAt: new Date(Date.now() + 60000),
        consumedAt: new Date(),
        proofEventHash: proofEventHash(proofs.get(token)!, "PHONE", v.number),
      },
    });
    await assert.rejects(recovery.verify(before.secret, { idToken: token }), rejected());
  });
  await t.test(
    "five bad proofs lock the intent; begin has a durable per-phone budget",
    async () => {
      const u = await user(),
        op = await begin(u.number);
      for (let i = 0; i < 5; i++)
        await assert.rejects(
          recovery.verify(op.secret, { idToken: "wrong-provider-proof-00000000000" }),
          rejected(),
        );
      await assert.rejects(recovery.verify(op.secret, { idToken: sms(u.number) }), rejected());
      const n = number();
      for (let i = 0; i < 5; i++) await begin(n);
      await assert.rejects(begin(n), rejected("TOO_MANY_REQUESTS"));
    },
  );
  await t.test(
    "current/bcrypt-equivalent password reuse rejected; failed write rolls back proof and session changes",
    async () => {
      const u = await user(),
        op = await verified(u);
      await assert.rejects(recovery.complete(op.secret, input(oldPass)), rejected());
      const session = await authService.login({ email: u.email, password: oldPass }, {});
      accountRepository.changePassword = async (...args) => {
        await originalWrite(...args);
        throw new Error("synthetic provider or SQL payload must not escape");
      };
      try {
        await assert.rejects(recovery.complete(op.secret, input()), rejected());
      } finally {
        accountRepository.changePassword = originalWrite;
      }
      assert.ok(await verifyPassword(oldPass, (await saved(u.id)).passwordHash));
      assert.equal((await saved(u.id)).authVersion, u.authVersion);
      assert.equal((await recovery.status(op.secret)).verified, true);
      assert.equal(
        (
          await fetch(base + "/auth/me", {
            headers: { authorization: `Bearer ${session.tokens.accessToken}` },
          })
        ).status,
        200,
      );
    },
  );
});
