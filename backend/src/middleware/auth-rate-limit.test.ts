import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import { createAuthRateLimiter } from "./auth-rate-limit";

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
  const app = express();
  app.use(express.json());

  const loginLimiter = createAuthRateLimiter({
    max: 2,
    code: "AUTH_LOGIN_RATE_LIMITED",
    message: "login limited",
    skipSuccessfulRequests: true,
  });
  const refreshLimiter = createAuthRateLimiter({
    max: 2,
    code: "AUTH_REFRESH_RATE_LIMITED",
    message: "refresh limited",
    skipSuccessfulRequests: true,
  });

  app.post("/login", loginLimiter, (req, res) => {
    if (req.body?.valid === true) {
      res.status(200).json({ ok: true });
      return;
    }
    res.status(401).json({ ok: false });
  });

  app.post("/refresh", refreshLimiter, (_req, res) => {
    res.status(200).json({ ok: true });
  });

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

async function post(baseUrl: string, path: string, body: object): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("successful logins do not consume the failed-login budget", async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await post(baseUrl, "/login", { valid: true });
    assert.equal(response.status, 200);
  }

  assert.equal((await post(baseUrl, "/login", { valid: false })).status, 401);
  assert.equal((await post(baseUrl, "/login", { valid: false })).status, 401);

  const limited = await post(baseUrl, "/login", { valid: false });
  assert.equal(limited.status, 429);
  const payload = (await limited.json()) as {
    error?: { code?: string };
  };
  assert.equal(payload.error?.code, "AUTH_LOGIN_RATE_LIMITED");

  // The login bucket being exhausted must not block the independent refresh bucket.
  assert.equal((await post(baseUrl, "/refresh", {})).status, 200);
});
