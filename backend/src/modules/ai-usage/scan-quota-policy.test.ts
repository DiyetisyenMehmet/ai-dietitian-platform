import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { env } from "../../config/env";
import { ApiError } from "../../utils/api-error";
import { usageQuerySchema } from "./dto/ai-usage.schemas";
import { createScanQuotaService } from "./scan-quota.service";
import { FREE_CHAT_INTRO_DAILY_LIMIT, FREE_CHAT_INTRO_DAYS, QUOTA_MATRIX } from "./constants";
import {
  scanQuotaDigest,
  scanQuotaEnabled,
  scanQuotaStatus,
  type ScanQuotaConfiguration,
} from "./scan-quota-policy";

const config: ScanQuotaConfiguration = {
  NODE_ENV: "test",
  DIEWISH_ENVIRONMENT: "test",
  SCAN_QUOTA_FOUNDATION_ENABLED: true,
  SCAN_QUOTA_HASH_SECRET: "synthetic-scan-hash-secret-not-for-live-use",
  DATABASE_URL: "postgresql://fixture@127.0.0.1:5432/diewish_scan_quota_test",
};

test("foundation is default OFF; enabling outside the explicit test runtime is impossible", () => {
  assert.equal(env.SCAN_QUOTA_FOUNDATION_ENABLED, false);
  assert.equal(scanQuotaEnabled(config), true);
  for (const NODE_ENV of ["production", "development", "test"])
    for (const DIEWISH_ENVIRONMENT of ["production", "staging", "development", undefined])
      assert.equal(scanQuotaEnabled({ ...config, NODE_ENV, DIEWISH_ENVIRONMENT }), false);
  assert.equal(scanQuotaEnabled({ ...config, SCAN_QUOTA_FOUNDATION_ENABLED: false }), false);
  for (const DATABASE_URL of [
    "postgresql://fixture@db.example.invalid/diewish_scan_quota_test",
    "postgresql://fixture@127.0.0.1:5432/live_database",
    "invalid",
  ])
    assert.equal(scanQuotaEnabled({ ...config, DATABASE_URL }), false);
});

test("OFF status and every write fail closed with zero database access", async () => {
  let calls = 0;
  const db = new Proxy(
    {},
    {
      get() {
        calls++;
        throw new Error("OFF must never reach SQL");
      },
    },
  ) as PrismaClient;
  const service = createScanQuotaService(db, () => ({
    ...config,
    SCAN_QUOTA_FOUNDATION_ENABLED: false,
  }));
  const user = randomUUID(),
    op = randomUUID(),
    token = randomUUID();
  const state = await service.getStatus(user, "PHOTO_SCAN");
  assert.equal(state.reason, "SCAN_QUOTA_FOUNDATION_DISABLED");
  assert.equal(state.remaining, null);
  assert.equal(state.allowed, false);
  const disabled = (e: unknown) =>
    e instanceof ApiError && e.code === "SCAN_QUOTA_FOUNDATION_DISABLED";
  await assert.rejects(
    service.reserve(user, {
      feature: "PHOTO_SCAN",
      idempotencyKey: randomUUID(),
      input: Buffer.from("fixture"),
    }),
    disabled,
  );
  await assert.rejects(service.getOperation(user, op), disabled);
  await assert.rejects(
    service.complete(user, op, token, async () => null),
    disabled,
  );
  await assert.rejects(service.release(user, op, token, "CANCELED"), disabled);
  assert.equal(calls, 0);
});

test("enabled foundation with a missing dedicated hash secret never reaches SQL", async () => {
  const db = new Proxy(
    {},
    {
      get() {
        throw new Error("No SQL before configuration validation");
      },
    },
  ) as PrismaClient;
  const service = createScanQuotaService(db, () => ({ ...config, SCAN_QUOTA_HASH_SECRET: "" }));
  await assert.rejects(
    service.getStatus(randomUUID(), "PHOTO_SCAN"),
    (e: unknown) => e instanceof ApiError && e.code === "SCAN_QUOTA_HASH_UNCONFIGURED",
  );
});

test("reservation affects availability, never the visible successful-use counter", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  const status = scanQuotaStatus("PHOTO_SCAN", "FREE", now, { used: 2, inFlight: 1 });
  assert.equal(status.remaining, 1);
  assert.equal(status.used, 2);
  assert.equal(status.inFlight, 1);
  assert.equal(status.allowed, false);
  assert.equal(status.reason, "SCAN_QUOTA_IN_PROGRESS");
  assert.equal(status.resetsAt, null);
  assert.equal(status.serverNow, now.toISOString());
  assert.equal(
    scanQuotaStatus("PHOTO_SCAN", "FREE", now, { used: 3, inFlight: 0 }).reason,
    "FREE_SCAN_QUOTA_EXHAUSTED",
  );
  for (const tier of ["PREMIUM", "PREMIUM_PLUS"] as const) {
    const paid = scanQuotaStatus("BARCODE_SCAN", tier, now);
    assert.equal(paid.reason, "SCAN_QUOTA_PAID_POLICY_UNDEFINED");
    assert.equal(paid.limit, null);
    assert.equal(paid.remaining, null);
    assert.equal(paid.allowed, false);
  }
});

test("digest hides raw input and is separated by feature and dedicated secret", () => {
  const input = "synthetic-private-image-not-a-health-record";
  const hash = scanQuotaDigest(config.SCAN_QUOTA_HASH_SECRET, "PHOTO_SCAN", input);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash, scanQuotaDigest(config.SCAN_QUOTA_HASH_SECRET, "PHOTO_SCAN", input));
  assert.notEqual(hash, scanQuotaDigest(config.SCAN_QUOTA_HASH_SECRET, "BARCODE_SCAN", input));
  assert.notEqual(hash, scanQuotaDigest("different-synthetic-secret", "PHOTO_SCAN", input));
  assert.equal(hash.includes(input), false);
});

test("legacy HTTP usage filter and Coach quotas do not gain scan or paid limits", () => {
  assert.equal(usageQuerySchema.safeParse({ feature: "PHOTO_SCAN" }).success, false);
  assert.equal(usageQuerySchema.safeParse({ feature: "BARCODE_SCAN" }).success, false);
  assert.equal(FREE_CHAT_INTRO_DAYS, 7);
  assert.equal(FREE_CHAT_INTRO_DAILY_LIMIT, 10);
  assert.deepEqual(QUOTA_MATRIX.FREE.DIETITIAN_CHAT, { perDay: 5, perMonth: 100 });
  assert.deepEqual(QUOTA_MATRIX.PREMIUM.DIETITIAN_CHAT, { perDay: 20, perMonth: 400 });
  assert.deepEqual(QUOTA_MATRIX.PREMIUM_PLUS.DIETITIAN_CHAT, { perDay: 50, perMonth: 1000 });
  for (const tier of Object.values(QUOTA_MATRIX))
    assert.deepEqual(Object.keys(tier).sort(), [
      "BLOOD_TEST_ANALYSIS",
      "DIETITIAN_CHAT",
      "NUTRITION_PLAN",
    ]);
});
