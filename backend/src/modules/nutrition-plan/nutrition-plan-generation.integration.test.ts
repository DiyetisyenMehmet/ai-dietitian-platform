import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../../app";
import { prisma } from "../../lib/prisma";
import { FixtureAdapter } from "./test-fixtures/provider";
import { setAIAdapter } from "../blood-test-analysis/ai-adapter/ai-adapter.factory";
import type { NutritionPlan } from "@prisma/client";
import type { NutritionPlanContent } from "./types";
import { disconnectNutritionGenerationLocks } from "./nutrition-plan-generation-lock";

interface ResponseBody {
  data: {
    user: { id: string };
    tokens: { accessToken: string };
    plan: Omit<NutritionPlan, "startDate"> & {
      startDate: string;
      dailyPlans: NutritionPlanContent;
    };
    plans: NutritionPlan[];
  };
  error: { code: string; details: { reason?: string } };
}

test("nutrition generation: duration, safety gates, bounded retry, persistence and duplicates", async (t) => {
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api`;
  const ids: string[] = [];
  const request = async (path: string, token: string, body?: unknown) => {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as ResponseBody };
  };
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
    await disconnectNutritionGenerationLocks();
  });
  const fixture = async (premium = false) => {
    const reg = await request("/auth/register", "", {
      email: `nutrition-${Date.now()}-${ids.length}@example.com`,
      password: "LocalFixture123!",
      fullName: "Nutrition Test",
    });
    assert.equal(reg.status, 201);
    const { user, tokens } = reg.body.data;
    ids.push(user.id);
    const token = tokens.accessToken;
    for (const type of ["TERMS_OF_SERVICE", "MEDICAL_DISCLAIMER", "KVKK_EXPLICIT_CONSENT"])
      assert.equal((await request("/legal/consents", token, { type })).status, 200);
    assert.equal(
      (
        await request("/onboarding", token, {
          fullName: "Nutrition Test",
          dateOfBirth: "1990-05-20",
          gender: "PREFER_NOT_TO_SAY",
          heightCm: 175,
          currentWeightKg: 70,
          targetWeightKg: 65,
          activityLevel: "MODERATE",
          healthConditions: [],
          allergies: [],
          dietaryPreference: "OMNIVORE",
          dailyWaterGoalMl: 2500,
          workScheduleType: "REGULAR",
          usualWakeTime: "07:00",
          usualSleepTime: "23:00",
        })
      ).status,
      200,
    );
    if (premium) {
      await prisma.user.update({ where: { id: user.id }, data: { subscriptionTier: "PREMIUM" } });
      await prisma.subscription.create({
        data: {
          userId: user.id,
          tier: "PREMIUM",
          status: "ACTIVE",
          currentPeriodEnd: new Date(Date.now() + 86400000 * 30),
        },
      });
    }
    return { id: user.id, token };
  };
  const generate = (token: string, duration = "SEVEN_DAY") =>
    request("/nutrition-plans/generate", token, {
      duration,
      startDate: new Date().toISOString().slice(0, 10),
    });
  const counts = async (id: string) => [
    await prisma.nutritionPlan.count({ where: { userId: id } }),
    await prisma.aiUsageEvent.count({ where: { userId: id, feature: "NUTRITION_PLAN" } }),
  ];

  await t.test("eligible FREE 7; FREE 14/30 restrictions; lifetime quota", async () => {
    const user = await fixture();
    const adapter = new FixtureAdapter();
    setAIAdapter(adapter);
    for (const duration of ["FOURTEEN_DAY", "THIRTY_DAY"]) {
      const res = await generate(user.token, duration);
      assert.equal(res.status, 403);
      assert.equal(res.body.error.details.reason, "FREE_DURATION_RESTRICTED");
    }
    const res = await generate(user.token);
    assert.equal(res.status, 201);
    assert.equal(res.body.data.plan.dailyPlans.cycle.length, 7);
    assert.equal(adapter.calls, 2);
    assert.deepEqual(await counts(user.id), [1, 1]);
    assert.equal((await generate(user.token)).body.error.details.reason, "FREE_TRIAL_EXHAUSTED");
  });
  await t.test("Premium 7/14/30, unique days, calendar, history and reload", async () => {
    const user = await fixture(true);
    setAIAdapter(new FixtureAdapter());
    const planIds: string[] = [];
    for (const [duration, days] of [
      ["SEVEN_DAY", 7],
      ["FOURTEEN_DAY", 14],
      ["THIRTY_DAY", 30],
    ] as const) {
      const res = await generate(user.token, duration);
      assert.equal(res.status, 201);
      const plan = res.body.data.plan;
      planIds.push(plan.id);
      assert.equal(plan.status, "COMPLETED");
      assert.equal(plan.isActive, true);
      assert.equal(plan.duration, duration);
      assert.equal(plan.dailyPlans.durationDays, days);
      assert.equal(plan.dailyPlans.cycleLengthDays, days);
      assert.equal(
        new Set(plan.dailyPlans.cycle.map((d: { dayLabel: string }) => d.dayLabel)).size,
        days,
      );
      assert.deepEqual(
        plan.dailyPlans.calendar.map((d: { cycleIndex: number }) => d.cycleIndex),
        Array.from({ length: days }, (_, i) => i),
      );
      assert.equal(plan.startDate.slice(0, 10), new Date().toISOString().slice(0, 10));
    }
    const listed = await request("/nutrition-plans", user.token);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.plans.length, 3);
    assert.equal(listed.body.data.plans.filter((p: { isActive: boolean }) => p.isActive).length, 1);
    assert.equal(
      listed.body.data.plans.find((p: { isActive: boolean }) => p.isActive)?.id,
      planIds[2],
    );
    assert.deepEqual(await counts(user.id), [3, 3]);
  });
  await t.test("consent, weight check-in, safety and paid quota block before AI", async () => {
    const user = await fixture(true);
    const adapter = new FixtureAdapter();
    setAIAdapter(adapter);
    await prisma.consentRecord.updateMany({
      where: { userId: user.id },
      data: { granted: false, withdrawnAt: new Date() },
    });
    assert.equal((await generate(user.token)).body.error.code, "CONSENT_REQUIRED");
    await prisma.consentRecord.updateMany({
      where: { userId: user.id },
      data: { granted: true, withdrawnAt: null },
    });
    await prisma.weightLog.updateMany({
      where: { userId: user.id },
      data: { loggedAt: new Date(Date.now() - 86400000 * 9) },
    });
    assert.equal((await generate(user.token)).body.error.code, "WEIGHT_CHECK_IN_REQUIRED");
    await prisma.weightLog.updateMany({
      where: { userId: user.id },
      data: { loggedAt: new Date() },
    });
    await prisma.userProfile.update({ where: { userId: user.id }, data: { targetWeightKg: 40 } });
    assert.equal(
      (await generate(user.token)).body.error.code,
      "NUTRITION_PLAN_SAFETY_REVIEW_REQUIRED",
    );
    await prisma.userProfile.update({ where: { userId: user.id }, data: { targetWeightKg: 65 } });
    await prisma.aiUsageEvent.createMany({
      data: Array.from({ length: 15 }, () => ({
        userId: user.id,
        feature: "NUTRITION_PLAN" as const,
        provider: "fixture",
        model: "fixture",
      })),
    });
    assert.equal((await generate(user.token)).body.error.code, "AI_QUOTA_EXCEEDED");
    assert.equal(adapter.calls, 0);
    assert.deepEqual(await counts(user.id), [0, 15]);
  });
  await t.test("invalid nutrition output retries without bypass", async () => {
    const user = await fixture(true);
    const adapter = new FixtureAdapter();
    adapter.mode = "invalid-once";
    setAIAdapter(adapter);
    assert.equal((await generate(user.token)).status, 201);
    assert.equal(adapter.calls, 3);
    assert.deepEqual(await counts(user.id), [1, 1]);
  });
  await t.test("malformed JSON retries through actual provider parser", async () => {
    const user = await fixture(true);
    const adapter = new FixtureAdapter();
    adapter.mode = "malformed-once";
    setAIAdapter(adapter);
    assert.equal((await generate(user.token)).status, 201);
    assert.equal(adapter.calls, 3);
    assert.deepEqual(await counts(user.id), [1, 1]);
  });
  await t.test(
    "failed later batch and repeated malformed output never persist or charge",
    async () => {
      const user = await fixture(true);
      for (const mode of ["incomplete", "malformed"] as const) {
        const adapter = new FixtureAdapter();
        adapter.mode = mode;
        setAIAdapter(adapter);
        const res = await generate(user.token, "THIRTY_DAY");
        assert.equal(res.status, 502);
        assert.deepEqual(await counts(user.id), [0, 0]);
      }
    },
  );
  await t.test("double request does not create two plans or charge twice", async () => {
    const user = await fixture(true);
    const adapter = new FixtureAdapter();
    adapter.delay = 50;
    setAIAdapter(adapter);
    const results = await Promise.all([generate(user.token), generate(user.token)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.deepEqual(await counts(user.id), [1, 1]);
  });
  await t.test(
    "quota write failure rolls back new version and preserves previous active plan",
    async () => {
      const user = await fixture(true);
      setAIAdapter(new FixtureAdapter());
      const previous = await generate(user.token);
      assert.equal(previous.status, 201);
      await prisma.$executeRawUnsafe(
        `CREATE FUNCTION nutrition_fixture_reject_usage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'nutrition fixture write failure'; END $$`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER nutrition_fixture_usage_failure BEFORE INSERT ON ai_usage_events FOR EACH ROW EXECUTE FUNCTION nutrition_fixture_reject_usage()`,
      );
      try {
        assert.equal((await generate(user.token)).status, 500);
        assert.deepEqual(await counts(user.id), [1, 1]);
        const list = await request("/nutrition-plans", user.token);
        assert.equal(list.body.data.plans.find((p) => p.isActive)?.id, previous.body.data.plan.id);
      } finally {
        await prisma.$executeRawUnsafe(
          `DROP TRIGGER nutrition_fixture_usage_failure ON ai_usage_events`,
        );
        await prisma.$executeRawUnsafe(`DROP FUNCTION nutrition_fixture_reject_usage()`);
      }
      const retry = await generate(user.token);
      assert.equal(retry.status, 201);
      assert.equal(retry.body.data.plan.version, 2);
    },
  );
});
