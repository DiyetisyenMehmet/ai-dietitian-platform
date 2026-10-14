import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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

test("durable nutrition: health gates, checkpoint, pause/resume, rights and one-meal changes", async (t) => {
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
});
