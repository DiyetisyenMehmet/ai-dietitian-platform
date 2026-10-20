import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { createApp } from "../app";
import { coachJobs } from "../modules/ai-coach/coach-jobs";
import { notificationService } from "../modules/notifications/notification.service";
import { tick, startCoachScheduler } from "./coach-scheduler";
import { stagingAutomationPaused } from "./automation-policy";

test("serving-source backport: all scheduled entry points stop before timers or SQL", async (t) => {
  const previous = { ...env }; t.after(() => Object.assign(env, previous));
  Object.assign(env, { DIEWISH_ENVIRONMENT: "staging", STAGING_AUTOMATION_ENABLED: false });
  let queries = 0; let blocking = true;
  t.after(() => { blocking = false; });
  prisma.$use(async (params, next) => { if (blocking) { queries++; throw new Error("Unexpected SQL"); } return next(params); });
  t.mock.method(globalThis, "setInterval", () => { throw new Error("Unexpected timer"); });
  startCoachScheduler();
  for (const instant of ["2026-11-01T17:00:00Z", "2026-11-01T18:00:00Z", "2026-11-01T05:00:00Z"]) await tick(new Date(instant));
  await coachJobs.runDailyProactive(); await coachJobs.runWeeklyReviews(); await coachJobs.runMonthlyReviews(); await coachJobs.dispatchNotifications();
  assert.equal(await notificationService.dispatchDue(), 0); assert.equal(queries, 0);
});
test("serving-source backport: production unaffected and staging needs explicit opt-in", (t) => {
  const previous = { ...env }; t.after(() => Object.assign(env, previous));
  Object.assign(env, { DIEWISH_ENVIRONMENT: "production", STAGING_AUTOMATION_ENABLED: false });
  assert.equal(stagingAutomationPaused(), false);
  env.DIEWISH_ENVIRONMENT = "staging"; assert.equal(stagingAutomationPaused(), true);
  env.STAGING_AUTOMATION_ENABLED = true; assert.equal(stagingAutomationPaused(), false);
});
test("serving-source backport: tick rejects without DB; existing recovery and Coach routes remain mounted", async (t) => {
  const previous = { ...env }; t.after(() => Object.assign(env, previous));
  Object.assign(env, { DIEWISH_ENVIRONMENT: "staging", STAGING_AUTOMATION_ENABLED: false });
  const server = createApp().listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const response = await fetch(base + "/internal/scheduler/tick", { method: "POST" });
  assert.equal(response.status, 404);
  assert.equal((await response.json() as { error: { code: string } }).error.code, "STAGING_AUTOMATION_PAUSED");
  assert.equal((await fetch(base + "/account/password/forgot", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 422);
  assert.equal((await fetch(base + "/ai-chat/conversations")).status, 401);
});
