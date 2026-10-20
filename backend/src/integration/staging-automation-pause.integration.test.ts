import assert from "node:assert/strict";
import crypto from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { env } from "../config/env";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";
import { mailer } from "../lib/mailer";
import { accountController } from "../modules/account/account.controller";
import { servePasswordResetDelivery } from "../modules/account/password-reset-request-delivery";
import { createRequireSchedulerIdentity } from "../middleware/require-scheduler-identity";
import { notificationService } from "../modules/notifications/notification.service";
import { hashToken } from "../utils/jwt";

test("staging pause preserves inbox, preferences and read state across reload", async (t) => {
  const previous = { ...env };
  t.after(() => Object.assign(env, previous));
  Object.assign(env, { DIEWISH_ENVIRONMENT: "staging", STAGING_AUTOMATION_ENABLED: false });
  const user = await prisma.user.create({
    data: { email: `${crypto.randomUUID()}@example.invalid`, passwordHash: "synthetic" },
  });
  t.after(async () => {
    await prisma.user.delete({ where: { id: user.id } });
  });
  await notificationService.updatePreferences(user.id, { coachTips: true });
  const row = await prisma.notification.create({
    data: {
      userId: user.id,
      type: "PROACTIVE_MESSAGE",
      title: "Existing coach notification",
      body: "Preserved",
      scheduledFor: new Date(Date.now() - 2_000),
      deliveredAt: new Date(Date.now() - 1_000),
    },
  });
  const preferences = await notificationService.getPreferences(user.id);
  assert.equal(preferences.coachTips, true);
  const before = await notificationService.listInbox(user.id);
  assert.ok(before.notifications.some((item) => item.id === row.id));
  await notificationService.markRead(user.id, row.id);
  const after = await notificationService.listInbox(user.id);
  assert.ok(after.notifications.find((item) => item.id === row.id)?.readAt);
  assert.deepEqual(await notificationService.getPreferences(user.id), preferences);
  const preserved = await prisma.notification.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(preserved.body, row.body);
  assert.deepEqual(preserved.scheduledFor, row.scheduledFor);
  assert.deepEqual(preserved.deliveredAt, row.deliveredAt);
});

test("paused /tick rejects before recovery queries; manual Coach route remains mounted", async (t) => {
  const previous = { ...env };
  t.after(() => Object.assign(env, previous));
  Object.assign(env, { DIEWISH_ENVIRONMENT: "staging", STAGING_AUTOMATION_ENABLED: false });
  const server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  let queries = 0;
  let blocking = true;
  t.after(() => {
    blocking = false;
  });
  prisma.$use(async (params, next) => {
    if (blocking && params.model === "PasswordResetDelivery") {
      queries++;
      throw new Error("No background SQL");
    }
    return next(params);
  });
  const response = await fetch(base + "/internal/scheduler/tick", { method: "POST" });
  assert.equal(response.status, 404);
  assert.equal(
    ((await response.json()) as { error: { code: string } }).error.code,
    "STAGING_AUTOMATION_PAUSED",
  );
  assert.equal(queries, 0);
  assert.equal((await fetch(base + "/ai-chat/conversations")).status, 401);
});

test("request worker keeps HTTP active through SMTP; public known/unknown replies match", async (t) => {
  const previous = { ...env };
  t.after(() => Object.assign(env, previous));
  Object.assign(env, {
    DIEWISH_ENVIRONMENT: "staging",
    STAGING_AUTOMATION_ENABLED: false,
    SCHEDULER_TRIGGER_ENABLED: true,
    SCHEDULER_OIDC_AUDIENCE: "https://backend-staging-example.run.app",
    SCHEDULER_SERVICE_ACCOUNT_EMAIL: "diewish-staging-runtime@example.iam.gserviceaccount.com",
    SMTP_HOST: "synthetic",
    SMTP_USER: "synthetic",
    SMTP_PASSWORD: "synthetic",
    SMTP_FROM: "test@example.invalid",
  });
  const user = await prisma.user.create({
    data: { email: `${crypto.randomUUID()}@example.invalid`, passwordHash: "synthetic" },
  });
  const other = await prisma.user.create({
    data: { email: `${crypto.randomUUID()}@example.invalid`, passwordHash: "synthetic" },
  });
  t.after(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
  });
  // Another owner's pending row must not be drained by this request.
  await prisma.passwordResetDelivery.create({ data: { userId: other.id } });
  let release!: () => void;
  let entered!: () => void;
  const smtpEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const smtpGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let sentToken = "";
  let sends = 0;
  t.mock.method(mailer, "sendPasswordReset", async (to: string, raw: string) => {
    assert.equal(to, user.email);
    sends++;
    sentToken = raw;
    entered();
    await smtpGate;
  });
  const app = express();
  app.use(express.json());
  app.post("/forgot", accountController.forgotPassword);
  app.post(
    "/api/internal/scheduler/password-reset",
    createRequireSchedulerIdentity({
      enabled: true,
      verifyToken: async (token) => {
        assert.equal(token, "synthetic-id-token");
      },
    }),
    servePasswordResetDelivery,
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const originalFetch = globalThis.fetch;
  let workerCompleted = false;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (String(input).startsWith("http://metadata.google.internal/"))
        return new Response("synthetic-id-token");
      if (String(input).startsWith("https://backend-staging-example.run.app")) {
        const response = await originalFetch(
          String(input).replace("https://backend-staging-example.run.app", base),
          init,
        );
        const text = response.text.bind(response);
        t.mock.method(response, "text", async () => {
          const result = await text();
          workerCompleted = true;
          return result;
        });
        return response;
      }
      return originalFetch(input, init);
    },
  );
  t.after(async () => {
    release();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const post = (email: string) =>
    originalFetch(base + "/forgot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
  const known = await post(user.email);
  await smtpEntered;
  assert.equal(known.status, 200);
  assert.equal(
    workerCompleted,
    false,
    "public response ends while separate worker HTTP request remains active",
  );
  const unknown = await post("unknown@example.invalid");
  assert.deepEqual(await known.json(), await unknown.json());
  // A second request overlaps SMTP but cannot claim/send this row twice.
  await post(user.email);
  release();
  for (let pass = 0; pass < 100; pass++) {
    const job = await prisma.passwordResetDelivery.findUnique({ where: { userId: user.id } });
    if (job?.completedAt) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(sends, 1);
  const job = await prisma.passwordResetDelivery.findUniqueOrThrow({ where: { userId: user.id } });
  assert.ok(job.completedAt);
  assert.equal(job.attempts, 1);
  assert.equal(
    (await prisma.passwordResetDelivery.findUniqueOrThrow({ where: { userId: other.id } }))
      .attempts,
    0,
  );
  const token = await prisma.accountToken.findFirstOrThrow({
    where: { userId: user.id, usedAt: null },
  });
  assert.equal(token.tokenHash, hashToken(sentToken));
  assert.notEqual(token.tokenHash, sentToken);
});
