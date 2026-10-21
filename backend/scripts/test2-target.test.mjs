import assert from "node:assert/strict";
import test from "node:test";
import { TARGET, isolatedEnvironment, validateTarget } from "./test2-target.mjs";

const safe = `postgresql://${TARGET.role}:synthetic-only@${TARGET.host}/${TARGET.database}?sslmode=require`;
test("only the explicit direct Test 2 target passes", () => {
  assert.equal(validateTarget(safe), safe);
  for (const value of [
    "",
    "not-a-url",
    safe.replace(TARGET.host, "localhost"),
    safe.replace(TARGET.host, TARGET.host.replace(".c-8", "-pooler.c-8")),
    safe.replace(TARGET.database, "diewish_staging"),
    safe.replace(TARGET.role, "other_owner"),
    safe.replace("sslmode=require", "sslmode=disable"),
    `${safe}&schema=other`,
    `${safe}&sslmode=disable`,
    `${safe}&options=-csearch_path%3Dother`,
    `${safe}#fragment`,
    safe.replace(`${TARGET.host}/`, `${TARGET.host}:1234/`),
    safe.replace("synthetic-only", ""),
  ]) {
    assert.throws(() => validateTarget(value));
  }
});

test("test environment discards external credentials and keeps features off", () => {
  const env = isolatedEnvironment(safe, {
    PATH: "/bin",
    DATABASE_URL: "wrong",
    SMTP_PASSWORD: "do-not-inherit",
    FIREBASE_WEB_API_KEY: "do-not-inherit",
    AI_API_KEY: "do-not-inherit",
    COACH_SYNC_ENABLED: "true",
    NODE_OPTIONS: "untrusted",
  });
  assert.equal(env.DATABASE_URL, safe);
  assert.equal(env.NODE_ENV, "test");
  for (const key of ["SMTP_PASSWORD", "FIREBASE_WEB_API_KEY", "AI_API_KEY", "NODE_OPTIONS"]) {
    assert.equal(env[key], undefined);
  }
  for (const key of [
    "ACCOUNT_SAFE_LINKING_ENABLED",
    "PHONE_PASSWORD_AUTH_ENABLED",
    "PHONE_SMS_RECOVERY_ENABLED",
    "COACH_SYNC_ENABLED",
    "STAGING_AUTOMATION_ENABLED",
    "NUTRITION_JOBS_ENABLED",
    "SCHEDULER_TRIGGER_ENABLED",
  ])
    assert.equal(env[key], "false");
  assert.notEqual(env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET);
  assert.notEqual(env.JWT_ACCESS_SECRET, isolatedEnvironment(safe).JWT_ACCESS_SECRET);
});
