import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

let server: Server;
let baseUrl = "";

async function cleanDatabase(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.healthCheck.deleteMany();
}

before(async () => {
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(cleanDatabase);

after(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

function cookiePair(setCookie: string): string {
  return setCookie.split(";", 1)[0] ?? "";
}

test("register keeps refresh token out of JSON and issues an HttpOnly cookie", async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({
      email: "cookie-register@example.com",
      password: "StrongPass123",
      fullName: "Cookie Test",
    }),
  });

  assert.equal(response.status, 201);
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /diewish_refresh=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);

  const bodyText = await response.text();
  assert.doesNotMatch(bodyText, /refreshToken/i);
  assert.match(bodyText, /accessToken/);
});

test("refresh rotates the HttpOnly cookie and logout clears it", async () => {
  const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({
      email: "cookie-rotate@example.com",
      password: "StrongPass123",
      fullName: "Cookie Rotate",
    }),
  });
  const initialSetCookie = registerResponse.headers.get("set-cookie") ?? "";
  const initialCookie = cookiePair(initialSetCookie);
  assert.ok(initialCookie);

  const refreshResponse = await fetch(`${baseUrl}/api/auth/refresh-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      Cookie: initialCookie,
    },
    body: JSON.stringify({}),
  });
  assert.equal(refreshResponse.status, 200);
  const rotatedSetCookie = refreshResponse.headers.get("set-cookie") ?? "";
  const rotatedCookie = cookiePair(rotatedSetCookie);
  assert.ok(rotatedCookie);
  assert.notEqual(rotatedCookie, initialCookie);
  assert.doesNotMatch(await refreshResponse.text(), /refreshToken/i);

  const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      Cookie: rotatedCookie,
    },
    body: JSON.stringify({}),
  });
  assert.equal(logoutResponse.status, 200);
  const cleared = logoutResponse.headers.get("set-cookie") ?? "";
  assert.match(cleared, /diewish_refresh=/);
  assert.match(cleared, /Expires=Thu, 01 Jan 1970/i);
});

test("cookie refresh rejects untrusted browser origins", async () => {
  const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "cookie-origin@example.com",
      password: "StrongPass123",
      fullName: "Origin Test",
    }),
  });
  const cookie = cookiePair(registerResponse.headers.get("set-cookie") ?? "");

  const response = await fetch(`${baseUrl}/api/auth/refresh-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://evil.example",
      Cookie: cookie,
    },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 403);
});
