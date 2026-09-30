import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express, { type ErrorRequestHandler } from "express";
import jwt from "jsonwebtoken";

import { createRequireSchedulerIdentity } from "../middleware/require-scheduler-identity";
import { ApiError } from "../utils/api-error";
import { verifySchedulerOidcToken } from "./scheduler-identity";

const AUDIENCE = "https://scheduler-target.example.invalid";
const SERVICE_ACCOUNT = "diewish-staging-runtime@example.iam.gserviceaccount.com";

test("scheduler OIDC verifier accepts only the expected Google service identity", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

  const token = jwt.sign(
    { email: SERVICE_ACCOUNT, email_verified: true },
    privateKey,
    {
      algorithm: "RS256",
      keyid: "integration-key",
      issuer: "https://accounts.google.com",
      audience: AUDIENCE,
      subject: "1234567890",
      expiresIn: "5m",
    },
  );

  const claims = await verifySchedulerOidcToken(
    token,
    { audience: AUDIENCE, serviceAccountEmail: SERVICE_ACCOUNT },
    async (kid) => (kid === "integration-key" ? publicPem : null),
  );
  assert.equal(claims.email, SERVICE_ACCOUNT);

  await assert.rejects(
    () =>
      verifySchedulerOidcToken(
        token,
        { audience: "https://wrong.example.invalid", serviceAccountEmail: SERVICE_ACCOUNT },
        async () => publicPem,
      ),
  );
  await assert.rejects(
    () =>
      verifySchedulerOidcToken(
        token,
        { audience: AUDIENCE, serviceAccountEmail: "other@example.iam.gserviceaccount.com" },
        async () => publicPem,
      ),
  );
});

async function withGuardServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = express();
  app.post(
    "/trigger",
    createRequireSchedulerIdentity({
      enabled: true,
      verifyToken: async (token) => {
        if (token !== "valid-scheduler-token") throw new Error("invalid");
      },
    }),
    (_req, res) => {
      res.status(204).end();
    },
  );

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ApiError) {
      res.status(error.statusCode).json({ code: error.code });
      return;
    }
    res.status(500).json({ code: "INTERNAL_SERVER_ERROR" });
  };
  app.use(errorHandler);

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("scheduler trigger guard blocks unauthenticated and invalid callers", async () => {
  await withGuardServer(async (baseUrl) => {
    const missing = await fetch(`${baseUrl}/trigger`, { method: "POST" });
    assert.equal(missing.status, 401);

    const invalid = await fetch(`${baseUrl}/trigger`, {
      method: "POST",
      headers: { authorization: "Bearer invalid-token" },
    });
    assert.equal(invalid.status, 403);

    const accepted = await fetch(`${baseUrl}/trigger`, {
      method: "POST",
      headers: { authorization: "Bearer valid-scheduler-token" },
    });
    assert.equal(accepted.status, 204);
  });
});
