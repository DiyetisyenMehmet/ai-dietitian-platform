import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp } from "../app";
import { prisma } from "../lib/prisma";

type Envelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

interface SessionPayload {
  user: { id: string; email: string | null; isGuest?: boolean };
  tokens: { accessToken: string };
}

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
  const app = createApp();
  let server: Server | undefined;
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  assert.ok(server);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return { server, baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}` };
}

async function json<T>(response: Response): Promise<Envelope<T>> {
  return (await response.json()) as Envelope<T>;
}

test("account freeze invalidates access immediately and password reactivation restores sessions", async (t) => {
  const email = `identity.lifecycle.${Date.now()}@example.com`;
  const password = "LifecyclePass123";
  await prisma.user.deleteMany({ where: { email } });

  const { server, baseUrl } = await startServer();
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  const registration = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, fullName: "Lifecycle User" }),
  });
  assert.equal(registration.status, 201);
  const registrationBody = await json<SessionPayload>(registration);
  assert.equal(registrationBody.success, true);
  if (!registrationBody.success) return;

  const accessToken = registrationBody.data.tokens.accessToken;
  const beforeFreeze = await fetch(`${baseUrl}/api/identity/sessions`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  assert.equal(beforeFreeze.status, 200);

  const freeze = await fetch(`${baseUrl}/api/identity/deactivate`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ confirm: true }),
  });
  assert.equal(freeze.status, 200);

  const staleAccess = await fetch(`${baseUrl}/api/identity/sessions`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  assert.equal(staleAccess.status, 401);

  const activeRefreshTokens = await prisma.refreshToken.count({
    where: { userId: registrationBody.data.user.id, revokedAt: null },
  });
  assert.equal(activeRefreshTokens, 0);

  const reactivate = await fetch(`${baseUrl}/api/identity/reactivate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(reactivate.status, 200);
  const reactivatedBody = await json<SessionPayload>(reactivate);
  assert.equal(reactivatedBody.success, true);
  if (!reactivatedBody.success) return;

  const restored = await fetch(`${baseUrl}/api/identity/sessions`, {
    headers: { authorization: `Bearer ${reactivatedBody.data.tokens.accessToken}` },
  });
  assert.equal(restored.status, 200);
});

test("guest mode receives an access-only session and cannot enter private account APIs", async (t) => {
  const { server, baseUrl } = await startServer();
  let guestId: string | null = null;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    if (guestId) await prisma.user.deleteMany({ where: { id: guestId } });
    await prisma.$disconnect();
  });

  const guest = await fetch(`${baseUrl}/api/identity/guest`, { method: "POST" });
  assert.equal(guest.status, 201);
  const guestBody = await json<SessionPayload>(guest);
  assert.equal(guestBody.success, true);
  if (!guestBody.success) return;
  guestId = guestBody.data.user.id;
  assert.equal(guestBody.data.user.email, null);
  assert.equal(guestBody.data.user.isGuest, true);
  assert.equal(guest.headers.get("set-cookie"), null);

  const privateApi = await fetch(`${baseUrl}/api/identity/sessions`, {
    headers: { authorization: `Bearer ${guestBody.data.tokens.accessToken}` },
  });
  assert.equal(privateApi.status, 403);
});
