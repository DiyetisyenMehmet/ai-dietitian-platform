import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import {
  changeSchema,
  recordCoachChange,
  publishCoachChange,
  sameCoachDatabase,
  COACH_LISTENER_ROLE,
} from "./coach-events";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";

const userId = "11111111-1111-4111-8111-111111111111";
const conversationId = "22222222-2222-4222-8222-222222222222";
test("listener accepts only the fixed restricted account on the same direct database", () => {
  const pooled = "postgresql://runtime:synthetic@ep-test-pooler.eu.neon.tech/diewish";
  const direct = `postgresql://${COACH_LISTENER_ROLE}:synthetic@ep-test.eu.neon.tech/diewish`;
  assert.equal(sameCoachDatabase(pooled, direct), true);
  for (const role of [
    "runtime",
    "migration",
    "diewish_staging_owner",
    "diewish_staging_app",
    "other",
  ])
    assert.equal(sameCoachDatabase(pooled, direct.replace(COACH_LISTENER_ROLE, role)), false);
  assert.equal(sameCoachDatabase(pooled, direct.replace("ep-test.", "ep-test-pooler.")), false);
  assert.equal(sameCoachDatabase(pooled, direct.replace("/diewish", "/other")), false);
  assert.equal(sameCoachDatabase(pooled, direct.replace("ep-test.", "ep-other.")), false);
  assert.equal(sameCoachDatabase(pooled, direct.replace("/diewish", ":5433/diewish")), false);
  assert.equal(sameCoachDatabase(pooled, direct.replace("postgresql:", "https:")), false);
  assert.equal(sameCoachDatabase(pooled.replace("postgresql:", "https:"), direct), false);
  assert.equal(sameCoachDatabase("not-a-url", direct), false);
  assert.equal(sameCoachDatabase(pooled, "not-a-url"), false);
});
test("listener identity/endpoint cannot be overridden through connection query parameters", () => {
  const query = "postgresql://runtime:synthetic@ep-test-pooler.eu.neon.tech/diewish";
  const listener = `postgresql://${COACH_LISTENER_ROLE}:synthetic@ep-test.eu.neon.tech/diewish`;
  assert.equal(
    sameCoachDatabase(query + "?schema=public", listener + "?sslmode=verify-full"),
    true,
  );
  for (const override of [
    "user=migration",
    "%75ser=migration",
    "USER=migration",
    "password=other",
    "host=ep-other.eu.neon.tech",
    "hostaddr=127.0.0.2",
    "port=5433",
    "database=other",
    "dbname=other",
    "options=-c%20role%3Dmigration",
    "role=migration",
    "service=other",
  ]) {
    assert.equal(sameCoachDatabase(query, listener + "?" + override), false, override);
    assert.equal(sameCoachDatabase(query + "?" + override, listener), false, override);
  }
  assert.equal(sameCoachDatabase(query, listener + "#ignored"), false);
});
test("event envelope strictly excludes PHI, credentials and extra fields", () => {
  const valid = { userId, conversationId, type: "turn", version: "1" };
  assert.ok(changeSchema.safeParse(valid).success);
  for (const field of ["content", "health", "token", "title", "allergies"]) {
    assert.ok(!changeSchema.safeParse({ ...valid, [field]: "secret" }).success);
  }
  for (const version of ["-1", "1.5", "0", "1e3"])
    assert.ok(!changeSchema.safeParse({ ...valid, version }).success);
});
test("durable watermark increment uses the caller's transaction and owner", async () => {
  let argumentsReceived: unknown;
  const tx = {
    coachSyncRevision: {
      upsert: async (args: unknown) => {
        argumentsReceived = args;
        return { version: 9007199254740993n };
      },
    },
  };
  const change = await recordCoachChange(
    tx as unknown as Prisma.TransactionClient,
    userId,
    conversationId,
    "deleted",
  );
  assert.equal(change.version, "9007199254740993");
  assert.deepEqual(argumentsReceived, {
    where: { userId },
    create: { userId, version: 1n },
    update: { version: { increment: 1n } },
  });
});
test("notification failure does not reject saved-turn response", async () => {
  const original = prisma.$executeRaw,
    enabled = env.COACH_SYNC_ENABLED;
  try {
    env.COACH_SYNC_ENABLED = true;
    prisma.$executeRaw = (() =>
      Promise.reject(new Error("transport unavailable"))) as typeof prisma.$executeRaw;
    assert.equal(
      publishCoachChange({ userId, conversationId, type: "turn", version: "1" }),
      undefined,
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
  } finally {
    prisma.$executeRaw = original;
    env.COACH_SYNC_ENABLED = enabled;
  }
});
