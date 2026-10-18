import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";
import jwt from "jsonwebtoken";

import { createApp } from "../app";
import { prisma } from "../lib/prisma";
import { authService } from "../modules/auth/auth.service";
import { accountRepository } from "../modules/account/account.repository";
import {
  normalizeAccountIdentifier,
  recordVerifiedAccountIdentity,
} from "../modules/identity/account-identity.repository";
import { accountMethodsService } from "../modules/identity/account-methods.service";
import { externalLoginService } from "../modules/identity/external-login.service";
import { firebaseAuthProvider } from "../modules/identity/firebase-auth.provider";
import { guestConversionService } from "../modules/identity/guest-conversion.service";
import { guestService } from "../modules/identity/guest.service";
import { ApiError } from "../utils/api-error";
import { signAccessToken } from "../utils/jwt";
import { hashPassword } from "../utils/password";

async function envelope(response: Response) {
  return (await response.json()) as {
    data: Awaited<ReturnType<typeof accountMethodsService.getForUser>>;
  };
}

test("APP11 account identity foundation: isolation, conflict safety and legacy preservation", async (t) => {
  const stamp = crypto.randomUUID();
  const ids: string[] = [];
  const email = (label: string) => `app11.${label}.${stamp}@example.com`;
  const password = "SyntheticPassword123";
  const oldVerifier = firebaseAuthProvider.verifyIdToken;
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/identity/account-methods`;
  t.after(async () => {
    firebaseAuthProvider.verifyIdToken = oldVerifier;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });
  async function user(label: string, extra: Record<string, unknown> = {}) {
    const created = await prisma.user.create({
      data: {
        email: email(label),
        passwordHash: await hashPassword(password),
        ...extra,
      },
    });
    ids.push(created.id);
    return created;
  }
  const owner = await user("owner");
  const other = await user("other");
  const phone = "+905551234567";
  const sms = await user("sms", { email: `phone.${phone.slice(1)}@phone.diewish.invalid` });
  const google = await user("google", { emailVerifiedAt: new Date("2026-01-01") });
  for (const account of [owner, sms, google]) {
    await prisma.weightLog.create({
      data: { userId: account.id, weightKg: 70, note: "Synthetic legacy record" },
    });
    await prisma.chatConversation.create({
      data: {
        userId: account.id,
        title: "Synthetic preserved conversation",
        messages: { create: { role: "USER", content: "Synthetic preserved message" } },
      },
    });
  }
  async function related() {
    return {
      weights: await prisma.weightLog.findMany({
        where: { userId: { in: ids } },
        orderBy: { id: "asc" },
      }),
      chats: await prisma.chatConversation.findMany({
        where: { userId: { in: ids } },
        include: { messages: true },
        orderBy: { id: "asc" },
      }),
    };
  }
  const before = await related();
  const token = (account: typeof owner) =>
    signAccessToken({ userId: account.id, email: account.email, role: account.role });
  const read = (access: string, query = "") =>
    fetch(base + query, { headers: { authorization: `Bearer ${access}` } });
  const record = (userId: string, kind: "EMAIL" | "PHONE" | "GOOGLE", identifier: string) =>
    prisma.$transaction((tx) =>
      recordVerifiedAccountIdentity(tx, { userId, kind, identifier, verifiedAt: new Date() }),
    );
  const isConflict = (err: unknown) =>
    err instanceof ApiError && err.statusCode === 409 && err.code === "ACCOUNT_IDENTITY_CONFLICT";

  await t.test(
    "legacy random hashes never imply a usable Diewish password or verified phone/Google link",
    async () => {
      for (const account of [owner, sms, google]) {
        const response = await read(token(account));
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("cache-control"), "no-store");
        const { data } = await envelope(response);
        assert.equal(data.userId, account.id);
        assert.equal(data.diewishPassword.usable, null);
        assert.equal(data.phone.verified, null);
        assert.equal(data.google.linked, null);
        assert.equal(data.linkingEnabled, false);
        const serialized = JSON.stringify(data);
        assert.ok(!serialized.includes(account.email));
        assert.ok(!serialized.includes("passwordHash"));
        assert.ok(!serialized.includes(phone));
      }
    },
  );
  await t.test(
    "endpoint requires auth; ignores supplied user selectors; has no write route",
    async () => {
      assert.equal((await fetch(base)).status, 401);
      assert.equal((await read("invalid-token")).status, 401);
      const response = await read(
        token(owner),
        `?userId=${other.id}&email=${encodeURIComponent(other.email)}`,
      );
      assert.equal((await envelope(response)).data.userId, owner.id);
      assert.equal(
        (
          await fetch(base, {
            method: "POST",
            headers: { authorization: `Bearer ${token(owner)}` },
          })
        ).status,
        404,
      );
    },
  );
  await t.test(
    "guest, Admin, inactive and deletion-pending principals cannot read account methods",
    async () => {
      for (const data of [
        { email: `guest.${stamp}@guest.diewish.invalid` },
        { role: "ADMIN" },
        { isActive: false },
        { deletionRequestedAt: new Date() },
      ]) {
        const account = await user(crypto.randomUUID(), data);
        assert.ok([401, 403].includes((await read(token(account))).status));
        await assert.rejects(
          record(account.id, "GOOGLE", `blocked-${account.id}`),
          (err: unknown) => err instanceof ApiError && err.statusCode === 403,
        );
      }
    },
  );
  await t.test(
    "normalization preserves plus aliases and provider subjects; rejects synthetic email and ambiguous phone",
    () => {
      assert.equal(
        normalizeAccountIdentifier("EMAIL", " Alice+tag@Example.com "),
        "alice+tag@example.com",
      );
      assert.equal(normalizeAccountIdentifier("GOOGLE", "Google_Sub-AbC"), "Google_Sub-AbC");
      for (const [kind, value] of [
        ["EMAIL", "x@phone.diewish.invalid"],
        ["PHONE", "05551234567"],
        ["GOOGLE", owner.email],
      ] as const) {
        assert.throws(() => normalizeAccountIdentifier(kind, value), /Invalid account identifier/);
      }
    },
  );
  await t.test(
    "legacy email and phone reservations reject linkage to another user without mutating either",
    async () => {
      await assert.rejects(record(owner.id, "EMAIL", other.email.toUpperCase()), isConflict);
      await assert.rejects(record(owner.id, "PHONE", phone), isConflict);
      assert.equal(await prisma.accountIdentity.count(), 0);
    },
  );
  await t.test(
    "registry links in place, is idempotent, and does not disclose identifiers",
    async () => {
      await record(owner.id, "EMAIL", owner.email.toUpperCase());
      await record(sms.id, "PHONE", phone);
      await record(google.id, "GOOGLE", `google-sub-${stamp}`);
      const original = await prisma.accountIdentity.findMany({ orderBy: { id: "asc" } });
      await record(owner.id, "EMAIL", owner.email);
      assert.deepEqual(await prisma.accountIdentity.findMany({ orderBy: { id: "asc" } }), original);
      assert.equal((await envelope(await read(token(sms)))).data.phone.verified, true);
      assert.equal((await envelope(await read(token(google)))).data.google.linked, true);
      const data = (await envelope(await read(token(owner)))).data;
      assert.equal(data.email.verification, "VERIFIED");
      assert.equal(data.email.source, "REGISTRY");
    },
  );
  await t.test(
    "all three identity kinds reject a second owner; same-user replacement cannot overwrite",
    async () => {
      for (const [kind, identifier] of [
        ["EMAIL", owner.email],
        ["PHONE", phone],
        ["GOOGLE", `google-sub-${stamp}`],
      ] as const) {
        await assert.rejects(record(other.id, kind, identifier), isConflict);
      }
      await assert.rejects(record(owner.id, "EMAIL", email("replacement")), isConflict);
      assert.equal(await prisma.accountIdentity.count(), 3);
    },
  );
  await t.test(
    "database constraints enforce unique ownership even under competing inserts",
    async () => {
      const shared = `race-${stamp}`;
      const results = await Promise.allSettled([
        record(owner.id, "GOOGLE", shared),
        record(other.id, "GOOGLE", shared),
      ]);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      const rejected = results.find((result) => result.status === "rejected");
      assert.ok(rejected?.status === "rejected" && isConflict(rejected.reason));
      assert.equal(
        await prisma.accountIdentity.count({ where: { kind: "GOOGLE", identifier: shared } }),
        1,
      );
    },
  );
  await t.test("raw SQL cannot reassign an identity or insert a malformed phone", async () => {
    const entry = await prisma.accountIdentity.findUniqueOrThrow({
      where: { userId_kind: { userId: sms.id, kind: "PHONE" } },
    });
    await assert.rejects(
      prisma.accountIdentity.update({ where: { id: entry.id }, data: { userId: other.id } }),
    );
    await assert.rejects(
      prisma.accountIdentity.create({
        data: { userId: other.id, kind: "PHONE", identifier: "0555", verifiedAt: new Date() },
      }),
    );
    assert.equal(
      (await prisma.accountIdentity.findUniqueOrThrow({ where: { id: entry.id } })).userId,
      sms.id,
    );
  });
  await t.test(
    "failed transaction rolls registry insert back and exposes no database error identifiers",
    async () => {
      await assert.rejects(
        prisma.$transaction(async (tx) => {
          await recordVerifiedAccountIdentity(tx, {
            userId: other.id,
            kind: "EMAIL",
            identifier: other.email,
            verifiedAt: new Date(),
          });
          throw new Error("Synthetic rollback");
        }),
      );
      assert.equal(
        await prisma.accountIdentity.count({ where: { userId: other.id, kind: "EMAIL" } }),
        0,
      );
      const future = new Date(Date.now() + 60_000);
      await assert.rejects(
        prisma.$transaction((tx) =>
          recordVerifiedAccountIdentity(tx, {
            userId: other.id,
            kind: "EMAIL",
            identifier: other.email,
            verifiedAt: future,
          }),
        ),
        /Invalid verification timestamp/,
      );
    },
  );
  await t.test(
    "legacy SMS and Google sign-in retain their original userId and random password hash",
    async () => {
      for (const [account, phoneNumber, providers] of [
        [sms, phone, ["phone"]],
        [google, null, ["google.com"]],
      ] as const) {
        firebaseAuthProvider.verifyIdToken = async () => ({
          uid: `synthetic-${account.id}`,
          email: phoneNumber ? null : account.email,
          emailVerified: true,
          phoneNumber,
          displayName: null,
          providers: [...providers],
        });
        const result = await externalLoginService.login(
          jwt.sign(
            { sub: `synthetic-${account.id}`, firebase: { sign_in_provider: providers[0] } },
            "synthetic-fixture-secret",
          ),
          {},
        );
        assert.equal(result.user.id, account.id);
        const row = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });
        assert.equal(row.passwordHash, account.passwordHash);
        assert.equal(row.hasUsablePassword, null);
      }
    },
  );
  await t.test(
    "legacy email password proof classifies the same account; wrong passwords cannot classify it",
    async () => {
      await assert.rejects(
        authService.login({ email: owner.email, password: "WrongPassword123" }, {}),
      );
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).hasUsablePassword,
        null,
      );
      const result = await authService.login({ email: owner.email, password }, {});
      assert.equal(result.user.id, owner.id);
      assert.equal(
        (await envelope(await read(result.tokens.accessToken))).data.diewishPassword.usable,
        true,
      );
    },
  );
  await t.test(
    "new email is usable; new social/SMS random secrets and guests are not",
    async () => {
      const registration = await authService.register({ email: email("new-email"), password }, {});
      ids.push(registration.user.id);
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: registration.user.id } }))
          .hasUsablePassword,
        true,
      );
      for (const provider of ["google.com", "phone"]) {
        firebaseAuthProvider.verifyIdToken = async () => ({
          uid: `new-${stamp}-${provider}`,
          email: provider === "phone" ? null : email("new-social"),
          emailVerified: true,
          phoneNumber: provider === "phone" ? "+905551234568" : null,
          displayName: null,
          providers: [provider],
        });
        const result = await externalLoginService.login(
          jwt.sign(
            { sub: `new-${stamp}-${provider}`, firebase: { sign_in_provider: provider } },
            "synthetic-fixture-secret",
          ),
          {},
        );
        ids.push(result.user.id);
        assert.equal(
          (await prisma.user.findUniqueOrThrow({ where: { id: result.user.id } }))
            .hasUsablePassword,
          false,
        );
      }
      const guest = await guestService.create({});
      ids.push(guest.user.id);
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: guest.user.id } })).hasUsablePassword,
        false,
      );
    },
  );
  await t.test(
    "existing password change classifies a user-chosen password atomically",
    async () => {
      await accountRepository.changePassword(sms.id, await hashPassword("ChangedSynthetic123"));
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: sms.id } })).hasUsablePassword,
        true,
      );
    },
  );
  await t.test(
    "existing password reset records usable state with the password write and rejects reuse",
    async () => {
      const resetUser = await user("reset", { hasUsablePassword: false });
      const resetToken = await prisma.accountToken.create({
        data: {
          userId: resetUser.id,
          type: "PASSWORD_RESET",
          tokenHash: crypto.randomBytes(32).toString("hex"),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      const passwordHash = await hashPassword("ResetSynthetic123");
      assert.equal(
        await accountRepository.consumeTokenAndResetPassword(
          resetToken.id,
          resetUser.id,
          passwordHash,
        ),
        true,
      );
      const row = await prisma.user.findUniqueOrThrow({ where: { id: resetUser.id } });
      assert.equal(row.hasUsablePassword, true);
      assert.equal(row.passwordHash, passwordHash);
      assert.equal(
        await accountRepository.consumeTokenAndResetPassword(
          resetToken.id,
          resetUser.id,
          "must-not-write",
        ),
        false,
      );
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: resetUser.id } })).passwordHash,
        passwordHash,
      );
    },
  );
  await t.test(
    "guest conversion establishes one usable password without changing the userId",
    async () => {
      const guest = await guestService.create({});
      ids.push(guest.user.id);
      const converted = await guestConversionService.convert(
        guest.user.id,
        { email: email("converted"), password },
        {},
      );
      assert.equal(converted.user.id, guest.user.id);
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: guest.user.id } })).hasUsablePassword,
        true,
      );
    },
  );
  await t.test(
    "account IDs, original hashes and related health/chat records survive the foundation",
    async () => {
      assert.deepEqual(await related(), before);
      for (const account of [owner, google]) {
        const row = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });
        assert.equal(row.email, account.email);
        assert.equal(row.passwordHash, account.passwordHash);
      }
    },
  );
});
