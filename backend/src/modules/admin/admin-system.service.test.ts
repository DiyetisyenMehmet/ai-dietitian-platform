import assert from "node:assert/strict";
import test from "node:test";

import { env } from "../../config/env";
import { configuredChecks, overallStatus } from "./admin-system.service";

test("system health never treats unmonitored services as healthy", () => {
  assert.equal(
    overallStatus({
      a: { status: "healthy", detail: "ok" },
      b: { status: "unknown", detail: "unknown" },
    }),
    "unknown",
  );
  assert.equal(
    overallStatus({
      a: { status: "attention", detail: "paused" },
      b: { status: "unknown", detail: "unknown" },
    }),
    "attention",
  );
  assert.equal(
    overallStatus({
      a: { status: "problem", detail: "down" },
      b: { status: "attention", detail: "paused" },
    }),
    "problem",
  );
  assert.equal(overallStatus({ a: { status: "healthy", detail: "ok" } }), "healthy");
});

test("configuration status does not disclose values or claim scheduler/provider runtime success", () => {
  const original = {
    key: env.FIREBASE_WEB_API_KEY,
    environment: env.DIEWISH_ENVIRONMENT,
    enabled: env.STAGING_AUTOMATION_ENABLED,
  };
  try {
    env.DIEWISH_ENVIRONMENT = "staging";
    env.STAGING_AUTOMATION_ENABLED = false;
    env.FIREBASE_WEB_API_KEY = "SENTINEL_DO_NOT_DISCLOSE";
    const checks = configuredChecks();
    assert.equal(checks.scheduler.status, "attention");
    assert.match(checks.scheduler.detail, /duraklatılmış/);
    assert.equal(checks.frontend.status, "unknown");
    assert.equal(checks.criticalServices.status, "unknown");
    assert.match(checks.authentication.detail, /sınanmadı/);
    assert.equal(JSON.stringify(checks).includes(env.FIREBASE_WEB_API_KEY), false);
    env.STAGING_AUTOMATION_ENABLED = true;
    assert.equal(configuredChecks().scheduler.status, "unknown");
    env.FIREBASE_WEB_API_KEY = "";
    assert.equal(configuredChecks().authentication.status, "attention");
  } finally {
    env.FIREBASE_WEB_API_KEY = original.key;
    env.DIEWISH_ENVIRONMENT = original.environment;
    env.STAGING_AUTOMATION_ENABLED = original.enabled;
  }
});
