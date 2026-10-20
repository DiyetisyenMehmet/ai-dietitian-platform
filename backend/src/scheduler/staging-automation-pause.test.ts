import assert from "node:assert/strict";
import test from "node:test";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { coachJobs } from "../modules/ai-coach/coach-jobs";
import { notificationService } from "../modules/notifications/notification.service";
import {
  startPasswordResetDelivery,
  drainPasswordResetDeliveries,
} from "../modules/account/password-reset-delivery";
import { requestPasswordResetDelivery } from "../modules/account/password-reset-request-delivery";
import { stagingAutomationPaused } from "./automation-policy";
import { tick, startCoachScheduler, stopCoachScheduler } from "./coach-scheduler";

test("paused staging: every recurring entry point returns before timers, SQL or providers", async (t) => {
  const previous = { ...env };
  t.after(() => {
    Object.assign(env, previous);
    stopCoachScheduler();
  });
  env.DIEWISH_ENVIRONMENT = "staging";
  env.STAGING_AUTOMATION_ENABLED = false;
  let unexpected = 0;
  const forbidden = () => {
    unexpected++;
    throw new Error("Unexpected background work");
  };
  t.mock.method(globalThis, "setInterval", forbidden);
  prisma.$use(async () => forbidden());
  startCoachScheduler();
  startPasswordResetDelivery();
  // Daily, Sunday weekly and month-start slots, plus direct dispatch entry.
  for (const date of ["2026-11-01T17:00:00Z", "2026-11-01T18:00:00Z", "2026-11-01T05:00:00Z"])
    await tick(new Date(date));
  await coachJobs.runDailyProactive();
  await coachJobs.runWeeklyReviews();
  await coachJobs.runMonthlyReviews();
  await coachJobs.dispatchNotifications();
  await drainPasswordResetDeliveries();
  assert.equal(await notificationService.dispatchDue(), 0);
  assert.equal(unexpected, 0);
});

test("pause policy affects staging only and needs explicit opt-in to re-enable", (t) => {
  const previous = { ...env };
  t.after(() => Object.assign(env, previous));
  env.STAGING_AUTOMATION_ENABLED = false;
  for (const environment of ["production", "development", "test"] as const) {
    env.DIEWISH_ENVIRONMENT = environment;
    assert.equal(stagingAutomationPaused(), false);
  }
  env.DIEWISH_ENVIRONMENT = "staging";
  assert.equal(stagingAutomationPaused(), true);
  env.STAGING_AUTOMATION_ENABLED = true;
  assert.equal(stagingAutomationPaused(), false);
});

test("request recovery waits for authenticated acceptance, never SMTP completion", async (t) => {
  const previous = { ...env };
  t.after(() => Object.assign(env, previous));
  Object.assign(env, {
    SCHEDULER_TRIGGER_ENABLED: true,
    SCHEDULER_OIDC_AUDIENCE: "https://backend-staging-example.run.app",
    SCHEDULER_SERVICE_ACCOUNT_EMAIL: "diewish-staging-runtime@example.iam.gserviceaccount.com",
  });
  const bodies: unknown[] = [];
  const streams: ReadableStreamDefaultController<Uint8Array>[] = [];
  t.after(() => streams.forEach((stream) => stream.close()));
  t.mock.method(
    globalThis,
    "fetch",
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = String(input);
      if (url.startsWith("http://metadata.google.internal/")) {
        assert.equal((init?.headers as Record<string, string>)["Metadata-Flavor"], "Google");
        return new Response("synthetic-google-id-token");
      }
      assert.equal(
        url,
        "https://backend-staging-example.run.app/api/internal/scheduler/password-reset",
      );
      assert.equal(
        (init?.headers as Record<string, string>).authorization,
        "Bearer synthetic-google-id-token",
      );
      assert.equal(init?.redirect, "error");
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(
        new ReadableStream({
          start(controller) {
            streams.push(controller);
          },
        }),
        { status: 202 },
      );
    },
  );
  await requestPasswordResetDelivery("00000000-0000-4000-8000-000000000001");
  await requestPasswordResetDelivery(null);
  assert.deepEqual(bodies, [{ userId: "00000000-0000-4000-8000-000000000001" }, { userId: null }]);
  assert.equal(
    streams.length,
    2,
    "both account classes acknowledge while worker bodies are still open",
  );
});

test("handoff failure is an honest uniform 503; no fire-and-forget acceptance", async (t) => {
  const previous = { ...env };
  t.after(() => Object.assign(env, previous));
  Object.assign(env, {
    SCHEDULER_TRIGGER_ENABLED: true,
    SCHEDULER_OIDC_AUDIENCE: "https://backend-staging-example.run.app",
    SCHEDULER_SERVICE_ACCOUNT_EMAIL: "diewish-staging-runtime@example.iam.gserviceaccount.com",
  });
  t.mock.method(globalThis, "fetch", async () => new Response("", { status: 503 }));
  for (const userId of [null, "00000000-0000-4000-8000-000000000001"])
    await assert.rejects(requestPasswordResetDelivery(userId), {
      statusCode: 503,
      code: "EMAIL_DELIVERY_UNAVAILABLE",
    });
});
