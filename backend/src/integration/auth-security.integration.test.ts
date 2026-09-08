import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp } from "../app";
import { prisma } from "../lib/prisma";

type Envelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

interface AuthPayload {
  user: { id: string; email: string };
  tokens: { accessToken: string; tokenType: "Bearer"; expiresIn: string };
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

function cookiePair(response: Response): string {
  const header = response.headers.get("set-cookie");
  assert.ok(header, "refresh response must set a cookie");
  return header.split(";", 1)[0]!;
}

async function readEnvelope<T>(response: Response): Promise<Envelope<T>> {
  return (await response.json()) as Envelope<T>;
}

async function refresh(
  baseUrl: string,
  cookie: string,
  options: { origin?: string; userAgent?: string } = {},
): Promise<Response> {
  return fetch(`${baseUrl}/api/auth/refresh-token`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
      origin: options.origin ?? "http://localhost:3000",
      "user-agent": options.userAgent ?? "diewish-auth-integration",
    },
    body: JSON.stringify({}),
  });
}

test("HttpOnly refresh cookie rotation is atomic, origin-bound and replay-safe", async (t) => {
  const email = `auth.security.${Date.now()}@example.com`;
  const password = "IntegrationPass123";
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
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "user-agent": "diewish-auth-integration",
    },
    body: JSON.stringify({ email, password, fullName: "Auth Security" }),
  });
  assert.equal(registration.status, 201);
  const registrationBody = await readEnvelope<AuthPayload>(registration);
  assert.equal(registrationBody.success, true);
  if (!registrationBody.success) return;

  assert.equal("refreshToken" in registrationBody.data.tokens, false);
  const setCookie = registration.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /diewish_refresh=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Path=\/api\/auth/i);
  assert.match(setCookie, /SameSite=Lax/i);

  const originalCookie = cookiePair(registration);
  const [first, second] = await Promise.all([
    refresh(baseUrl, originalCookie),
    refresh(baseUrl, originalCookie),
  ]);
  assert.deepEqual([first.status, second.status].sort((a, b) => a - b), [200, 401]);

  const winner = first.status === 200 ? first : second;
  const winnerBody = await readEnvelope<AuthPayload>(winner);
  assert.equal(winnerBody.success, true);
  if (!winnerBody.success) return;
  assert.equal("refreshToken" in winnerBody.data.tokens, false);
  const successorCookie = cookiePair(winner);

  // Cookie-authenticated mutations from an untrusted browser origin are denied
  // before rotation, leaving the legitimate successor usable.
  const evilOrigin = await refresh(baseUrl, successorCookie, {
    origin: "https://attacker.invalid",
  });
  assert.equal(evilOrigin.status, 403);

  const legitimateRotation = await refresh(baseUrl, successorCookie);
  assert.equal(legitimateRotation.status, 200);
  const currentCookie = cookiePair(legitimateRotation);

  // Reusing the original token from a materially different client context is a
  // replay, not an ordinary concurrent loser; all live sessions are revoked.
  const replay = await refresh(baseUrl, originalCookie, {
    userAgent: "replay-attacker",
  });
  assert.equal(replay.status, 401);

  const afterReplay = await refresh(baseUrl, currentCookie);
  assert.equal(afterReplay.status, 401);

  const activeTokens = await prisma.refreshToken.count({
    where: { userId: registrationBody.data.user.id, revokedAt: null },
  });
  assert.equal(activeTokens, 0);
});
