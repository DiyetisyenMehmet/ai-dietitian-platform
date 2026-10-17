import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "node:net";
import { env } from "../config/env";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../utils/password";
import { hashToken, signAccessToken } from "../utils/jwt";
import { ApiError } from "../utils/api-error";
import { accountRepository } from "../modules/account/account.repository";
import { accountLinkService } from "../modules/identity/account-link.service";
import { accountLinkDelivery } from "../modules/identity/account-link-delivery";
import {
  firebaseAuthProvider,
  type VerifiedExternalIdentity,
} from "../modules/identity/firebase-auth.provider";
import { externalLoginService } from "../modules/identity/external-login.service";
import { recordVerifiedAccountIdentity } from "../modules/identity/account-identity.repository";

const code = (expected: string) => (error: unknown) =>
  error instanceof ApiError && error.code === expected;

test("A2 safe linking: explicit old-account proof, current target proof, isolation and preservation", async (t) => {
  const oldFlag = env.ACCOUNT_SAFE_LINKING_ENABLED;
  const oldVerifier = firebaseAuthProvider.verifyIdToken;
  const oldSend = accountLinkDelivery.send;
  const oldConfigured = accountLinkDelivery.assertConfigured;
  const ids: string[] = [];
  const external = new Map<string, VerifiedExternalIdentity>();
  const mail = new Map<string, { to: string; token: string }>();
  const pass = "SyntheticLinkPassword123";
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/identity`;
  env.ACCOUNT_SAFE_LINKING_ENABLED = true;
  accountLinkDelivery.assertConfigured = () => {};
  accountLinkDelivery.send = async (to, id, token) => {
    mail.set(id, { to, token });
  };
  firebaseAuthProvider.verifyIdToken = async (token) => {
    const identity = external.get(token);
    if (!identity) throw ApiError.unauthorized("Synthetic invalid external proof.");
    return identity;
  };
  t.after(async () => {
    env.ACCOUNT_SAFE_LINKING_ENABLED = oldFlag;
    firebaseAuthProvider.verifyIdToken = oldVerifier;
    accountLinkDelivery.send = oldSend;
    accountLinkDelivery.assertConfigured = oldConfigured;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });
  const unique = () => crypto.randomUUID();
  const email = () => `a2.${unique()}@example.com`;
  const phone = () => `+90555${String(crypto.randomInt(10_000_000, 99_999_999))}`;
  async function user(extra: Record<string, unknown> = {}) {
    const user = await prisma.user.create({
      data: {
        email: email(),
        passwordHash: await hashPassword(pass),
        hasUsablePassword: true,
        ...extra,
      },
    });
    ids.push(user.id);
    return user;
  }
  const session = (account: Awaited<ReturnType<typeof user>>) =>
    signAccessToken({ userId: account.id, email: account.email, role: account.role });
  const google = (
    address: string | null,
    subject = `google-${unique()}`,
    override: Partial<VerifiedExternalIdentity> = {},
  ) => {
    const uid = `firebase-${unique()}`;
    const token = jwt.sign(
      { sub: uid, firebase: { sign_in_provider: override.signInProvider ?? "google.com" } },
      "synthetic-provider-fixture-secret",
      { jwtid: unique() },
    );
    external.set(token, {
      uid,
      email: address,
      emailVerified: true,
      phoneNumber: null,
      displayName: null,
      providers: ["google.com"],
      signInProvider: "google.com",
      googleSubject: subject,
      authTime: Math.floor(Date.now() / 1000),
      ...override,
    });
    return { token, subject };
  };
  const sms = (number: string, override: Partial<VerifiedExternalIdentity> = {}) => {
    const uid = `sms-${unique()}`;
    const token = jwt.sign(
      { sub: uid, firebase: { sign_in_provider: override.signInProvider ?? "phone" } },
      "synthetic-provider-fixture-secret",
      { jwtid: unique() },
    );
    external.set(token, {
      uid,
      email: null,
      emailVerified: false,
      phoneNumber: number,
      displayName: null,
      providers: ["phone"],
      signInProvider: "phone",
      phoneAuthenticationVerified: true,
      authTime: Math.floor(Date.now() / 1000),
      ...override,
    });
    return token;
  };
  const bind = (userId: string, kind: "EMAIL" | "PHONE" | "GOOGLE", identifier: string) =>
    prisma.$transaction((tx) =>
      recordVerifiedAccountIdentity(tx, { userId, kind, identifier, verifiedAt: new Date() }),
    );
  const start = (
    userId: string,
    token: string,
    kind: "EMAIL" | "PHONE" | "GOOGLE",
    identifier: string,
  ) =>
    accountLinkService.start(userId, token, {
      kind,
      identifier,
      reauthentication: { password: pass },
    });
  async function post(path: string, body: unknown, access?: string) {
    return fetch(base + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(access ? { authorization: `Bearer ${access}` } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  await t.test("disabled by default; gate blocks all writes before proof handling", async () => {
    assert.equal(oldFlag, false);
    env.ACCOUNT_SAFE_LINKING_ENABLED = false;
    const response = await post("/links/start", {});
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    env.ACCOUNT_SAFE_LINKING_ENABLED = true;
  });
  await t.test(
    "HTTP authenticated writes require a normal principal and strict target-bound input",
    async () => {
      assert.equal((await post("/links/start", {})).status, 401);
      const owner = await user();
      const response = await post(
        "/links/start",
        {
          kind: "EMAIL",
          identifier: email(),
          reauthentication: { password: pass },
          userId: unique(),
        },
        session(owner),
      );
      assert.equal(response.status, 422);
      for (const extra of [
        { role: "ADMIN" },
        { email: `guest.${unique()}@guest.diewish.invalid` },
        { isActive: false },
        { deletionRequestedAt: new Date() },
      ]) {
        const blocked = await user(extra);
        const res = await post(
          "/links/start",
          { kind: "PHONE", identifier: phone(), reauthentication: { password: pass } },
          session(blocked),
        );
        assert.ok([401, 403].includes(res.status));
      }
    },
  );
  await t.test(
    "stolen session without password cannot start; failed reauth shares a durable per-user budget",
    async () => {
      const owner = await user();
      for (let i = 0; i < 5; i++)
        await assert.rejects(
          accountLinkService.start(owner.id, session(owner), {
            kind: "PHONE",
            identifier: phone(),
            reauthentication: { password: "wrong-password" },
          }),
          code("ACCOUNT_LINK_PROOF_INVALID"),
        );
      await assert.rejects(
        start(owner.id, session(owner), "PHONE", phone()),
        code("TOO_MANY_REQUESTS"),
      );
      const attempts = await prisma.accountIdentityOperation.findMany({
        where: { userId: owner.id },
      });
      assert.equal(attempts.length, 5);
      assert.ok(attempts.every((x) => x.consumedAt));
    },
  );
  await t.test(
    "email requires separate mailbox proof, same user/session and one-time consumption",
    async () => {
      const owner = await user();
      const other = await user();
      const target = email();
      const access = session(owner);
      const op = await start(owner.id, access, "EMAIL", target);
      const sent = mail.get(op.operationId)!;
      assert.equal(sent.to, target);
      const stored = await prisma.accountIdentityOperation.findUniqueOrThrow({
        where: { id: op.operationId },
      });
      assert.equal(stored.proofHash, hashToken(sent.token));
      assert.equal(stored.sessionHash, hashToken(access));
      assert.ok(!JSON.stringify(stored).includes(sent.token));
      await assert.rejects(
        accountLinkService.complete(other.id, session(other), {
          operationId: op.operationId,
          token: sent.token,
        }),
        code("ACCOUNT_LINK_PROOF_INVALID"),
      );
      await assert.rejects(
        accountLinkService.complete(owner.id, access + "another-session", {
          operationId: op.operationId,
          token: sent.token,
        }),
        code("ACCOUNT_LINK_PROOF_INVALID"),
      );
      await assert.rejects(
        accountLinkService.complete(owner.id, access, {
          operationId: op.operationId,
          token: "wrong-mail-proof",
        }),
        code("ACCOUNT_LINK_PROOF_INVALID"),
      );
      await accountLinkService.complete(owner.id, access, {
        operationId: op.operationId,
        token: sent.token,
      });
      await assert.rejects(
        accountLinkService.complete(owner.id, access, {
          operationId: op.operationId,
          token: sent.token,
        }),
        code("ACCOUNT_LINK_PROOF_INVALID"),
      );
      assert.equal(
        (
          await prisma.accountIdentity.findUniqueOrThrow({
            where: { kind_identifier: { kind: "EMAIL", identifier: target } },
          })
        ).userId,
        owner.id,
      );
    },
  );
  await t.test("email proof locks after five wrong attempts", async () => {
    const owner = await user();
    const access = session(owner);
    const op = await start(owner.id, access, "EMAIL", email());
    for (let i = 0; i < 5; i++)
      await assert.rejects(
        accountLinkService.complete(owner.id, access, {
          operationId: op.operationId,
          token: "wrong",
        }),
        code("ACCOUNT_LINK_PROOF_INVALID"),
      );
    await assert.rejects(
      accountLinkService.complete(owner.id, access, {
        operationId: op.operationId,
        token: mail.get(op.operationId)!.token,
      }),
      code("ACCOUNT_LINK_PROOF_INVALID"),
    );
    assert.equal(await prisma.accountIdentity.count({ where: { userId: owner.id } }), 0);
  });
  await t.test(
    "expired operation, password reset and lifecycle changes invalidate pending proof",
    async () => {
      for (const change of ["expiry", "password", "inactive", "deleting"]) {
        const owner = await user();
        const access = session(owner);
        const op = await start(owner.id, access, "EMAIL", email());
        if (change === "expiry")
          await prisma.accountIdentityOperation.update({
            where: { id: op.operationId },
            data: { expiresAt: new Date(Date.now() - 1) },
          });
        if (change === "password")
          await prisma.user.update({
            where: { id: owner.id },
            data: { passwordHash: await hashPassword("ChangedAfterStart123") },
          });
        if (change === "inactive")
          await prisma.user.update({ where: { id: owner.id }, data: { isActive: false } });
        if (change === "deleting")
          await prisma.user.update({
            where: { id: owner.id },
            data: { deletionRequestedAt: new Date() },
          });
        await assert.rejects(
          accountLinkService.complete(owner.id, access, {
            operationId: op.operationId,
            token: mail.get(op.operationId)!.token,
          }),
          ApiError,
        );
        assert.equal(await prisma.accountIdentity.count({ where: { userId: owner.id } }), 0);
      }
    },
  );
  await t.test(
    "phone must be a fresh actual SMS sign-in, never a Google-linked profile number",
    async () => {
      const owner = await user();
      const access = session(owner);
      const number = phone();
      const op = await start(owner.id, access, "PHONE", number);
      for (const proof of [
        sms(phone()),
        sms(number, { authTime: Math.floor(Date.now() / 1000) - 600 }),
        sms(number, { phoneAuthenticationVerified: false }),
        google(owner.email, undefined, { phoneNumber: number }).token,
      ]) {
        await assert.rejects(
          accountLinkService.complete(owner.id, access, {
            operationId: op.operationId,
            idToken: proof,
          }),
          code("ACCOUNT_LINK_PROOF_INVALID"),
        );
      }
      await accountLinkService.complete(owner.id, access, {
        operationId: op.operationId,
        idToken: sms(number),
      });
      assert.equal(
        (
          await prisma.accountIdentity.findUniqueOrThrow({
            where: { kind_identifier: { kind: "PHONE", identifier: number } },
          })
        ).userId,
        owner.id,
      );
      // Recovery-phone attachment does not enable SMS-only normal login or duplicate the user.
      const before = await prisma.user.count();
      await assert.rejects(
        externalLoginService.login(sms(number), {}),
        code("ACCOUNT_OWNERSHIP_REQUIRED"),
      );
      assert.equal(await prisma.user.count(), before);
    },
  );
  await t.test(
    "legacy SMS-only user can reauthenticate without a password and keep the same account",
    async () => {
      const number = phone();
      const owner = await user({
        email: `phone.${number.slice(1)}@phone.diewish.invalid`,
        hasUsablePassword: null,
      });
      const access = session(owner);
      const target = email();
      const originalHash = owner.passwordHash;
      const op = await accountLinkService.start(owner.id, access, {
        kind: "EMAIL",
        identifier: target,
        reauthentication: { idToken: sms(number) },
      });
      await accountLinkService.complete(owner.id, access, {
        operationId: op.operationId,
        token: mail.get(op.operationId)!.token,
      });
      const row = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
      assert.equal(row.passwordHash, originalHash);
      assert.equal(row.hasUsablePassword, null);
    },
  );
  await t.test(
    "Google link requires verified stable provider subject; changed email does not change the owner",
    async () => {
      const owner = await user();
      const access = session(owner);
      const proof = google(email());
      const op = await start(owner.id, access, "GOOGLE", proof.subject);
      await accountLinkService.complete(owner.id, access, {
        operationId: op.operationId,
        idToken: proof.token,
      });
      const next = google(email(), proof.subject);
      const result = await externalLoginService.login(next.token, {});
      assert.equal(result.user.id, owner.id);
      const wrong = google(owner.email);
      await assert.rejects(
        externalLoginService.login(wrong.token, {}),
        code("ACCOUNT_OWNERSHIP_REQUIRED"),
      );
    },
  );
  await t.test(
    "a bound Google method can reauthenticate; a matching email on another Google subject cannot",
    async () => {
      const owner = await user({ hasUsablePassword: false });
      const binding = google(owner.email);
      await bind(owner.id, "GOOGLE", binding.subject);
      const access = session(owner);
      await assert.rejects(
        accountLinkService.start(owner.id, access, {
          kind: "PHONE",
          identifier: phone(),
          reauthentication: { idToken: google(owner.email).token },
        }),
        code("ACCOUNT_LINK_PROOF_INVALID"),
      );
      const op = await accountLinkService.start(owner.id, access, {
        kind: "PHONE",
        identifier: phone(),
        reauthentication: { idToken: binding.token },
      });
      assert.ok(op.operationId);
    },
  );
  await t.test("email, phone and Google conflicts never reassign or merge an account", async () => {
    for (const kind of ["EMAIL", "PHONE", "GOOGLE"] as const) {
      const owner = await user();
      const other = await user();
      const identifier =
        kind === "EMAIL" ? email() : kind === "PHONE" ? phone() : `sub-${unique()}`;
      await bind(other.id, kind, identifier);
      await assert.rejects(
        start(owner.id, session(owner), kind, identifier),
        code("ACCOUNT_IDENTITY_CONFLICT"),
      );
      assert.equal(
        (
          await prisma.accountIdentity.findUniqueOrThrow({
            where: { kind_identifier: { kind, identifier } },
          })
        ).userId,
        other.id,
      );
    }
  });
  await t.test(
    "legacy User.email and phone placeholders remain reserved without a registry row",
    async () => {
      const owner = await user();
      const other = await user();
      const number = phone();
      await user({ email: `phone.${number.slice(1)}@phone.diewish.invalid` });
      await assert.rejects(
        start(owner.id, session(owner), "EMAIL", other.email.toUpperCase()),
        code("ACCOUNT_IDENTITY_CONFLICT"),
      );
      await assert.rejects(
        start(owner.id, session(owner), "PHONE", number),
        code("ACCOUNT_IDENTITY_CONFLICT"),
      );
    },
  );
  await t.test(
    "legacy Google sign-in never adopts an email match; explicit mailbox transition retains userId",
    async () => {
      const owner = await user({ hasUsablePassword: null });
      await prisma.weightLog.create({
        data: { userId: owner.id, weightKg: 72, note: "Synthetic legacy health" },
      });
      await prisma.chatConversation.create({
        data: {
          userId: owner.id,
          title: "Synthetic legacy Coach",
          messages: { create: { role: "USER", content: "Synthetic legacy history" } },
        },
      });
      await prisma.subscription.create({
        data: { userId: owner.id, tier: "PREMIUM", status: "ACTIVE", provider: "IYZICO" },
      });
      const related = async () => {
        const row = await prisma.user.findUniqueOrThrow({
          where: { id: owner.id },
          include: {
            weightLogs: true,
            chatConversations: { include: { messages: true } },
            subscriptions: true,
          },
        });
        return {
          id: row.id,
          weightLogs: row.weightLogs,
          chatConversations: row.chatConversations,
          subscriptions: row.subscriptions,
        };
      };
      const beforeRelated = await related();
      const beforeHash = owner.passwordHash;
      const proof = google(owner.email);
      const beforeCount = await prisma.user.count();
      await assert.rejects(
        externalLoginService.login(proof.token, {}),
        code("ACCOUNT_OWNERSHIP_REQUIRED"),
      );
      assert.equal(await prisma.user.count(), beforeCount);
      const op = await accountLinkService.startGoogleTransition(proof.token);
      assert.equal(mail.get(op.operationId)!.to, owner.email);
      await assert.rejects(
        accountLinkService.completeGoogleTransition(
          { operationId: op.operationId, token: "wrong", idToken: proof.token },
          {},
        ),
        code("ACCOUNT_LINK_PROOF_INVALID"),
      );
      const result = await accountLinkService.completeGoogleTransition(
        {
          operationId: op.operationId,
          token: mail.get(op.operationId)!.token,
          idToken: proof.token,
        },
        {},
      );
      assert.equal(result.user.id, owner.id);
      assert.equal(
        (await externalLoginService.login(google(email(), proof.subject).token, {})).user.id,
        owner.id,
      );
      const row = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
      assert.equal(row.passwordHash, beforeHash);
      assert.equal(row.hasUsablePassword, null);
      assert.deepEqual(await related(), beforeRelated);
      await assert.rejects(
        accountLinkService.completeGoogleTransition(
          {
            operationId: op.operationId,
            token: mail.get(op.operationId)!.token,
            idToken: proof.token,
          },
          {},
        ),
        code("ACCOUNT_LINK_PROOF_INVALID"),
      );
    },
  );
  await t.test(
    "inaccessible synthetic mailbox and ambiguous Google candidates have no automatic recovery bypass",
    async () => {
      const number = phone();
      await user({ email: `phone.${number.slice(1)}@phone.diewish.invalid` });
      const proof = google(null, undefined, { phoneNumber: number });
      await assert.rejects(
        accountLinkService.startGoogleTransition(proof.token),
        code("ACCOUNT_OWNERSHIP_REQUIRED"),
      );
      const addressOwner = await user();
      const ambiguous = google(addressOwner.email, undefined, { phoneNumber: number });
      await assert.rejects(
        accountLinkService.startGoogleTransition(ambiguous.token),
        code("ACCOUNT_OWNERSHIP_REQUIRED"),
      );
    },
  );
  await t.test(
    "failed secure email delivery spends the operation and never enables a method",
    async () => {
      const owner = await user();
      accountLinkDelivery.send = async () => {
        throw new Error("must never leak provider details");
      };
      await assert.rejects(
        start(owner.id, session(owner), "EMAIL", email()),
        code("ACCOUNT_LINK_DELIVERY_UNAVAILABLE"),
      );
      const row = await prisma.accountIdentityOperation.findFirstOrThrow({
        where: { userId: owner.id },
      });
      assert.ok(row.consumedAt);
      assert.equal(await prisma.accountIdentity.count({ where: { userId: owner.id } }), 0);
      accountLinkDelivery.send = async (to, id, token) => {
        mail.set(id, { to, token });
      };
    },
  );
  await t.test("two concurrent completions consume exactly once", async () => {
    const owner = await user();
    const access = session(owner);
    const op = await start(owner.id, access, "EMAIL", email());
    const body = { operationId: op.operationId, token: mail.get(op.operationId)!.token };
    const results = await Promise.allSettled([
      accountLinkService.complete(owner.id, access, body),
      accountLinkService.complete(owner.id, access, body),
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(
      await prisma.accountIdentity.count({ where: { userId: owner.id, kind: "EMAIL" } }),
      1,
    );
  });
  await t.test(
    "concurrent different-user links to one phone have one winner and roll back the loser",
    async () => {
      const one = await user(),
        two = await user();
      const number = phone();
      const token = sms(number);
      const a = await start(one.id, session(one), "PHONE", number),
        b = await start(two.id, session(two), "PHONE", number);
      const results = await Promise.allSettled([
        accountLinkService.complete(one.id, session(one), {
          operationId: a.operationId,
          idToken: token,
        }),
        accountLinkService.complete(two.id, session(two), {
          operationId: b.operationId,
          idToken: token,
        }),
      ]);
      assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
      const loser = results[0]!.status === "fulfilled" ? b : a;
      assert.equal(
        (
          await prisma.accountIdentityOperation.findUniqueOrThrow({
            where: { id: loser.operationId },
          })
        ).consumedAt,
        null,
      );
    },
  );
  await t.test(
    "SQL reservations stop direct registration/guest conversion from stealing a linked identifier",
    async () => {
      const owner = await user();
      const target = email();
      await bind(owner.id, "EMAIL", target);
      await assert.rejects(
        prisma.user.create({ data: { email: target, passwordHash: owner.passwordHash } }),
      );
      const other = await user();
      await assert.rejects(
        prisma.user.update({ where: { id: other.id }, data: { email: target.toUpperCase() } }),
      );
      assert.notEqual(
        (await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).email,
        target,
      );
    },
  );
  await t.test(
    "registration racing a registry claim never creates two identifier owners",
    async () => {
      const owner = await user();
      const target = email();
      let createdId: string | undefined;
      const results = await Promise.allSettled([
        bind(owner.id, "EMAIL", target),
        prisma.user
          .create({ data: { email: target, passwordHash: owner.passwordHash } })
          .then((x) => {
            ids.push(x.id);
            createdId = x.id;
            return x;
          }),
      ]);
      assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
      const binding = await prisma.accountIdentity.findUnique({
        where: { kind_identifier: { kind: "EMAIL", identifier: target } },
      });
      assert.ok((binding?.userId === owner.id && !createdId) || (!binding && createdId));
    },
  );
  await t.test(
    "new Google sign-in retains the existing Android HTTP and refresh-cookie contract",
    async () => {
      const proof = google(email());
      const response = await post("/external", { idToken: proof.token });
      assert.equal(response.status, 200);
      assert.ok(response.headers.get("set-cookie")?.includes("HttpOnly"));
      const body = (await response.json()) as {
        data: { user: { id: string }; tokens: { accessToken: string } };
      };
      ids.push(body.data.user.id);
      assert.ok(body.data.tokens.accessToken);
      const again = await post("/external", { idToken: google(email(), proof.subject).token });
      assert.equal(again.status, 200);
      const next = (await again.json()) as { data: { user: { id: string } } };
      assert.equal(next.data.user.id, body.data.user.id);
      assert.equal(
        await prisma.accountIdentity.count({
          where: { userId: body.data.user.id, kind: "GOOGLE" },
        }),
        1,
      );
    },
  );
  await t.test(
    "self-deactivated legacy Google account restores only after independent mailbox proof",
    async () => {
      const owner = await user({
        isActive: false,
        deactivatedAt: new Date(),
        hasUsablePassword: null,
      });
      const proof = google(owner.email);
      await assert.rejects(
        externalLoginService.login(proof.token, {}),
        code("ACCOUNT_OWNERSHIP_REQUIRED"),
      );
      const op = await accountLinkService.startGoogleTransition(proof.token);
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).isActive,
        false,
      );
      const result = await accountLinkService.completeGoogleTransition(
        {
          operationId: op.operationId,
          idToken: proof.token,
          token: mail.get(op.operationId)!.token,
        },
        {},
      );
      assert.equal(result.user.id, owner.id);
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).isActive,
        true,
      );
    },
  );
  await t.test(
    "the existing password-reset primitive invalidates a pending link and revokes sessions",
    async () => {
      const owner = await user();
      const access = session(owner);
      const op = await start(owner.id, access, "EMAIL", email());
      const reset = await prisma.accountToken.create({
        data: {
          userId: owner.id,
          type: "PASSWORD_RESET",
          tokenHash: hashToken(unique()),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      const changed = await hashPassword("A2ResetProofPassword123");
      assert.equal(
        await accountRepository.consumeTokenAndResetPassword(reset.id, owner.id, changed),
        true,
      );
      await assert.rejects(
        accountLinkService.complete(owner.id, access, {
          operationId: op.operationId,
          token: mail.get(op.operationId)!.token,
        }),
        code("ACCOUNT_LINK_PROOF_INVALID"),
      );
      assert.equal(
        await prisma.refreshToken.count({ where: { userId: owner.id, revokedAt: null } }),
        0,
      );
      assert.equal(await prisma.accountIdentity.count({ where: { userId: owner.id } }), 0);
    },
  );
  await t.test(
    "failed ownership claim rolls consumption back; password/health/Coach/subscription data remain unchanged",
    async () => {
      const owner = await user();
      const access = session(owner);
      await prisma.weightLog.create({
        data: { userId: owner.id, weightKg: 71, note: "Synthetic preserved health" },
      });
      await prisma.chatConversation.create({
        data: {
          userId: owner.id,
          title: "Synthetic preserved Coach",
          messages: { create: { role: "USER", content: "Synthetic preserved" } },
        },
      });
      await prisma.subscription.create({
        data: {
          userId: owner.id,
          tier: "PREMIUM",
          status: "ACTIVE",
          provider: "IYZICO",
          updatedAt: new Date(),
        },
      });
      const snapshot = async () =>
        prisma.user.findUniqueOrThrow({
          where: { id: owner.id },
          include: {
            weightLogs: true,
            chatConversations: { include: { messages: true } },
            subscriptions: true,
          },
        });
      const before = await snapshot();
      const target = email();
      const op = await start(owner.id, access, "EMAIL", target);
      const other = await user({ email: target });
      await assert.rejects(
        accountLinkService.complete(owner.id, access, {
          operationId: op.operationId,
          token: mail.get(op.operationId)!.token,
        }),
        code("ACCOUNT_IDENTITY_CONFLICT"),
      );
      assert.equal(
        (await prisma.accountIdentityOperation.findUniqueOrThrow({ where: { id: op.operationId } }))
          .consumedAt,
        null,
      );
      assert.deepEqual(await snapshot(), before);
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).email,
        target,
      );
    },
  );
});
