import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import type { AddressInfo } from "node:net";

import { createApp } from "../app";
import { prisma } from "../lib/prisma";
import { accountService } from "../modules/account/account.service";
import { authRepository } from "../modules/auth/auth.repository";
import { authService } from "../modules/auth/auth.service";
import { hashPassword, verifyPassword } from "../utils/password";

const oldPassword = "ChangeOldPass123!";
const newPassword = "ChangeNewPass456!";

test("SEC unified-account password change invalidates sessions and enforces bcrypt bounds", async (t) => {
  const ids: string[] = [];
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

  async function createUser(password: string) {
    const user = await prisma.user.create({
      data: {
        email: `sec-password-${crypto.randomUUID()}@example.com`,
        passwordHash: await hashPassword(password),
        role: "USER",
        isActive: true,
      },
    });
    ids.push(user.id);
    return user;
  }

  async function change(accessToken: string, currentPassword: string, nextPassword: string) {
    return fetch(base + "/account/password/change", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ currentPassword, newPassword: nextPassword }),
    });
  }

  t.after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  await t.test("password change increments authVersion and immediately kills old access/refresh", async () => {
    const user = await createUser(oldPassword);
    const before = await authService.login({ email: user.email, password: oldPassword }, {});
    const snapshot = await authRepository.findUserById(user.id);
    assert.ok(snapshot);

    const changed = await change(before.tokens.accessToken, oldPassword, newPassword);
    assert.equal(changed.status, 200);

    const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(saved.authVersion, snapshot.authVersion + 1);

    const oldAccess = await fetch(base + "/auth/me", {
      headers: { authorization: `Bearer ${before.tokens.accessToken}` },
    });
    assert.equal(oldAccess.status, 401);
    await assert.rejects(authService.refresh(before.refreshToken, {}));

    // A password login that read the old state before the change cannot publish
    // a fresh surviving refresh token after the version increment.
    await assert.rejects(
      authRepository.createRefreshToken({
        id: crypto.randomUUID(),
        userId: user.id,
        tokenHash: "synthetic-stale-password-change-login",
        expiresAt: new Date(Date.now() + 60_000),
        authVersion: snapshot.authVersion,
      }),
    );

    await assert.rejects(authService.login({ email: user.email, password: oldPassword }, {}));
    const next = await authService.login({ email: user.email, password: newPassword }, {});
    assert.equal(next.user.id, user.id);
  });

  await t.test("change rejects >72 UTF-8 bytes and bcrypt-truncated equivalents", async () => {
    const exact72 = "Aa1!" + "x".repeat(68);
    assert.equal(Buffer.byteLength(exact72, "utf8"), 72);
    const equivalentAfterBcryptTruncation = exact72 + "Z";
    assert.ok(Buffer.byteLength(equivalentAfterBcryptTruncation, "utf8") > 72);

    const user = await createUser(exact72);
    const session = await authService.login({ email: user.email, password: exact72 }, {});
    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    const rejected = await change(
      session.tokens.accessToken,
      exact72,
      equivalentAfterBcryptTruncation,
    );
    assert.equal(rejected.status, 422);

    // Service-layer defense remains effective even if an internal caller bypasses
    // HTTP schema validation.
    await assert.rejects(
      accountService.changePassword(user.id, exact72, equivalentAfterBcryptTruncation, {}),
    );

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(after.authVersion, before.authVersion);
    assert.ok(await verifyPassword(exact72, after.passwordHash));
  });
});
