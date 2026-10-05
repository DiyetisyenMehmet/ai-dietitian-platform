import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { env } from "../../config/env";
import { ApiError } from "../../utils/api-error";
import { withNutritionGenerationLock } from "./nutrition-plan-generation-lock";

test("another PostgreSQL session blocks generation; success and failure release the lock", async () => {
  const url = new URL(env.DATABASE_URL);
  url.searchParams.set("connection_limit", "1");
  const other = new PrismaClient({ datasourceUrl: url.toString(), log: [] });
  const userId = `nutrition-lock-fixture-${Date.now()}`,
    key = `nutrition-plan-generation:${userId}`;
  let providerCalls = 0;
  try {
    await other.$queryRaw`SELECT pg_advisory_lock(hashtextextended(${key}, 0))::text`;
    await assert.rejects(
      withNutritionGenerationLock(userId, async () => {
        providerCalls++;
      }),
      (error) =>
        error instanceof ApiError && error.code === "NUTRITION_PLAN_GENERATION_IN_PROGRESS",
    );
    assert.equal(providerCalls, 0);
    await other.$queryRaw`SELECT pg_advisory_unlock(hashtextextended(${key}, 0))`;
    await assert.rejects(
      withNutritionGenerationLock(userId, async () => {
        throw new Error("fixture failure");
      }),
      /fixture failure/,
    );
    assert.equal(await withNutritionGenerationLock(userId, async () => "success"), "success");
    const rows = await other.$queryRaw<
      Array<{ locked: boolean }>
    >`SELECT pg_try_advisory_lock(hashtextextended(${key}, 0)) AS locked`;
    assert.equal(rows[0]?.locked, true);
  } finally {
    await other.$disconnect();
  }
});
