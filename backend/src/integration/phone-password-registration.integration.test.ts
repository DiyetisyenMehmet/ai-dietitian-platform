import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "node:net";
import { env } from "../config/env";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/api-error";
import { hashPassword, verifyPassword } from "../utils/password";
import { hashToken, signAccessToken } from "../utils/jwt";
import { authService } from "../modules/auth/auth.service";
import { accountRepository } from "../modules/account/account.repository";
import { phonePasswordService as service } from "../modules/identity/phone-password.service";
import {
  firebaseAuthProvider,
  type VerifiedExternalIdentity,
} from "../modules/identity/firebase-auth.provider";
import { externalLoginService } from "../modules/identity/external-login.service";
import { recordVerifiedAccountIdentity } from "../modules/identity/account-identity.repository";
import { accountLinkService } from "../modules/identity/account-link.service";
import { proofEventHash } from "../modules/identity/safe-linking.policy";

const isCode = (code: string) => (err: unknown) => err instanceof ApiError && err.code === code;
const pass = "SyntheticPhonePassword123";
const nextPass = "DifferentPhonePassword456";
const fields = (password = pass) => ({ password, passwordConfirmation: password });
const email = (number: string) => `phone.${number.slice(1)}@phone.diewish.invalid`;

test("A3 new phone/password behavior only", async (t) => {
  assert.equal(env.PHONE_PASSWORD_AUTH_ENABLED, false);
  const oldSafe = env.ACCOUNT_SAFE_LINKING_ENABLED;
  const oldPhone = env.PHONE_PASSWORD_AUTH_ENABLED;
  const oldVerify = firebaseAuthProvider.verifyIdToken;
  const external = new Map<string, VerifiedExternalIdentity>();
  const numbers: string[] = [],
    ids: string[] = [];
  const app = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((r) => app.once("listening", r));
  const base = `http://127.0.0.1:${(app.address() as AddressInfo).port}/api/identity`;
  firebaseAuthProvider.verifyIdToken = async (token) => {
    const value = external.get(token);
    if (!value) throw ApiError.unauthorized("Invalid synthetic proof.");
    return value;
  };
  t.after(async () => {
    env.ACCOUNT_SAFE_LINKING_ENABLED = oldSafe;
    env.PHONE_PASSWORD_AUTH_ENABLED = oldPhone;
    firebaseAuthProvider.verifyIdToken = oldVerify;
    app.closeAllConnections();
    await new Promise<void>((resolve) => app.close(() => resolve()));
    const created = await prisma.user.findMany({
      where: { OR: [{ id: { in: ids } }, { email: { in: numbers.map(email) } }] },
      select: { id: true },
    });
    await prisma.user.deleteMany({ where: { id: { in: created.map((x) => x.id) } } });
    await prisma.phonePasswordChallenge.deleteMany({ where: { phoneNumber: { in: numbers } } });
    await prisma.$disconnect();
  });
  const number = () => {
    const n = `+905${crypto.randomInt(100_000_000, 999_999_999)}`;
    numbers.push(n);
    return n;
  };
  const sms = (n: string, overrides: Partial<VerifiedExternalIdentity> = {}) => {
    const uid = `sms-${crypto.randomUUID()}`;
    const token = jwt.sign(
      { sub: uid, firebase: { sign_in_provider: overrides.signInProvider ?? "phone" } },
      "synthetic-provider-fixture-secret",
      { jwtid: crypto.randomUUID() },
    );
    external.set(token, {
      uid,
      phoneNumber: n,
      signInProvider: "phone",
      phoneAuthenticationVerified: true,
      email: null,
      emailVerified: false,
      providers: ["phone"],
      displayName: null,
      authTime: Math.floor(Date.now() / 1000),
      ...overrides,
    });
    return token;
  };
  const start = (n: string, token = sms(n), secret?: string, userId?: string) =>
    service.start({ phoneNumber: n, idToken: token }, secret, userId);
  async function user(n: string, extra: Record<string, unknown> = {}) {
    const u = await prisma.user.create({
      data: {
        email: email(n),
        passwordHash: await hashPassword(crypto.randomUUID()),
        hasUsablePassword: false,
        ...extra,
      },
    });
    ids.push(u.id);
    return u;
  }
  const bind = (userId: string, n: string) =>
    prisma.$transaction((tx) =>
      recordVerifiedAccountIdentity(tx, {
        userId,
        kind: "PHONE",
        identifier: n,
        verifiedAt: new Date(),
      }),
    );
  // Optional continuation of only a failed/changed case on an exact source tree.
  // The full isolated #49 compatibility run leaves this filter unset.
  const scenario = (name: string, fn: () => Promise<void>) =>
    t.test(
      name,
      {
        skip:
          process.env.APP11_A3_TEST_FILTER &&
          !new RegExp(process.env.APP11_A3_TEST_FILTER).test(name)
            ? "Already passed on recorded A3 source"
            : false,
      },
      fn,
    );
  if (process.env.APP11_A3_TEST_FILTER) {
    env.ACCOUNT_SAFE_LINKING_ENABLED = true;
    env.PHONE_PASSWORD_AUTH_ENABLED = true;
  }
  const post = (path: string, body: unknown, cookie?: string, extra: Record<string, string> = {}) =>
    fetch(base + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-diewish-phone-setup": "1",
        ...(cookie ? { cookie } : {}),
        ...extra,
      },
      body: JSON.stringify(body),
    });

  await scenario(
    "both approval gates default off and fail before verifying any proof",
    async () => {
      assert.deepEqual(await service.status(), { enabled: false, pending: false });
      for (const [safe, phone] of [
        [false, true],
        [true, false],
        [false, false],
      ]) {
        env.ACCOUNT_SAFE_LINKING_ENABLED = safe;
        env.PHONE_PASSWORD_AUTH_ENABLED = phone;
        assert.equal((await post("/phone-password/start", {})).status, 503);
        await assert.rejects(start(number()), isCode("PHONE_PASSWORD_DISABLED"));
      }
      env.ACCOUNT_SAFE_LINKING_ENABLED = true;
      env.PHONE_PASSWORD_AUTH_ENABLED = true;
    },
  );
  await scenario("fresh actual SMS, exact matching phone and auth-time required", async () => {
    const n = number();
    for (const override of [
      { signInProvider: "google.com" },
      { phoneAuthenticationVerified: false },
      { authTime: Math.floor(Date.now() / 1000) - 301 },
      { authTime: Math.floor(Date.now() / 1000) + 60 },
    ]) {
      await assert.rejects(start(n, sms(n, override)), isCode("PHONE_SETUP_INVALID"));
    }
    const other = number();
    await assert.rejects(start(other, sms(number())), isCode("PHONE_SETUP_INVALID"));
    assert.equal(await prisma.user.count({ where: { email: email(n) } }), 0);
  });
  await scenario(
    "SMS creates only a short pending operation; resume needs the exact browser secret",
    async () => {
      const n = number(),
        token = sms(n);
      const op = await start(n, token);
      assert.equal(await prisma.user.count({ where: { email: email(n) } }), 0);
      assert.equal((await service.status(op.secret)).pending, true);
      assert.equal((await service.status()).pending, false);
      assert.equal(
        (await service.status(crypto.randomBytes(32).toString("base64url"))).pending,
        false,
      );
      const stored = await prisma.phonePasswordChallenge.findUniqueOrThrow({
        where: { secretHash: hashToken(op.secret) },
      });
      assert.equal(stored.expectedUserId, null);
      assert.ok(!JSON.stringify(stored).includes(op.secret));
      assert.ok(!JSON.stringify(stored).includes(token));
      assert.ok(Date.parse(op.expiresAt) - Date.now() <= 300_000);
      await assert.rejects(start(n, token), isCode("PHONE_SETUP_INVALID"));
    },
  );
  await scenario(
    "new user, one verified phone, existing bcrypt password and normal no-SMS login",
    async () => {
      const n = number(),
        op = await start(n);
      const session = await service.complete(op.secret, fields(), {});
      ids.push(session.user.id);
      const saved = await prisma.user.findUniqueOrThrow({
        where: { id: session.user.id },
        include: { accountIdentities: true },
      });
      assert.equal(saved.hasUsablePassword, true);
      assert.equal(saved.emailVerifiedAt, null);
      assert.equal(saved.onboardingCompleted, false);
      assert.equal(saved.accountIdentities[0]?.identifier, n);
      assert.ok(await verifyPassword(pass, saved.passwordHash));
      assert.equal((await service.status(op.secret)).pending, false);
      const original = firebaseAuthProvider.verifyIdToken;
      firebaseAuthProvider.verifyIdToken = async () => {
        throw new Error("Normal password login must never request SMS");
      };
      try {
        assert.equal(
          (await service.login({ phoneNumber: n, password: pass }, {})).user.id,
          saved.id,
        );
        assert.equal(
          (await authService.login({ email: saved.email, password: pass }, {})).user.id,
          saved.id,
        );
        await assert.rejects(
          service.login({ phoneNumber: n, password: "WrongPassword123" }, {}),
          isCode("UNAUTHORIZED"),
        );
      } finally {
        firebaseAuthProvider.verifyIdToken = original;
      }
      await assert.rejects(
        service.complete(op.secret, fields(nextPass), {}),
        isCode("PHONE_SETUP_INVALID"),
      );
      await assert.rejects(start(n), isCode("PHONE_PASSWORD_REQUIRED"));
      await assert.rejects(
        externalLoginService.login(sms(n), {}),
        isCode("PHONE_PASSWORD_REQUIRED"),
      );
    },
  );
  await scenario(
    "a non-SMS provider's merely linked phone cannot enter or create a phone/password account",
    async () => {
      const n = number(),
        op = await start(n);
      await service.complete(op.secret, fields(), {});
      const token = sms(n, {
        signInProvider: "apple.com",
        phoneAuthenticationVerified: false,
        providers: ["apple.com"],
      });
      await assert.rejects(
        externalLoginService.login(token, {}),
        isCode("ACCOUNT_OWNERSHIP_REQUIRED"),
      );
      const other = number();
      await assert.rejects(
        externalLoginService.login(
          sms(other, {
            signInProvider: "apple.com",
            phoneAuthenticationVerified: false,
            providers: ["apple.com"],
          }),
          {},
        ),
        isCode("ACCOUNT_OWNERSHIP_REQUIRED"),
      );
      assert.equal(await prisma.user.count({ where: { email: email(other) } }), 0);
    },
  );
  await scenario(
    "strict HTTP password policy, confirmation, Unicode byte bound and no target substitution",
    async () => {
      const n = number(),
        op = await start(n);
      const cookie = `diewish_phone_setup=${op.secret}`;
      for (const body of [
        { password: "weak", passwordConfirmation: "weak" },
        { password: pass, passwordConfirmation: nextPass },
        fields("Aa1" + "ü".repeat(36)),
        { ...fields(), phoneNumber: number() },
        { ...fields(), userId: crypto.randomUUID() },
      ]) {
        assert.equal((await post("/phone-password/complete", body, cookie)).status, 422);
      }
      assert.equal((await service.status(op.secret)).pending, true);
      assert.equal((await post("/phone-password/complete", fields())).status, 400);
    },
  );
  await scenario(
    "HTTP proof cookie is HttpOnly/scoped, status is secret-free, completion uses existing refresh cookie",
    async () => {
      const n = number(),
        token = sms(n);
      const response = await post("/phone-password/start", { phoneNumber: n, idToken: token });
      assert.equal(response.status, 200);
      const cookieHeader = response.headers.get("set-cookie")!;
      assert.match(cookieHeader, /HttpOnly/);
      assert.match(cookieHeader, /Path=\/api\/identity\/phone-password/);
      const cookie = cookieHeader.split(";")[0];
      const startBody = (await response.json()) as { data: { expiresAt: string } };
      assert.deepEqual(Object.keys(startBody.data), ["expiresAt"]);
      assert.ok(!JSON.stringify(startBody).includes(n));
      const status = await fetch(base + "/phone-password/status", { headers: { cookie } });
      assert.equal(status.headers.get("cache-control"), "no-store");
      assert.equal(((await status.json()) as { data: { pending: boolean } }).data.pending, true);
      const complete = await post("/phone-password/complete", fields(), cookie);
      assert.equal(complete.status, 200);
      assert.match(complete.headers.get("set-cookie")!, /Path=\/api\/auth/);
      assert.match(complete.headers.get("set-cookie")!, /HttpOnly/);
      const result = (await complete.json()) as {
        data: { user: { id: string }; tokens: { accessToken: string }; refreshToken?: string };
      };
      ids.push(result.data.user.id);
      assert.equal(result.data.refreshToken, undefined);
      const current = await fetch(base.replace("/identity", "/auth/me"), {
        headers: { authorization: `Bearer ${result.data.tokens.accessToken}` },
      });
      assert.equal(current.status, 200);
    },
  );
  await scenario(
    "untrusted origins and form/simple requests cannot consume the setup cookie",
    async () => {
      const n = number(),
        op = await start(n),
        cookie = `diewish_phone_setup=${op.secret}`;
      assert.equal(
        (
          await post("/phone-password/complete", fields(), cookie, {
            origin: "https://attacker.invalid",
          })
        ).status,
        403,
      );
      assert.equal(
        (await post("/phone-password/complete", fields(), cookie, { "x-diewish-phone-setup": "" }))
          .status,
        403,
      );
      assert.equal((await service.status(op.secret)).pending, true);
    },
  );
  await scenario(
    "interrupted/cancelled/expired setup grants no account and requires a new SMS",
    async () => {
      const n = number(),
        op = await start(n);
      await service.cancel(op.secret);
      await assert.rejects(
        service.complete(op.secret, fields(), {}),
        isCode("PHONE_SETUP_INVALID"),
      );
      const next = await start(n);
      await prisma.phonePasswordChallenge.update({
        where: { secretHash: hashToken(next.secret) },
        data: { expiresAt: new Date(Date.now() - 1) },
      });
      assert.equal((await service.status(next.secret)).pending, false);
      await assert.rejects(
        service.complete(next.secret, fields(), {}),
        isCode("PHONE_SETUP_INVALID"),
      );
      assert.equal(await prisma.user.count({ where: { email: email(n) } }), 0);
    },
  );
  await scenario(
    "two completions of one proof produce exactly one account and session",
    async () => {
      const n = number(),
        op = await start(n);
      const results = await Promise.allSettled([
        service.complete(op.secret, fields(), {}),
        service.complete(op.secret, fields(nextPass), {}),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const users = await prisma.user.findMany({ where: { email: email(n) } });
      assert.equal(users.length, 1);
      ids.push(users[0]!.id);
      assert.equal(await prisma.refreshToken.count({ where: { userId: users[0]!.id } }), 1);
    },
  );
  await scenario(
    "independent pending proofs for same number cannot adopt a late-created owner",
    async () => {
      const n = number(),
        a = await start(n),
        b = await start(n);
      const results = await Promise.allSettled([
        service.complete(a.secret, fields(), {}),
        service.complete(b.secret, fields(nextPass), {}),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(await prisma.user.count({ where: { email: email(n) } }), 1);
    },
  );
  await scenario(
    "legacy SMS-only first password retains userId, health, Coach and subscription",
    async () => {
      const n = number(),
        owner = await user(n);
      await prisma.weightLog.create({ data: { userId: owner.id, weightKg: 72 } });
      await prisma.chatConversation.create({
        data: {
          userId: owner.id,
          title: "A3 existing Coach",
          messages: { create: { role: "USER", content: "synthetic existing message" } },
        },
      });
      await prisma.subscription.create({
        data: { userId: owner.id, tier: "PREMIUM", status: "ACTIVE", provider: "IYZICO" },
      });
      const snapshot = () =>
        prisma.user.findUniqueOrThrow({
          where: { id: owner.id },
          select: {
            id: true,
            onboardingCompleted: true,
            email: true,
            weightLogs: true,
            chatConversations: { include: { messages: true } },
            subscriptions: true,
          },
        });
      const before = await snapshot();
      const oldSession = await externalLoginService.login(sms(n), {});
      assert.equal(oldSession.user.id, owner.id);
      const op = await start(n);
      const result = await service.complete(op.secret, fields(), {});
      assert.equal(result.user.id, owner.id);
      assert.deepEqual(await snapshot(), before);
      const oldRefresh = await prisma.refreshToken.findUniqueOrThrow({
        where: { tokenHash: hashToken(oldSession.refreshToken) },
      });
      assert.ok(oldRefresh.revokedAt);
      assert.equal((await service.login({ phoneNumber: n, password: pass }, {})).user.id, owner.id);
    },
  );
  await scenario(
    "unknown legacy password provenance requires the exact existing principal plus fresh SMS",
    async () => {
      const n = number(),
        owner = await user(n, { hasUsablePassword: null });
      const token = sms(n);
      await assert.rejects(start(n, token), isCode("PHONE_LEGACY_SESSION_REQUIRED"));
      await assert.rejects(
        start(n, sms(n), undefined, crypto.randomUUID()),
        isCode("PHONE_LEGACY_SESSION_REQUIRED"),
      );
      const oldSession = await externalLoginService.login(token, {});
      assert.equal(oldSession.user.id, owner.id);
      const response = await post(
        "/phone-password/start",
        { phoneNumber: n, idToken: token },
        undefined,
        { authorization: `Bearer ${oldSession.tokens.accessToken}` },
      );
      assert.equal(response.status, 200);
      const secret = response.headers.get("set-cookie")!.split(";")[0]!.split("=")[1]!;
      assert.equal((await service.complete(secret, fields(), {})).user.id, owner.id);
    },
  );
  await scenario(
    "new SMS sign-in cannot bypass mandatory password setup or create an account",
    async () => {
      const n = number();
      await assert.rejects(
        externalLoginService.login(sms(n), {}),
        isCode("PHONE_REGISTRATION_REQUIRED"),
      );
      assert.equal(await prisma.user.count({ where: { email: email(n) } }), 0);
    },
  );
  await scenario(
    "recovery phone on Google/email account cannot create or overwrite a password",
    async () => {
      const n = number(),
        owner = await user(number(), { email: `a3.${crypto.randomUUID()}@example.com` });
      await bind(owner.id, n);
      const before = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
      await assert.rejects(start(n), isCode("ACCOUNT_OWNERSHIP_REQUIRED"));
      await assert.rejects(
        externalLoginService.login(sms(n), {}),
        isCode("ACCOUNT_OWNERSHIP_REQUIRED"),
      );
      assert.deepEqual(await prisma.user.findUniqueOrThrow({ where: { id: owner.id } }), before);
      assert.equal(await prisma.user.count({ where: { email: email(n) } }), 0);
    },
  );
  await scenario(
    "verified phone on an email account uses that account's one existing password",
    async () => {
      const n = number(),
        owner = await user(number(), {
          email: `a3.${crypto.randomUUID()}@example.com`,
          passwordHash: await hashPassword(pass),
          hasUsablePassword: true,
        });
      await bind(owner.id, n);
      assert.equal((await service.login({ phoneNumber: n, password: pass }, {})).user.id, owner.id);
      assert.equal(
        (await authService.login({ email: owner.email, password: pass }, {})).user.id,
        owner.id,
      );
    },
  );
  await scenario(
    "suspended/deleting/Admin users blocked; self-deactivated legacy SMS retains controlled restoration",
    async () => {
      for (const extra of [
        { isActive: false },
        { deletionRequestedAt: new Date() },
        { role: "ADMIN" },
      ]) {
        const n = number();
        await user(n, extra);
        await assert.rejects(start(n));
        await assert.rejects(externalLoginService.login(sms(n), {}));
      }
      const n = number(),
        owner = await user(n, { isActive: false, deactivatedAt: new Date() });
      assert.equal((await externalLoginService.login(sms(n), {})).user.id, owner.id);
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).isActive,
        true,
      );
    },
  );
  await scenario(
    "password/reset/security-state changes invalidate pending initial-password proof",
    async () => {
      const n = number(),
        owner = await user(n),
        op = await start(n);
      await accountRepository.changePassword(owner.id, await hashPassword(nextPass));
      await assert.rejects(service.complete(op.secret, fields(), {}));
      const saved = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
      assert.ok(await verifyPassword(nextPass, saved.passwordHash));
      const m = number(),
        other = await user(m),
        pending = await start(m);
      await prisma.user.update({
        where: { id: other.id },
        data: { deletionRequestedAt: new Date() },
      });
      await assert.rejects(service.complete(pending.secret, fields(), {}));
    },
  );
  await scenario(
    "one SMS event cannot be replayed between A2 linking and A3 registration (both directions)",
    async () => {
      const n = number(),
        token = sms(n),
        owner = await user(number(), {
          passwordHash: await hashPassword(pass),
          hasUsablePassword: true,
        });
      const access = signAccessToken({ userId: owner.id, email: owner.email, role: owner.role });
      const op = await accountLinkService.start(owner.id, access, {
        kind: "PHONE",
        identifier: n,
        reauthentication: { password: pass },
      });
      await start(n, token);
      await assert.rejects(
        accountLinkService.complete(owner.id, access, {
          operationId: op.operationId,
          idToken: token,
        }),
      );
      assert.equal(await prisma.accountIdentity.count({ where: { userId: owner.id } }), 0);
      const m = number(),
        first = await user(m),
        smsProof = sms(m);
      // Existing consumed A2 event for the original phone prevents A3 reuse too.
      await prisma.accountIdentityOperation.create({
        data: {
          userId: first.id,
          purpose: "LINK_METHOD",
          kind: "PHONE",
          identifier: m,
          sessionHash: "a".repeat(64),
          securityStamp: "b".repeat(64),
          reauthenticatedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: new Date(),
          proofEventHash: proofEventHash(external.get(smsProof)!, "PHONE", m),
        },
      });
      await assert.rejects(start(m, smsProof), isCode("PHONE_SETUP_INVALID"));
    },
  );
  await scenario(
    "identifier reservation races never steal or duplicate another account",
    async () => {
      const n = number(),
        op = await start(n),
        other = await user(number());
      await bind(other.id, n);
      await assert.rejects(
        service.complete(op.secret, fields(), {}),
        isCode("ACCOUNT_OWNERSHIP_REQUIRED"),
      );
      assert.equal(await prisma.user.count({ where: { email: email(n) } }), 0);
      const m = number(),
        pending = await start(m);
      const late = await user(m);
      await assert.rejects(
        service.complete(pending.secret, fields(), {}),
        isCode("ACCOUNT_OWNERSHIP_REQUIRED"),
      );
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: late.id } })).hasUsablePassword,
        false,
      );
    },
  );
  await scenario(
    "phone password guessing and setup retries share durable per-number limits",
    async () => {
      const n = number();
      for (let i = 0; i < 10; i++)
        await assert.rejects(
          service.login({ phoneNumber: n, password: "WrongPassword123" }, {}),
          isCode("UNAUTHORIZED"),
        );
      await assert.rejects(
        service.login({ phoneNumber: n, password: pass }, {}),
        isCode("TOO_MANY_REQUESTS"),
      );
      const m = number();
      for (let i = 0; i < 5; i++) await start(m);
      await assert.rejects(start(m), isCode("TOO_MANY_REQUESTS"));
    },
  );
  await scenario(
    "with PR49: initial password increments session version and invalidates the prior access token",
    async () => {
      const n = number(),
        owner = await user(n);
      const previous = await externalLoginService.login(sms(n), {});
      const op = await start(n);
      const result = await service.complete(op.secret, fields(), {});
      const saved = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
      if ("authVersion" in saved) {
        assert.equal(saved.authVersion, 1);
        const endpoint = base.replace("/identity", "/auth/me");
        const old = await fetch(endpoint, {
          headers: { authorization: `Bearer ${previous.tokens.accessToken}` },
        });
        assert.equal(old.status, 401);
        const current = await fetch(endpoint, {
          headers: { authorization: `Bearer ${result.tokens.accessToken}` },
        });
        assert.equal(current.status, 200);
      } else assert.equal(result.user.id, owner.id);
    },
  );
});
