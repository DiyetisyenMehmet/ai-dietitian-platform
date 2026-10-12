import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import {
  changeSchema,
  recordCoachChange,
  publishCoachChange,
  sameCoachDatabase,
} from "./coach-events";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";

const userId = "11111111-1111-4111-8111-111111111111";
const conversationId = "22222222-2222-4222-8222-222222222222";
test("listener configuration rejects pooling, a different DB/role and migration privilege reuse", () => {
  const pooled = "postgresql://runtime:synthetic@ep-test-pooler.eu.neon.tech/diewish";
  const direct = "postgresql://runtime:synthetic@ep-test.eu.neon.tech/diewish";
  assert.equal(sameCoachDatabase(pooled, direct), true);
  assert.equal(sameCoachDatabase(pooled, pooled), false);
  assert.equal(sameCoachDatabase(pooled, direct.replace("runtime:", "migration:")), false);
  assert.equal(sameCoachDatabase(pooled, direct.replace("/diewish", "/other")), false);
  assert.equal(sameCoachDatabase(pooled, direct.replace("ep-test.", "ep-other.")), false);
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
