import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createApp } from "../../app";
import { signAccessToken } from "../../utils/jwt";
import test from "node:test";
import { prisma } from "../../lib/prisma";
import { legalService } from "../legal/legal.service";
import { setAIAdapter } from "../blood-test-analysis/ai-adapter/ai-adapter.factory";
import { FixtureAdapter } from "./test-fixtures/provider";
import {
  nutritionGenerationJobs as jobs,
  runNutritionWorkerStep,
  expireNutritionJobs,
} from "./nutrition-generation-jobs";
import { nutritionRights } from "./nutrition-rights.service";
import { ApiError } from "../../utils/api-error";
import type { NutritionPlanContent, PlanDuration } from "./types";
import {
  reserveNutritionProviderCall,
  recordNutritionProviderUsage,
} from "./nutrition-provider-observer";
import type { ChatMessage } from "../blood-test-analysis/ai-adapter/openai-compatible.adapter";
import { publicNutritionPlan } from "./nutrition-plan-public";

test("durable nutrition: health gates, checkpoint, pause/resume, rights and one-meal changes", async (t) => {
  assert.equal(process.env.NODE_ENV, "test", "Integration fixtures require the test runtime");
  assert.match(
    process.env.DATABASE_URL ?? "",
    /@(?:127\.0\.0\.1|localhost):/,
    "Use an isolated local database only",
  );
  const ids: string[] = [];
  t.after(async () => {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });
  const fixture = async (tier: "FREE" | "PREMIUM" | "PREMIUM_PLUS" = "FREE") => {
    const user = await prisma.user.create({
      data: {
        email: `smart-${randomUUID()}@example.com`,
        passwordHash: "isolated-fixture",
        subscriptionTier: tier,
        onboardingCompleted: true,
        profile: {
          create: {
            dateOfBirth: new Date("1990-05-20"),
            gender: "PREFER_NOT_TO_SAY",
            heightCm: 175,
            currentWeightKg: 70,
            targetWeightKg: 65,
            activityLevel: "MODERATE",
            dietaryPreference: "OMNIVORE",
            healthConditions: [],
            allergies: [],
            dailyWaterGoalMl: 2500,
            workScheduleType: "REGULAR",
            usualWakeTime: "07:00",
            usualSleepTime: "23:00",
          },
        },
      },
    });
    ids.push(user.id);
    await prisma.weightLog.create({ data: { userId: user.id, weightKg: 70 } });
    for (const type of ["TERMS_OF_SERVICE", "MEDICAL_DISCLAIMER", "KVKK_EXPLICIT_CONSENT"] as const)
      await prisma.consentRecord.create({
        data: {
          userId: user.id,
          type,
          documentVersion: legalService.getDocument(type).version,
          granted: true,
        },
      });
    if (tier !== "FREE")
      await prisma.subscription.create({
        data: {
          userId: user.id,
          tier,
          status: "ACTIVE",
          currentPeriodStart: new Date(Date.now() - 86_400_000),
          currentPeriodEnd: new Date(Date.now() + 365 * 86_400_000),
        },
      });
    return user.id;
  };
  const start = (userId: string, duration: PlanDuration = "SEVEN_DAY") =>
    jobs.start(userId, { duration, requestKey: randomUUID() });
  const drain = async (userId: string, id: string) => {
    for (let step = 0; step < 7; step++) {
      const job = await jobs.get(userId, id);
      if (job.status === "READY") return job;
      assert.equal(await runNutritionWorkerStep(), true);
    }
    throw new Error("Job did not complete");
  };
  const rejectCode = (code: string) => (error: unknown) =>
    error instanceof ApiError && error.code === code;
  const provider = new FixtureAdapter();
  setAIAdapter(provider);

  await t.test("HTTP acceptance is 202, owner scoped, private and safely pausable", async () => {
    const id = await fixture(),
      other = await fixture();
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    const token = signAccessToken({ userId: id, email: user.email, role: user.role });
    const second = await prisma.user.findUniqueOrThrow({ where: { id: other } });
    const otherToken = signAccessToken({ userId: other, email: second.email, role: second.role });
    const server = createApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api/nutrition-plans/generation-jobs`;
    const request = async (path: string, access = token, body?: unknown) => {
      const res = await fetch(base + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: res.status,
        body: (await res.json()) as {
          data: { job: { id: string; status: string; expiresAt: string } };
          error: { code: string };
        },
      };
    };
    try {
      const payload = { duration: "SEVEN_DAY", requestKey: randomUUID() };
      const accepted = await request("", token, payload);
      assert.equal(accepted.status, 202);
      assert.equal("input" in accepted.body.data.job, false);
      assert.equal((await request("", token, payload)).body.data.job.id, accepted.body.data.job.id);
      const path = `/${accepted.body.data.job.id}`;
      assert.equal((await request(path, otherToken)).status, 404);
      const first = await request(path + "/pause", token, {}),
        secondPause = await request(path + "/pause", token, {});
      assert.equal(first.status, 200);
      assert.equal(first.body.data.job.status, "PAUSED");
      assert.equal(secondPause.body.data.job.expiresAt, first.body.data.job.expiresAt);
      await prisma.consentRecord.updateMany({ where: { userId: id }, data: { granted: false } });
      const blocked = await request("", token, { ...payload, requestKey: randomUUID() });
      assert.equal(blocked.status, 403);
      assert.equal(blocked.body.error.code, "CONSENT_REQUIRED");
      assert.equal((await request(path)).body.data.job.status, "PAUSED");
      assert.equal(await prisma.nutritionRightsEvent.count({ where: { userId: id } }), 0);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  await t.test(
    "FREE duration restriction; unsuccessful work never consumes the five-month right",
    async () => {
      const id = await fixture();
      for (const duration of ["FOURTEEN_DAY", "THIRTY_DAY"] as const)
        await assert.rejects(start(id, duration), rejectCode("SUBSCRIPTION_REQUIRED"));
      const job = await start(id);
      await runNutritionWorkerStep();
      assert.equal((await jobs.get(id, job.id)).completedDays, 5);
      assert.equal((await nutritionRights(id, "NEW_PLAN")).freeRemaining, 1);
      const paused = await jobs.pause(id, job.id);
      assert.equal(paused.status, "PAUSED");
      assert.equal(await runNutritionWorkerStep(), false);
      const before = provider.calls;
      const resumed = await start(id);
      assert.equal(resumed.id, job.id);
      await drain(id, job.id);
      assert.equal(provider.calls - before, 1);
      const plan = await jobs.deliver(id, job.id);
      assert.equal(plan.status, "COMPLETED");
      assert.equal((plan.dailyPlans as unknown as NutritionPlanContent).cycle.length, 7);
      assert.equal((await jobs.deliver(id, job.id)).id, plan.id);
      assert.equal(
        await prisma.aiUsageEvent.count({ where: { userId: id, feature: "NUTRITION_PLAN" } }),
        1,
      );
      assert.equal((await nutritionRights(id, "NEW_PLAN")).freeRemaining, 0);
      await assert.rejects(start(id), rejectCode("NUTRITION_RIGHT_EXHAUSTED"));
      await prisma.nutritionRightsEvent.updateMany({
        where: { userId: id },
        data: { createdAt: new Date("2026-01-01") },
      });
      assert.equal((await nutritionRights(id, "NEW_PLAN")).freeRemaining, 1);
    },
  );
  await t.test(
    "Premium and Plus complete 7/14/30 with single delivery and persistent unique days",
    async () => {
      for (const tier of ["PREMIUM", "PREMIUM_PLUS"] as const)
        for (const duration of ["SEVEN_DAY", "FOURTEEN_DAY", "THIRTY_DAY"] as const) {
          const id = await fixture(tier),
            job = await start(id, duration),
            before = provider.calls;
          await drain(id, job.id);
          const plan = await jobs.deliver(id, job.id),
            days = duration === "SEVEN_DAY" ? 7 : duration === "FOURTEEN_DAY" ? 14 : 30;
          assert.equal(provider.calls - before, Math.ceil(days / 5));
          assert.equal(
            new Set(
              (plan.dailyPlans as unknown as NutritionPlanContent).cycle.map((day) => day.dayLabel),
            ).size,
            days,
          );
          assert.equal(
            (await prisma.nutritionPlan.findUniqueOrThrow({ where: { id: plan.id } })).isActive,
            true,
          );
          assert.equal((await jobs.deliver(id, job.id)).id, plan.id);
        }
    },
  );
  await t.test(
    "double click coalesces; incomplete job cannot deliver or replace current active plan",
    async () => {
      const id = await fixture("PREMIUM");
      const first = await start(id);
      await drain(id, first.id);
      const original = await jobs.deliver(id, first.id);
      const key = randomUUID();
      const a = await jobs.start(id, { duration: "SEVEN_DAY", requestKey: key });
      const b = await jobs.start(id, { duration: "SEVEN_DAY", requestKey: key });
      assert.equal(a.id, b.id);
      await assert.rejects(jobs.deliver(id, a.id), rejectCode("NUTRITION_JOB_NOT_READY"));
      await jobs.pause(id, a.id);
      assert.equal(
        (await prisma.nutritionPlan.findUniqueOrThrow({ where: { id: original.id } })).isActive,
        true,
      );
    },
  );
  await t.test("consent, weigh-in, health and target changes block generation/reuse", async () => {
    const id = await fixture("PREMIUM");
    await prisma.consentRecord.updateMany({ where: { userId: id }, data: { granted: false } });
    await assert.rejects(start(id), rejectCode("CONSENT_REQUIRED"));
    await prisma.consentRecord.updateMany({ where: { userId: id }, data: { granted: true } });
    await prisma.weightLog.updateMany({
      where: { userId: id },
      data: { loggedAt: new Date(Date.now() - 9 * 86_400_000) },
    });
    await assert.rejects(start(id), rejectCode("WEIGHT_CHECK_IN_REQUIRED"));
    await prisma.weightLog.updateMany({ where: { userId: id }, data: { loggedAt: new Date() } });
    const a = await start(id);
    await runNutritionWorkerStep();
    await jobs.pause(id, a.id);
    await prisma.userProfile.update({ where: { userId: id }, data: { allergies: ["fıstık"] } });
    const b = await start(id);
    assert.notEqual(b.id, a.id);
    assert.equal(b.completedDays, 0);
    await jobs.pause(id, b.id);
    await prisma.userProfile.update({
      where: { userId: id },
      data: { allergies: [], targetWeightKg: 40 },
    });
    await assert.rejects(start(id), rejectCode("NUTRITION_PLAN_SAFETY_REVIEW_REQUIRED"));
    assert.equal(await prisma.nutritionRightsEvent.count({ where: { userId: id } }), 0);
  });
  await t.test(
    "pause during provider call preserves validated response and forbids activation",
    async () => {
      const id = await fixture();
      const job = await start(id);
      provider.delay = 100;
      const pending = runNutritionWorkerStep();
      await new Promise((resolve) => setTimeout(resolve, 40));
      await jobs.pause(id, job.id);
      await pending;
      provider.delay = 0;
      const state = await jobs.get(id, job.id);
      assert.equal(state.status, "PAUSED");
      assert.ok(state.completedDays === 0 || state.completedDays === 5);
      await assert.rejects(jobs.deliver(id, job.id), rejectCode("NUTRITION_JOB_NOT_READY"));
      assert.equal(await prisma.nutritionRightsEvent.count({ where: { userId: id } }), 0);
    },
  );
  await t.test(
    "restart recovers expired lease and retained checkpoint; expiry never consumes quota",
    async () => {
      const id = await fixture("PREMIUM");
      const job = await start(id);
      await runNutritionWorkerStep();
      await prisma.nutritionGenerationJob.update({
        where: { id: job.id },
        data: {
          status: "RUNNING",
          claimToken: "dead-process",
          leaseUntil: new Date(Date.now() - 1000),
        },
      });
      const before = provider.calls;
      await drain(id, job.id);
      assert.equal(provider.calls - before, 1);
      await jobs.pause(id, job.id);
      await prisma.nutritionGenerationJob.update({
        where: { id: job.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await expireNutritionJobs();
      assert.equal((await jobs.get(id, job.id)).status, "EXPIRED");
      assert.equal(await prisma.nutritionGenerationBatch.count({ where: { jobId: job.id } }), 0);
      assert.equal(await prisma.nutritionRightsEvent.count({ where: { userId: id } }), 0);
    },
  );
  await t.test("FREE one-meal change rights are independent across seven plan days", async () => {
    const id = await fixture();
    const initial = await start(id);
    await drain(id, initial.id);
    let plan = await jobs.deliver(id, initial.id);
    const origin = plan.id;
    for (const dayNumber of [7, 1, 2, 3, 4, 5, 6]) {
      const before = plan.dailyPlans as unknown as NutritionPlanContent;
      const job = await jobs.start(id, {
        duration: "SEVEN_DAY",
        requestKey: randomUUID(),
        sourcePlanId: plan.id,
        dayNumber,
        mealIndex: 1,
      });
      await drain(id, job.id);
      const updated = await jobs.deliver(id, job.id);
      const after = updated.dailyPlans as unknown as NutritionPlanContent;
      for (let day = 0; day < 7; day++)
        for (let meal = 0; meal < before.cycle[day].meals.length; meal++)
          if (day !== dayNumber - 1 || meal !== 1)
            assert.deepEqual(after.cycle[day].meals[meal], before.cycle[day].meals[meal]);
      assert.equal(
        (await nutritionRights(id, "MEAL_CHANGE", undefined, origin, dayNumber)).freeRemaining,
        0,
      );
      await assert.rejects(
        jobs.start(id, {
          duration: "SEVEN_DAY",
          requestKey: randomUUID(),
          sourcePlanId: updated.id,
          dayNumber,
          mealIndex: 0,
        }),
        rejectCode("NUTRITION_RIGHT_EXHAUSTED"),
      );
      plan = updated;
    }
    assert.equal(
      await prisma.aiUsageEvent.count({ where: { userId: id, feature: "NUTRITION_PLAN" } }),
      1,
    );
  });
  await t.test(
    "daily and subscription-month limits independently enforce plan and meal allowances",
    async () => {
      for (const tier of ["PREMIUM", "PREMIUM_PLUS"] as const)
        for (const kind of ["NEW_PLAN", "MEAL_CHANGE"] as const) {
          const id = await fixture(tier),
            dayLimit = tier === "PREMIUM" ? 2 : 3,
            monthLimit = tier === "PREMIUM" ? 5 : 10;
          const event = async (createdAt: Date) => {
            const job = await prisma.nutritionGenerationJob.create({
              data: {
                userId: id,
                kind,
                duration: "SEVEN_DAY",
                status: "CONSUMED",
                requestKey: randomUUID(),
                contextHash: "fixture-only",
                startDate: new Date(),
                expiresAt: new Date(Date.now() + 7 * 86_400_000),
              },
            });
            await prisma.nutritionRightsEvent.create({
              data: { userId: id, jobId: job.id, kind, createdAt },
            });
          };
          for (let i = 0; i < dayLimit; i++) await event(new Date());
          let status = await nutritionRights(id, kind);
          assert.equal(status.dayRemaining, 0);
          assert.equal(status.available, false);
          assert.equal(
            (await nutritionRights(id, kind === "NEW_PLAN" ? "MEAL_CHANGE" : "NEW_PLAN"))
              .dayRemaining,
            dayLimit,
          );
          const previous = new Date(Date.now() - 86_400_000);
          await prisma.nutritionRightsEvent.updateMany({
            where: { userId: id },
            data: { createdAt: previous },
          });
          for (let i = dayLimit; i < monthLimit; i++) await event(previous);
          status = await nutritionRights(id, kind);
          assert.equal(status.dayRemaining, dayLimit);
          assert.equal(status.monthRemaining, 0);
          assert.equal(status.available, false);
        }
    },
  );
  await t.test(
    "incomplete provider preserves only the accepted checkpoint and spends nothing",
    async () => {
      const id = await fixture();
      const job = await start(id);
      provider.mode = "incomplete";
      await runNutritionWorkerStep();
      await runNutritionWorkerStep();
      provider.mode = "valid";
      assert.equal((await jobs.get(id, job.id)).status, "FAILED");
      assert.equal((await jobs.get(id, job.id)).completedDays, 5);
      assert.equal(await prisma.nutritionPlan.count({ where: { userId: id } }), 0);
      assert.equal((await nutritionRights(id, "NEW_PLAN")).freeRemaining, 1);
    },
  );
  await t.test("owner scoping and final context check protect against stale delivery", async () => {
    const id = await fixture(),
      other = await fixture();
    const job = await start(id);
    await drain(id, job.id);
    await assert.rejects(jobs.get(other, job.id));
    await assert.rejects(jobs.pause(other, job.id));
    await assert.rejects(jobs.deliver(other, job.id));
    await prisma.userProfile.update({
      where: { userId: id },
      data: { healthConditions: ["new health restriction"] },
    });
    await assert.rejects(jobs.deliver(id, job.id), rejectCode("NUTRITION_CONTEXT_CHANGED"));
    assert.equal(await prisma.nutritionPlan.count({ where: { userId: id } }), 0);
    await jobs.pause(id, job.id);
  });
  await t.test(
    "existing extension and day refresh retain untouched days and use new-plan rights",
    async () => {
      const id = await fixture("PREMIUM_PLUS");
      const initial = await start(id);
      await drain(id, initial.id);
      const plan = await jobs.deliver(id, initial.id);
      const before = plan.dailyPlans as unknown as NutritionPlanContent;
      const extension = await jobs.start(id, {
        duration: "FOURTEEN_DAY",
        requestKey: randomUUID(),
        sourcePlanId: plan.id,
        revisionMode: "EXTEND",
      });
      await drain(id, extension.id);
      const longer = await jobs.deliver(id, extension.id);
      assert.equal((longer.dailyPlans as unknown as NutritionPlanContent).cycle.length, 14);
      assert.deepEqual(
        (longer.dailyPlans as unknown as NutritionPlanContent).cycle.slice(0, 7),
        before.cycle,
      );
      const revision = await jobs.start(id, {
        duration: "FOURTEEN_DAY",
        requestKey: randomUUID(),
        sourcePlanId: longer.id,
        revisionMode: "DAY",
        dayNumber: 4,
      });
      await drain(id, revision.id);
      const refreshed = await jobs.deliver(id, revision.id);
      const a = longer.dailyPlans as unknown as NutritionPlanContent,
        b = refreshed.dailyPlans as unknown as NutritionPlanContent;
      for (let day = 0; day < 14; day++)
        if (day !== 3) assert.deepEqual(a.cycle[day], b.cycle[day]);
      assert.equal((await nutritionRights(id, "NEW_PLAN")).dayRemaining, 0);
      assert.equal((await nutritionRights(id, "MEAL_CHANGE")).dayRemaining, 3);
    },
  );
  await t.test(
    "failed final persistence rolls back plan, activation and new-plan usage together",
    async () => {
      const id = await fixture("PREMIUM");
      const first = await start(id);
      await drain(id, first.id);
      const source = await jobs.deliver(id, first.id);
      const pending = await start(id);
      await drain(id, pending.id);
      // Deliberate unique-key collision after plan persistence, within the same transaction.
      const collision = await prisma.nutritionRightsEvent.create({
        data: { userId: id, jobId: pending.id, kind: "MEAL_CHANGE" },
      });
      await assert.rejects(jobs.deliver(id, pending.id));
      assert.equal(await prisma.nutritionPlan.count({ where: { userId: id } }), 1);
      assert.equal(
        (await prisma.nutritionPlan.findUniqueOrThrow({ where: { id: source.id } })).isActive,
        true,
      );
      assert.equal(
        await prisma.aiUsageEvent.count({ where: { userId: id, feature: "NUTRITION_PLAN" } }),
        1,
      );
      assert.equal((await jobs.get(id, pending.id)).status, "READY");
      await prisma.nutritionRightsEvent.delete({ where: { id: collision.id } });
      await jobs.deliver(id, pending.id);
    },
  );
  await t.test(
    "simultaneous worker claims and delivery cannot duplicate persistent days or usage",
    async () => {
      const id = await fixture();
      const pending = await start(id);
      provider.delay = 80;
      await Promise.all([runNutritionWorkerStep(), runNutritionWorkerStep()]);
      provider.delay = 0;
      assert.equal(
        await prisma.nutritionGenerationBatch.count({ where: { jobId: pending.id } }),
        1,
      );
      await drain(id, pending.id);
      const outcomes = await Promise.allSettled([
        jobs.deliver(id, pending.id),
        jobs.deliver(id, pending.id),
      ]);
      assert.ok(outcomes.some((result) => result.status === "fulfilled"));
      assert.equal(
        await prisma.nutritionRightsEvent.count({ where: { userId: id, kind: "NEW_PLAN" } }),
        1,
      );
      assert.equal(await prisma.nutritionPlan.count({ where: { userId: id } }), 1);
    },
  );
  await t.test(
    "manual changes during generation prevent silent activation and allow explicit new retry",
    async () => {
      const id = await fixture("PREMIUM");
      const initial = await start(id);
      await drain(id, initial.id);
      const source = await jobs.deliver(id, initial.id);
      const pending = await start(id);
      await drain(id, pending.id);
      await prisma.nutritionPlanDeviation.create({
        data: {
          userId: id,
          planId: source.id,
          dayNumber: 1,
          mealIndex: 0,
          scope: "MEAL",
          type: "REPLACED",
          actualItemName: "User chosen meal",
        },
      });
      await assert.rejects(jobs.deliver(id, pending.id), rejectCode("NUTRITION_CONTEXT_CHANGED"));
      assert.equal((await jobs.get(id, pending.id)).status, "INVALIDATED");
      assert.equal(
        (await prisma.nutritionPlan.findUniqueOrThrow({ where: { id: source.id } })).isActive,
        true,
      );
      const retry = await start(id);
      assert.notEqual(retry.id, pending.id);
      await jobs.pause(id, retry.id);
    },
  );
  await t.test(
    "water and safe clock-only changes reuse foods but adopt current deterministic metadata",
    async () => {
      const id = await fixture();
      const pending = await start(id);
      await runNutritionWorkerStep();
      await jobs.pause(id, pending.id);
      await prisma.userProfile.update({
        where: { userId: id },
        data: { dailyWaterGoalMl: 3000, usualWakeTime: "08:00" },
      });
      const resumed = await start(id);
      assert.equal(resumed.id, pending.id);
      const calls = provider.calls;
      await drain(id, pending.id);
      assert.equal(provider.calls - calls, 1);
      const plan = await jobs.deliver(id, pending.id),
        content = plan.dailyPlans as unknown as NutritionPlanContent;
      const slots = plan.mealTiming as unknown as { slots: Array<{ time: string }> };
      assert.ok(plan.waterMl >= 3000);
      for (const day of content.cycle)
        assert.deepEqual(
          day.meals.map((meal) => meal.time),
          slots.slots.map((slot) => slot.time),
        );
    },
  );
  await t.test("pause is idempotent and cannot revive an expired preparation", async () => {
    const id = await fixture(),
      job = await start(id);
    const first = await jobs.pause(id, job.id),
      second = await jobs.pause(id, job.id);
    assert.equal(second.expiresAt.getTime(), first.expiresAt.getTime());
    const expiry = new Date(Date.now() - 1);
    await prisma.nutritionGenerationJob.update({
      where: { id: job.id },
      data: { expiresAt: expiry },
    });
    assert.equal((await jobs.pause(id, job.id)).expiresAt.getTime(), expiry.getTime());
    await expireNutritionJobs();
    assert.equal((await jobs.get(id, job.id)).status, "EXPIRED");
    assert.equal((await nutritionRights(id, "NEW_PLAN")).freeRemaining, 1);
  });
  await t.test(
    "an expired active job is cleaned atomically before a fresh user request",
    async () => {
      const id = await fixture(),
        old = await start(id);
      await runNutritionWorkerStep();
      await prisma.nutritionGenerationJob.update({
        where: { id: old.id },
        data: { expiresAt: new Date(Date.now() - 1) },
      });
      const next = await start(id);
      assert.notEqual(next.id, old.id);
      const expired = await jobs.get(id, old.id);
      assert.equal(expired.status, "EXPIRED");
      assert.equal(expired.input, null);
      assert.equal(await prisma.nutritionGenerationBatch.count({ where: { jobId: old.id } }), 0);
      assert.equal((await nutritionRights(id, "NEW_PLAN")).freeRemaining, 1);
      await jobs.pause(id, next.id);
    },
  );
  await t.test(
    "a newly started server process continues the persisted five-day checkpoint",
    async () => {
      const id = await fixture(),
        job = await start(id);
      await runNutritionWorkerStep();
      assert.equal((await jobs.get(id, job.id)).completedDays, 5);
      const script = `
      const {setAIAdapter}=require('./src/modules/blood-test-analysis/ai-adapter/ai-adapter.factory.ts');
      const {FixtureAdapter}=require('./src/modules/nutrition-plan/test-fixtures/provider.ts');
      const {runNutritionWorkerStep}=require('./src/modules/nutrition-plan/nutrition-generation-jobs.ts');
      const {prisma}=require('./src/lib/prisma.ts');
      const adapter=new FixtureAdapter();setAIAdapter(adapter);
      runNutritionWorkerStep().then(async()=>{
        await prisma.$disconnect();
        console.log('RESTARTED_PROVIDER_CALLS:'+adapter.calls);
      }).catch(async()=>{await prisma.$disconnect();process.exitCode=1;});
    `;
      const result = await promisify(execFile)(
        process.execPath,
        ["--import", "tsx", "--eval", script],
        { cwd: process.cwd(), env: process.env, timeout: 15000, maxBuffer: 4 * 1024 * 1024 },
      );
      assert.match(result.stdout, /RESTARTED_PROVIDER_CALLS:1/);
      assert.equal((await jobs.get(id, job.id)).status, "READY");
      assert.equal((await jobs.get(id, job.id)).completedDays, 7);
      await jobs.deliver(id, job.id);
      assert.equal(
        await prisma.nutritionRightsEvent.count({ where: { userId: id, kind: "NEW_PLAN" } }),
        1,
      );
    },
  );
  await t.test(
    "changed targets resume in a new safe context; old accepted chunks stay paused",
    async () => {
      const id = await fixture(),
        job = await start(id);
      await runNutritionWorkerStep();
      await jobs.pause(id, job.id);
      await prisma.userProfile.update({ where: { userId: id }, data: { targetWeightKg: 72 } });
      const next = await start(id);
      assert.notEqual(next.id, job.id);
      assert.equal(next.completedDays, 0);
      assert.equal((await jobs.get(id, job.id)).completedDays, 5);
      assert.equal((await jobs.get(id, job.id)).status, "PAUSED");
      await jobs.pause(id, next.id);
    },
  );
  await t.test(
    "unverified legacy plan context is never assumed safe; internal fields remain private",
    async () => {
      const id = await fixture(),
        job = await start(id);
      await drain(id, job.id);
      const plan = await jobs.deliver(id, job.id);
      const publicPlan = publicNutritionPlan(plan);
      assert.equal("nutritionContextHash" in publicPlan, false);
      assert.equal("originPlanId" in publicPlan, false);
      await prisma.nutritionPlan.update({
        where: { id: plan.id },
        data: { nutritionContextHash: null },
      });
      await assert.rejects(
        jobs.start(id, {
          duration: "SEVEN_DAY",
          requestKey: randomUUID(),
          sourcePlanId: plan.id,
          dayNumber: 1,
          mealIndex: 0,
        }),
        rejectCode("NUTRITION_PLAN_RECREATE_REQUIRED"),
      );
      assert.equal((await nutritionRights(id, "MEAL_CHANGE", prisma, plan.id, 1)).freeRemaining, 1);
    },
  );
  await t.test(
    "actual provider admission and returned tokens include failed-output retries",
    async () => {
      class ObservedFixture extends FixtureAdapter {
        protected async chat(messages: ChatMessage[]): Promise<string> {
          await reserveNutritionProviderCall();
          const result = await super.chat(messages);
          await recordNutritionProviderUsage({ prompt: 10, output: 20 });
          return result;
        }
      }
      const observed = new ObservedFixture();
      observed.mode = "malformed-once";
      setAIAdapter(observed);
      const id = await fixture(),
        job = await start(id);
      try {
        await runNutritionWorkerStep();
        const attempt = await prisma.nutritionWorkerAttempt.findFirstOrThrow({
          where: { jobId: job.id },
        });
        assert.equal(attempt.providerCalls, 2);
        assert.equal(attempt.promptTokens, 20);
        assert.equal(attempt.outputTokens, 40);
        await jobs.pause(id, job.id);
        assert.equal(await runNutritionWorkerStep(), false);
        assert.equal(observed.calls, 2);
      } finally {
        setAIAdapter(provider);
      }
    },
  );
  await t.test("annual monthly rights renew at the original subscription anniversary", async () => {
    const id = await fixture("PREMIUM");
    await prisma.subscription.updateMany({
      where: { userId: id },
      data: { currentPeriodStart: new Date("2026-01-31T12:00:00Z") },
    });
    const old = await prisma.nutritionGenerationJob.create({
      data: {
        userId: id,
        kind: "NEW_PLAN",
        duration: "SEVEN_DAY",
        status: "CONSUMED",
        requestKey: randomUUID(),
        contextHash: "synthetic",
        startDate: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    await prisma.nutritionRightsEvent.create({
      data: {
        userId: id,
        jobId: old.id,
        kind: "NEW_PLAN",
        createdAt: new Date("2026-02-01T12:00:00Z"),
      },
    });
    const before = await nutritionRights(
      id,
      "NEW_PLAN",
      prisma,
      undefined,
      undefined,
      new Date("2026-02-28T11:59:59Z"),
    );
    assert.equal(before.monthRemaining, 4);
    assert.equal(before.resetsAt, "2026-02-28T12:00:00.000Z");
    const after = await nutritionRights(
      id,
      "NEW_PLAN",
      prisma,
      undefined,
      undefined,
      new Date("2026-02-28T12:00:00Z"),
    );
    assert.equal(after.monthRemaining, 5);
    assert.equal(after.resetsAt, "2026-03-31T12:00:00.000Z");
  });
  await t.test(
    "existing sold plan rights keep original windows; new meal rights require a verified period",
    async () => {
      const id = await fixture("PREMIUM");
      await prisma.subscription.updateMany({
        where: { userId: id },
        data: { createdAt: new Date("1999-01-01"), currentPeriodStart: null },
      });
      const legacy = await prisma.nutritionGenerationJob.create({
        data: {
          userId: id,
          kind: "NEW_PLAN",
          duration: "SEVEN_DAY",
          status: "CONSUMED",
          requestKey: randomUUID(),
          contextHash: "synthetic",
          startDate: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      await prisma.nutritionRightsEvent.create({
        data: {
          userId: id,
          jobId: legacy.id,
          kind: "NEW_PLAN",
          createdAt: new Date("2026-10-14T00:01:00Z"),
        },
      });
      const old = await nutritionRights(
        id,
        "NEW_PLAN",
        prisma,
        undefined,
        undefined,
        new Date("2026-10-14T22:00:00Z"),
      );
      assert.equal(old.grandfathered, true);
      assert.equal(old.dayRemaining, 14);
      assert.equal(old.monthRemaining, 99);
      await assert.rejects(
        nutritionRights(id, "MEAL_CHANGE"),
        rejectCode("NUTRITION_PERIOD_UNVERIFIED"),
      );
    },
  );
});
