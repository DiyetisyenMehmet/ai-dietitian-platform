import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/api-error";
import { hashPassword } from "../utils/password";
import {
  firebaseAuthProvider,
  type VerifiedExternalIdentity,
} from "../modules/identity/firebase-auth.provider";
import { externalLoginService } from "../modules/identity/external-login.service";

const forbidden = (error: unknown) =>
  error instanceof ApiError && (error.statusCode === 403 || error.statusCode === 409);

test("SEC external user login never mints or reactivates ADMIN sessions", async (t) => {
  const originalSafe = env.ACCOUNT_SAFE_LINKING_ENABLED;
  const originalPhone = env.PHONE_PASSWORD_AUTH_ENABLED;
  const originalVerify = firebaseAuthProvider.verifyIdToken;
  const identities = new Map<string, VerifiedExternalIdentity>();
  const ids: string[] = [];

  firebaseAuthProvider.verifyIdToken = async (token) => {
    const identity = identities.get(token);
    if (!identity) throw ApiError.unauthorized("Invalid synthetic identity.");
    return identity;
  };

  t.after(async () => {
    env.ACCOUNT_SAFE_LINKING_ENABLED = originalSafe;
    env.PHONE_PASSWORD_AUTH_ENABLED = originalPhone;
    firebaseAuthProvider.verifyIdToken = originalVerify;
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  async function user(
    email: string,
    role: "USER" | "ADMIN" = "USER",
    extra: { isActive?: boolean; deactivatedAt?: Date | null } = {},
  ) {
    const created = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword("SyntheticGuardPass123!"),
        role,
        isActive: extra.isActive ?? true,
        deactivatedAt: extra.deactivatedAt ?? null,
        hasUsablePassword: role === "USER",
      },
    });
    ids.push(created.id);
    return created;
  }

  function google(email: string, subject: string): string {
    const token = `google-${crypto.randomUUID()}`;
    identities.set(token, {
      uid: `firebase-${crypto.randomUUID()}`,
      email,
      emailVerified: true,
      phoneNumber: null,
      displayName: null,
      providers: ["google.com"],
      signInProvider: "google.com",
      googleSubject: subject,
      authTime: Math.floor(Date.now() / 1000),
    });
    return token;
  }

  function phone(number: string): string {
    const token = `phone-${crypto.randomUUID()}`;
    identities.set(token, {
      uid: `firebase-${crypto.randomUUID()}`,
      email: null,
      emailVerified: false,
      phoneNumber: number,
      displayName: null,
      providers: ["phone"],
      signInProvider: "phone",
      phoneAuthenticationVerified: true,
      authTime: Math.floor(Date.now() / 1000),
    });
    return token;
  }

  const activeAdmin = await user(`sec-admin-${crypto.randomUUID()}@example.com`, "ADMIN");
  const inactiveAdmin = await user(
    `sec-admin-inactive-${crypto.randomUUID()}@example.com`,
    "ADMIN",
    { isActive: false, deactivatedAt: new Date() },
  );
  const normalGoogle = await user(`sec-google-${crypto.randomUUID()}@example.com`);
  const normalPhoneNumber = "+905551234567";
  const normalPhone = await user("phone.905551234567@phone.diewish.invalid");

  const adminSubject = `admin-${crypto.randomUUID()}`;
  const inactiveAdminSubject = `admin-inactive-${crypto.randomUUID()}`;
  const googleSubject = `user-${crypto.randomUUID()}`;

  const activeAdminToken = google(activeAdmin.email, adminSubject);
  const inactiveAdminToken = google(inactiveAdmin.email, inactiveAdminSubject);
  const normalGoogleToken = google(normalGoogle.email, googleSubject);
  const normalPhoneToken = phone(normalPhoneNumber);

  await prisma.accountIdentity.createMany({
    data: [
      {
        userId: normalGoogle.id,
        kind: "GOOGLE",
        identifier: googleSubject,
        verifiedAt: new Date(),
      },
      {
        userId: normalPhone.id,
        kind: "PHONE",
        identifier: normalPhoneNumber,
        verifiedAt: new Date(),
      },
    ],
  });

  for (const safeLinking of [false, true]) {
    await t.test(
      `ADMIN is denied before session issuance/reactivation when safe linking=${safeLinking}`,
      async () => {
        env.ACCOUNT_SAFE_LINKING_ENABLED = safeLinking;
        env.PHONE_PASSWORD_AUTH_ENABLED = false;

        await assert.rejects(
          externalLoginService.login(activeAdminToken, {}),
          forbidden,
        );
        await assert.rejects(
          externalLoginService.login(inactiveAdminToken, {}),
          forbidden,
        );

        assert.equal(
          await prisma.refreshToken.count({
            where: { userId: { in: [activeAdmin.id, inactiveAdmin.id] } },
          }),
          0,
        );
        const inactive = await prisma.user.findUniqueOrThrow({
          where: { id: inactiveAdmin.id },
        });
        assert.equal(inactive.isActive, false);
        assert.ok(inactive.deactivatedAt);
      },
    );

    await t.test(
      `normal Google and phone users still sign in when safe linking=${safeLinking}`,
      async () => {
        env.ACCOUNT_SAFE_LINKING_ENABLED = safeLinking;
        env.PHONE_PASSWORD_AUTH_ENABLED = false;

        const googleSession = await externalLoginService.login(normalGoogleToken, {});
        assert.equal(googleSession.user.id, normalGoogle.id);

        const phoneSession = await externalLoginService.login(normalPhoneToken, {});
        assert.equal(phoneSession.user.id, normalPhone.id);
      },
    );
  }
});
