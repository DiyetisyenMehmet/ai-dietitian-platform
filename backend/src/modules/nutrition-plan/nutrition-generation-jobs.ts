import { randomUUID } from "node:crypto";
import { Prisma, type NutritionGenerationJob } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { logger } from "../../lib/logger";
import { getAIAdapter } from "../blood-test-analysis/ai-adapter/ai-adapter.factory";
import { mealGeneratorService } from "./meal-generator/meal-generator.service";
import { nutritionPlanRepository } from "./nutrition-plan.repository";
import {
  prepareNutritionContext,
  assertCompleteNutrition,
  contextDigest,
} from "./nutrition-generation-context";
import {
  assertNutritionRight,
  nutritionRights,
  requireNutritionJobs,
} from "./nutrition-rights.service";
import { withNutritionProviderBudget } from "./nutrition-plan-provider-budget";
import { withNutritionCallObserver } from "./nutrition-provider-observer";
import { DURATION_DAYS, isSupportedPlanDuration } from "./constants";
import type {
  DailyPlan,
  NutritionPlanAIOutput,
  NutritionPlanContent,
  NutritionPlanGenerationInput,
  PlanDuration,
} from "./types";

const RETENTION_MS = 7 * 86_400_000;
const LEASE_MS = 120_000;
const STEP_MS = 100_000;
const json = (value: unknown) => value as Prisma.InputJsonValue;
const activeStates = ["QUEUED", "RUNNING", "RETRY_WAIT", "READY"];

/** Same user advisory key as synchronous W1 generation; never held across AI. */
async function userTransaction<T>(
  userId: string,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      const key = `nutrition-plan-generation:${userId}`;
      const rows = await tx.$queryRaw<
        Array<{ locked: boolean }>
      >`SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS locked`;
      if (!rows[0]?.locked)
        throw new ApiError(409, "Nutrition operation in progress.", {
          code: "NUTRITION_PLAN_GENERATION_IN_PROGRESS",
        });
      // Pin current health/consent/access rows for consistent final validation.
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id"=${userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "user_profiles" WHERE "userId"=${userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "consent_records" WHERE "userId"=${userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "subscriptions" WHERE "userId"=${userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "google_play_entitlements" WHERE "userId"=${userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "admin_support_entitlements" WHERE "userId"=${userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "blood_test_analyses" WHERE "userId"=${userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "blood_test_uploads" WHERE "userId"=${userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "weight_logs" WHERE "userId"=${userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "nutrition_plans" WHERE "userId"=${userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "nutrition_plan_deviations" WHERE "userId"=${userId} FOR UPDATE`;
      return run(tx);
    },
    { timeout: 15_000, maxWait: 5_000 },
  );
}

export function publicNutritionJob(job: NutritionGenerationJob) {
  return {
    id: job.id,
    kind: job.kind,
    duration: job.duration,
    status: job.status !== "CONSUMED" && job.expiresAt <= new Date() ? "EXPIRED" : job.status,
    completedDays: job.completedDays,
    totalDays: job.kind === "MEAL_CHANGE" ? 1 : DURATION_DAYS[job.duration as PlanDuration],
    errorCode: job.errorCode,
    deliveredPlanId: job.deliveredPlanId,
    expiresAt: job.expiresAt.toISOString(),
  };
}

async function ownJob(userId: string, id: string, tx: Prisma.TransactionClient = prisma) {
  const job = await tx.nutritionGenerationJob.findFirst({ where: { id, userId } });
  if (!job) throw ApiError.notFound("Nutrition job not found.");
  return job;
}

export interface StartNutritionJob {
  requestKey: string;
  duration: PlanDuration;
  startDate?: string;
  pantryText?: string;
  sourcePlanId?: string;
  revisionMode?: "DAY" | "FROM_DAY" | "EXTEND";
  dayNumber?: number;
  mealIndex?: number;
}

function assembleCycle(
  job: NutritionGenerationJob,
  outputs: NutritionPlanAIOutput[],
  source?: NutritionPlanContent,
): DailyPlan[] {
  const generated = outputs.flatMap((output) => output.cycle);
  if (!source) return generated;
  const cycle = structuredClone(source.cycle);
  if (job.kind === "MEAL_CHANGE") {
    if (generated.length !== 1 || generated[0].meals.length !== 1)
      throw new ApiError(502, "Incomplete replacement.", { code: "NUTRITION_PLAN_INCOMPLETE" });
    const day = cycle[job.dayNumber! - 1];
    day.meals[job.mealIndex!] = generated[0].meals[0];
    // Actual retained + generated meal sums; never scale provider nutrients.
    day.totalCalories = day.meals.reduce((sum, meal) => sum + meal.calories, 0);
    day.totalProteinGrams = day.meals.reduce((sum, meal) => sum + meal.proteinGrams, 0);
    day.totalCarbsGrams = day.meals.reduce((sum, meal) => sum + meal.carbsGrams, 0);
    day.totalFatGrams = day.meals.reduce((sum, meal) => sum + meal.fatGrams, 0);
  } else {
    const start = job.revisionMode === "EXTEND" ? cycle.length : job.dayNumber! - 1;
    generated.forEach((day, index) => {
      cycle[start + index] = day;
    });
  }
  return cycle;
}

async function mealSource(
  userId: string,
  sourcePlanId: string,
  dayNumber: number,
  mealIndex: number,
  tx: Prisma.TransactionClient = prisma,
) {
  const source = await tx.nutritionPlan.findFirst({
    where: { id: sourcePlanId, userId, isActive: true, deletedAt: null, status: "COMPLETED" },
  });
  if (!source || !isSupportedPlanDuration(source.duration))
    throw ApiError.notFound("Current plan not found.");
  const content = source.dailyPlans as unknown as NutritionPlanContent;
  if (!content.cycle?.[dayNumber - 1]?.meals?.[mealIndex])
    throw ApiError.badRequest("Meal is outside the current plan.");
  return { source, content };
}

export const nutritionGenerationJobs = {
  async start(userId: string, request: StartNutritionJob) {
    requireNutritionJobs();
    return userTransaction(userId, async (tx) => {
      const receipt = await tx.nutritionJobRequest.findUnique({
        where: { userId_requestKey: { userId, requestKey: request.requestKey } },
      });
      if (receipt) {
        const existing = await ownJob(userId, receipt.jobId, tx);
        if (
          existing.duration !== request.duration ||
          existing.sourcePlanId !== (request.sourcePlanId ?? null) ||
          existing.dayNumber !== (request.dayNumber ?? null) ||
          existing.mealIndex !== (request.mealIndex ?? null) ||
          existing.revisionMode !== (request.revisionMode ?? null)
        )
          throw new ApiError(409, "Request key belongs to another operation.", {
            code: "NUTRITION_REQUEST_MISMATCH",
          });
        return existing;
      }
      const kind = request.sourcePlanId && !request.revisionMode ? "MEAL_CHANGE" : "NEW_PLAN";
      const settling = await tx.nutritionGenerationJob.findFirst({
        where: {
          userId,
          status: "PAUSED",
          claimToken: { not: null },
          leaseUntil: { gt: new Date() },
        },
      });
      if (settling)
        throw new ApiError(409, "Finishing the paused call.", { code: "NUTRITION_PAUSE_SETTLING" });
      const selected = request.sourcePlanId
        ? await mealSource(
            userId,
            request.sourcePlanId,
            request.dayNumber ?? 1,
            request.mealIndex ?? 0,
            tx,
          )
        : null;
      const duration =
        request.revisionMode === "EXTEND"
          ? request.duration
          : ((selected?.source.duration as PlanDuration | undefined) ?? request.duration);
      const pantry = selected?.content.planningContext?.pantryText ?? request.pantryText;
      const context = await prepareNutritionContext(userId, duration, pantry);
      const rights = await nutritionRights(
        userId,
        kind,
        tx,
        selected?.source.originPlanId ?? selected?.source.id,
        request.dayNumber,
      );
      if (rights.tier === "FREE" && duration !== "SEVEN_DAY")
        throw new ApiError(403, "FREE supports 7 days.", {
          code: "SUBSCRIPTION_REQUIRED",
          details: { reason: "FREE_DURATION_RESTRICTED" },
        });
      assertNutritionRight(rights);
      if (request.revisionMode && rights.tier === "FREE")
        throw new ApiError(403, "Paid scoped revision required.", {
          code: "SUBSCRIPTION_REQUIRED",
        });
      if (
        request.revisionMode === "EXTEND" &&
        selected &&
        context.input.durationDays <= selected.content.durationDays
      )
        throw ApiError.badRequest("Only a longer horizon may extend a plan.");
      if (selected && selected.source.nutritionContextHash !== context.safetyHash)
        throw new ApiError(409, "Source plan health context is unverified or changed.", {
          code: "NUTRITION_PLAN_RECREATE_REQUIRED",
        });
      if (selected)
        assertCompleteNutrition(
          selected.content.cycle,
          context.input,
          selected.content.durationDays,
        );
      const hash = contextDigest({
        context: selected ? context.hash : context.reuseHash,
        source: selected
          ? {
              id: selected.source.id,
              content: selected.content,
              day: request.dayNumber ?? null,
              meal: request.mealIndex ?? null,
              mode: request.revisionMode ?? null,
            }
          : null,
      });
      const live = await tx.nutritionGenerationJob.findFirst({
        where: { userId, status: { in: activeStates }, expiresAt: { gt: new Date() } },
        orderBy: { updatedAt: "desc" },
      });
      const compatible =
        live && live.kind === kind && live.duration === duration && live.contextHash === hash;
      if (live && !compatible)
        throw new ApiError(409, "Pause the current preparation before starting another.", {
          code: "NUTRITION_PLAN_GENERATION_IN_PROGRESS",
        });
      let job = compatible
        ? live
        : await tx.nutritionGenerationJob.findFirst({
            where: {
              userId,
              kind,
              duration,
              contextHash: hash,
              status: { in: ["PAUSED", "FAILED"] },
              expiresAt: { gt: new Date() },
            },
            orderBy: { updatedAt: "desc" },
          });
      if (
        job?.claimToken &&
        job.leaseUntil &&
        job.leaseUntil > new Date() &&
        job.status === "PAUSED"
      )
        throw new ApiError(409, "Finishing the paused call.", { code: "NUTRITION_PAUSE_SETTLING" });
      if (job?.status === "RUNNING" && job.baseStateHash !== context.activeHash)
        throw new ApiError(409, "Pause the running preparation before accepting plan changes.", {
          code: "NUTRITION_PLAN_GENERATION_IN_PROGRESS",
        });
      if (job && (!activeStates.includes(job.status) || job.baseStateHash !== context.activeHash))
        job = await tx.nutritionGenerationJob.update({
          where: { id: job.id },
          data: {
            status: "QUEUED",
            input: json(context.input),
            attempts: 0,
            claimToken: null,
            leaseUntil: null,
            errorCode: null,
            nextAttemptAt: new Date(),
            startDate:
              selected?.source.startDate ??
              new Date(request.startDate ?? new Date().toISOString().slice(0, 10)),
            basePlanId: context.active?.id ?? null,
            baseStateHash: context.activeHash,
          },
        });
      if (!job) {
        // Retain incompatible paused checkpoints, but never use them under changed health context.
        job = await tx.nutritionGenerationJob.create({
          data: {
            userId,
            kind,
            duration,
            requestKey: request.requestKey,
            contextHash: hash,
            input: json(context.input),
            startDate:
              selected?.source.startDate ??
              new Date(request.startDate ?? new Date().toISOString().slice(0, 10)),
            basePlanId: context.active?.id ?? null,
            baseStateHash: context.activeHash,
            sourcePlanId: selected?.source.id,
            revisionMode: request.revisionMode,
            dayNumber: selected ? request.dayNumber : null,
            mealIndex: selected ? request.mealIndex : null,
            expiresAt: new Date(Date.now() + RETENTION_MS),
          },
        });
      }
      await tx.nutritionJobRequest.create({
        data: { userId, requestKey: request.requestKey, jobId: job.id },
      });
      return job;
    });
  },

  async get(userId: string, id: string) {
    requireNutritionJobs();
    return ownJob(userId, id);
  },
  async current(userId: string) {
    requireNutritionJobs();
    return prisma.nutritionGenerationJob.findFirst({
      where: {
        userId,
        expiresAt: { gt: new Date() },
        status: { notIn: ["CONSUMED", "EXPIRED", "INVALIDATED"] },
      },
      orderBy: { updatedAt: "desc" },
    });
  },
  async pause(userId: string, id: string) {
    requireNutritionJobs();
    return userTransaction(userId, async (tx) => {
      const job = await ownJob(userId, id, tx);
      if (job.status === "CONSUMED")
        throw new ApiError(409, "Plan was already delivered.", {
          code: "NUTRITION_ALREADY_DELIVERED",
        });
      if (job.status === "EXPIRED") return job;
      // Preserve the in-flight claim: its validated result may checkpoint, never deliver.
      return tx.nutritionGenerationJob.update({
        where: { id },
        data: { status: "PAUSED", expiresAt: new Date(Date.now() + RETENTION_MS) },
      });
    });
  },

  async deliver(userId: string, id: string) {
    requireNutritionJobs();
    const outcome = await userTransaction(userId, async (tx) => {
      const job = await ownJob(userId, id, tx);
      if (job.deliveredPlanId)
        return tx.nutritionPlan.findFirstOrThrow({ where: { id: job.deliveredPlanId, userId } });
      if (job.status !== "READY" || job.expiresAt <= new Date())
        throw new ApiError(409, "Plan is not ready.", { code: "NUTRITION_JOB_NOT_READY" });
      const input = job.input as unknown as NutritionPlanGenerationInput;
      const context = await prepareNutritionContext(
        userId,
        job.duration as PlanDuration,
        input.realLifePlanning?.pantryText,
      );
      const selected = job.sourcePlanId
        ? await mealSource(userId, job.sourcePlanId, job.dayNumber ?? 1, job.mealIndex ?? 0, tx)
        : null;
      const hash = contextDigest({
        context: selected ? context.hash : context.reuseHash,
        source: selected
          ? {
              id: selected.source.id,
              content: selected.content,
              day: job.dayNumber,
              meal: job.mealIndex,
              mode: job.revisionMode,
            }
          : null,
      });
      if (hash !== job.contextHash || context.activeHash !== job.baseStateHash) {
        await tx.nutritionGenerationJob.update({
          where: { id },
          data: {
            status: "INVALIDATED",
            errorCode: "NUTRITION_CONTEXT_CHANGED",
            claimToken: null,
            leaseUntil: null,
          },
        });
        return new ApiError(409, "Profile or current plan changed.", {
          code: "NUTRITION_CONTEXT_CHANGED",
        });
      }
      const rights = await nutritionRights(
        userId,
        job.kind as "NEW_PLAN" | "MEAL_CHANGE",
        tx,
        selected?.source.originPlanId ?? selected?.source.id,
        job.dayNumber ?? undefined,
      );
      if (rights.tier === "FREE" && job.duration !== "SEVEN_DAY")
        throw new ApiError(403, "FREE supports 7 days.", {
          code: "SUBSCRIPTION_REQUIRED",
          details: { reason: "FREE_DURATION_RESTRICTED" },
        });
      assertNutritionRight(rights);
      const batches = await tx.nutritionGenerationBatch.findMany({
        where: { jobId: id },
        orderBy: { startDayNumber: "asc" },
      });
      const outputs = batches.map((batch) => batch.output as unknown as NutritionPlanAIOutput);
      let cycle = assembleCycle(job, outputs, selected?.content);
      if (!selected)
        cycle = cycle.map((day) => ({
          ...day,
          meals: day.meals.map((meal, index) => ({
            ...meal,
            time: context.mealTiming.slots[index]?.time ?? meal.time,
          })),
        }));
      if (selected && selected.source.nutritionContextHash !== context.safetyHash)
        throw new ApiError(409, "Source plan context changed.", {
          code: "NUTRITION_PLAN_RECREATE_REQUIRED",
        });
      assertCompleteNutrition(cycle, context.input);
      const adapter = getAIAdapter();
      const content: NutritionPlanContent = selected
        ? {
            ...selected.content,
            durationDays: context.input.durationDays,
            cycleLengthDays: cycle.length,
            cycle,
            calendar: cycle.map(
              (_, index) =>
                selected.content.calendar[index] ?? {
                  dayNumber: index + 1,
                  cycleIndex: index,
                  dateOffsetDays: selected.content.calendar.at(-1)?.dateOffsetDays ?? 0,
                },
            ),
          }
        : {
            durationDays: context.input.durationDays,
            cycleLengthDays: cycle.length,
            cycle,
            calendar: cycle.map((_, index) => ({ dayNumber: index + 1, cycleIndex: index })),
            planningContext: context.input.realLifePlanning,
          };
      const plan = selected
        ? await nutritionPlanRepository.createRevisionVersion(
            {
              userId,
              source: selected.source,
              waterMl: context.water.waterMl,
              duration: job.duration,
              content,
              aiProvider: adapter.info.provider,
              aiModel: adapter.info.model,
              processingTimeMs: 0,
              deviationCopyPolicy:
                job.kind === "MEAL_CHANGE"
                  ? { mode: "EXCEPT_MEAL", dayNumber: job.dayNumber!, mealIndex: job.mealIndex! }
                  : job.revisionMode === "DAY"
                    ? { mode: "EXCEPT_DAY", dayNumber: job.dayNumber! }
                    : job.revisionMode === "FROM_DAY"
                      ? { mode: "BEFORE_DAY", dayNumber: job.dayNumber! }
                      : { mode: "ALL" },
            },
            tx,
          )
        : await nutritionPlanRepository.createVersioned(
            {
              userId,
              duration: job.duration,
              startDate: job.startDate,
              bloodTestAnalysisId: context.analysisId,
              calories: context.calories,
              macros: context.macros,
              water: context.water,
              nutritionContextHash: context.safetyHash,
              mealTiming: context.mealTiming,
              content,
              explanations: outputs[0].explanations,
              recommendations: [
                ...new Set(outputs.flatMap((output) => output.recommendations)),
              ].slice(0, 6),
              summary: outputs[0].summary,
              aiProvider: adapter.info.provider,
              aiModel: adapter.info.model,
              processingTimeMs: 0,
            },
            tx,
          );
      if (selected && job.kind === "NEW_PLAN")
        await tx.aiUsageEvent.create({
          data: {
            userId,
            feature: "NUTRITION_PLAN",
            provider: adapter.info.provider,
            model: adapter.info.model,
          },
        });
      await tx.nutritionRightsEvent.create({
        data: {
          userId,
          jobId: id,
          kind: job.kind,
          originPlanId: selected?.source.originPlanId ?? selected?.source.id,
          dayNumber: job.dayNumber,
        },
      });
      await tx.nutritionGenerationJob.update({
        where: { id },
        data: {
          status: "CONSUMED",
          deliveredPlanId: plan.id,
          input: Prisma.DbNull,
          contextHash: "consumed",
          baseStateHash: null,
          claimToken: null,
          leaseUntil: null,
        },
      });
      await tx.nutritionGenerationBatch.deleteMany({ where: { jobId: id } });
      return plan;
    });
    if (outcome instanceof ApiError) throw outcome;
    return outcome;
  },
};

/** Durable worker step, invoked by an authenticated bounded request or development runner. */
export async function runNutritionWorkerStep(): Promise<boolean> {
  requireNutritionJobs();
  const claim = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('nutrition-worker-admission-v1',0))::text`;
    const now = new Date();
    await tx.nutritionGenerationJob.updateMany({
      where: {
        status: { in: ["RUNNING", "RETRY_WAIT", "QUEUED"] },
        attempts: { gte: 12 },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
      },
      data: {
        status: "FAILED",
        errorCode: "NUTRITION_ATTEMPTS_EXHAUSTED",
        claimToken: null,
        leaseUntil: null,
      },
    });
    const inFlight = await tx.nutritionGenerationJob.count({
      where: { claimToken: { not: null }, leaseUntil: { gt: now } },
    });
    const callsToday = await tx.nutritionWorkerAttempt.count({
      where: { createdAt: { gte: new Date(now.toISOString().slice(0, 10)) } },
    });
    if (
      inFlight >= env.NUTRITION_WORKER_CONCURRENCY ||
      callsToday >= env.NUTRITION_WORKER_DAILY_BATCH_LIMIT
    )
      return null;
    const job = await tx.nutritionGenerationJob.findFirst({
      where: {
        status: { in: ["QUEUED", "RETRY_WAIT", "RUNNING"] },
        expiresAt: { gt: now },
        nextAttemptAt: { lte: now },
        attempts: { lt: 12 },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
      },
      orderBy: { createdAt: "asc" },
    });
    if (!job) return null;
    const token = randomUUID();
    const acquired = await tx.nutritionGenerationJob.updateMany({
      where: {
        id: job.id,
        status: job.status,
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
      },
      data: {
        status: "RUNNING",
        claimToken: token,
        leaseUntil: new Date(now.getTime() + LEASE_MS),
        attempts: { increment: 1 },
      },
    });
    if (!acquired.count) return null;
    const attempt = await tx.nutritionWorkerAttempt.create({
      data: { jobId: job.id, claimToken: token },
    });
    return { job, token, attempt };
  });
  if (!claim) return false;
  const started = Date.now(),
    { job, token, attempt } = claim;
  try {
    const original = job.input as unknown as NutritionPlanGenerationInput;
    const context = await prepareNutritionContext(
      job.userId,
      job.duration as PlanDuration,
      original.realLifePlanning?.pantryText,
    );
    const selected = job.sourcePlanId
      ? await mealSource(job.userId, job.sourcePlanId, job.dayNumber ?? 1, job.mealIndex ?? 0)
      : null;
    const hash = contextDigest({
      context: selected ? context.hash : context.reuseHash,
      source: selected
        ? {
            id: selected.source.id,
            content: selected.content,
            day: job.dayNumber,
            meal: job.mealIndex,
            mode: job.revisionMode,
          }
        : null,
    });
    if (hash !== job.contextHash)
      throw new ApiError(409, "Context changed.", { code: "NUTRITION_CONTEXT_CHANGED" });
    if (selected && selected.source.nutritionContextHash !== context.safetyHash)
      throw new ApiError(409, "Source plan context changed.", {
        code: "NUTRITION_PLAN_RECREATE_REQUIRED",
      });
    const rights = await nutritionRights(
      job.userId,
      job.kind as "NEW_PLAN" | "MEAL_CHANGE",
      prisma,
      selected?.source.originPlanId ?? selected?.source.id,
      job.dayNumber ?? undefined,
    );
    if (rights.tier === "FREE" && job.duration !== "SEVEN_DAY")
      throw new ApiError(403, "FREE supports 7 days.", {
        code: "SUBSCRIPTION_REQUIRED",
        details: { reason: "FREE_DURATION_RESTRICTED" },
      });
    assertNutritionRight(rights);
    const batches = await prisma.nutritionGenerationBatch.findMany({
      where: { jobId: job.id },
      orderBy: { startDayNumber: "asc" },
    });
    const prefix =
      selected && job.revisionMode
        ? job.revisionMode === "EXTEND"
          ? selected.content.cycle
          : selected.content.cycle.slice(0, job.dayNumber! - 1)
        : [];
    const prior = [
      ...prefix,
      ...batches.flatMap((batch) => (batch.output as unknown as NutritionPlanAIOutput).cycle),
    ];
    const total =
      job.kind === "MEAL_CHANGE"
        ? 1
        : job.revisionMode === "DAY"
          ? job.dayNumber!
          : context.input.durationDays;
    let generated: NutritionPlanAIOutput | null = null;
    if (prior.length < total) {
      // Atomic pause-vs-call admission: after a confirmed pause no new call is admitted.
      const admitted = await prisma.nutritionGenerationJob.updateMany({
        where: { id: job.id, claimToken: token, status: "RUNNING" },
        data: { status: "RUNNING" },
      });
      if (!admitted.count) return true;
      let input = context.input,
        start = prior.length + 1,
        count = Math.min(5, total - prior.length),
        preceding: DailyPlan[] = prior;
      if (selected && job.kind === "MEAL_CHANGE") {
        const day = selected.content.cycle[job.dayNumber! - 1],
          meal = day.meals[job.mealIndex!];
        const others = day.meals.filter((_, index) => index !== job.mealIndex);
        const calories = input.dailyCalories - others.reduce((sum, item) => sum + item.calories, 0);
        const protein =
          input.proteinGrams - others.reduce((sum, item) => sum + item.proteinGrams, 0);
        const carbs = input.carbsGrams - others.reduce((sum, item) => sum + item.carbsGrams, 0);
        const fat = input.fatGrams - others.reduce((sum, item) => sum + item.fatGrams, 0);
        if (calories < 50 || Math.min(protein, carbs, fat) < 0)
          throw new ApiError(422, "Retained meals need a full safe revision.", {
            code: "NUTRITION_PLAN_RECREATE_REQUIRED",
          });
        input = {
          ...input,
          dailyCalories: calories,
          proteinGrams: protein,
          carbsGrams: carbs,
          fatGrams: fat,
          mealTiming: {
            mealsPerDay: 1,
            slots: [{ name: meal.name, time: meal.time, calorieShare: 1 }],
          },
        };
        start = job.dayNumber!;
        count = 1;
        preceding = selected.content.cycle.slice(0, start - 1);
      }
      const check = async () => {
        const state = await prisma.nutritionGenerationJob.findUnique({
          where: { id: job.id },
          select: { status: true, claimToken: true, leaseUntil: true, expiresAt: true },
        });
        if (state?.status !== "RUNNING")
          throw new ApiError(409, "Preparation paused.", { code: "NUTRITION_JOB_PAUSED" });
        if (
          state.claimToken !== token ||
          !state.leaseUntil ||
          state.leaseUntil <= new Date() ||
          state.expiresAt <= new Date()
        )
          throw new ApiError(409, "Worker lease expired.", { code: "NUTRITION_WORKER_STALE" });
      };
      const reserve = async () =>
        prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('nutrition-worker-admission-v1',0))::text`;
          const used = await tx.nutritionWorkerAttempt.aggregate({
            where: { createdAt: { gte: new Date(new Date().toISOString().slice(0, 10)) } },
            _sum: { providerCalls: true },
          });
          const personal = await tx.nutritionWorkerAttempt.aggregate({
            where: {
              job: { userId: job.userId },
              createdAt: { gte: new Date(new Date().toISOString().slice(0, 10)) },
            },
            _sum: { providerCalls: true },
          });
          if ((personal._sum.providerCalls ?? 0) >= 40)
            throw new ApiError(429, "Preparation call limit reached.", {
              code: "NUTRITION_COST_LIMIT",
            });
          if ((used._sum.providerCalls ?? 0) >= env.NUTRITION_WORKER_DAILY_CALL_LIMIT)
            throw new ApiError(429, "Provider call budget exhausted.", {
              code: "NUTRITION_COST_LIMIT",
            });
          const admitted = await tx.nutritionGenerationJob.updateMany({
            where: {
              id: job.id,
              claimToken: token,
              status: "RUNNING",
              leaseUntil: { gt: new Date() },
            },
            data: { status: "RUNNING" },
          });
          if (!admitted.count)
            throw new ApiError(409, "Preparation paused.", { code: "NUTRITION_JOB_PAUSED" });
          await tx.nutritionWorkerAttempt.update({
            where: { id: attempt.id },
            data: {
              providerCalls: { increment: 1 },
              provider: getAIAdapter().info.provider,
              model: getAIAdapter().info.model,
            },
          });
        });
      const usage = async (values: { prompt?: number; output?: number; thinking?: number }) => {
        try {
          const data: Prisma.NutritionWorkerAttemptUpdateInput = {};
          for (const [field, value] of [
            ["promptTokens", values.prompt],
            ["outputTokens", values.output],
            ["thinkingTokens", values.thinking],
          ] as const)
            if (value !== undefined && Number.isFinite(value) && value >= 0) {
              const previous = await prisma.nutritionWorkerAttempt.findUniqueOrThrow({
                where: { id: attempt.id },
              });
              data[field] =
                previous[field] === null ? Math.trunc(value) : { increment: Math.trunc(value) };
            }
          await prisma.nutritionWorkerAttempt.update({ where: { id: attempt.id }, data });
        } catch {
          logger.warn("Nutrition usage measurement unavailable; reserved calls remain charged");
        }
      };
      generated = (
        await withNutritionCallObserver({ check, reserve, usage }, () =>
          withNutritionProviderBudget(STEP_MS, () =>
            mealGeneratorService.generateRange(input, start, count, preceding),
          ),
        )
      ).output;
    }
    await userTransaction(job.userId, async (tx) => {
      const current = await ownJob(job.userId, job.id, tx);
      if (
        current.claimToken !== token ||
        !current.leaseUntil ||
        current.leaseUntil <= new Date() ||
        !["RUNNING", "PAUSED"].includes(current.status)
      )
        return;
      const latest = await prepareNutritionContext(
        job.userId,
        job.duration as PlanDuration,
        original.realLifePlanning?.pantryText,
      );
      if (
        (selected ? latest.hash : latest.reuseHash) !==
        (selected ? context.hash : context.reuseHash)
      )
        throw new ApiError(409, "Context changed.", { code: "NUTRITION_CONTEXT_CHANGED" });
      if (generated)
        await tx.nutritionGenerationBatch.create({
          data: {
            jobId: job.id,
            startDayNumber: job.kind === "MEAL_CHANGE" ? job.dayNumber! : prior.length + 1,
            dayCount: generated.cycle.length,
            output: json(generated),
          },
        });
      const complete = [...prior, ...(generated?.cycle ?? [])];
      if (complete.length === total) {
        const outputs = [
          ...batches.map((batch) => batch.output as unknown as NutritionPlanAIOutput),
          ...(generated ? [generated] : []),
        ];
        assertCompleteNutrition(assembleCycle(job, outputs, selected?.content), latest.input);
      }
      await tx.nutritionGenerationJob.update({
        where: { id: job.id },
        data: {
          completedDays:
            job.revisionMode === "DAY" && complete.length === total
              ? context.input.durationDays
              : complete.length,
          status:
            current.status === "PAUSED" ? "PAUSED" : complete.length === total ? "READY" : "QUEUED",
          claimToken: null,
          leaseUntil: null,
        },
      });
    });
    await prisma.nutritionWorkerAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "COMPLETED",
        elapsedMs: Date.now() - started,
        provider: getAIAdapter().info.provider,
        model: getAIAdapter().info.model,
      },
    });
  } catch (error) {
    const code = error instanceof ApiError ? error.code : "NUTRITION_WORKER_FAILED";
    const retryable = [
      "NUTRITION_PLAN_GENERATION_TIMEOUT",
      "AI_PROVIDER_UNREACHABLE",
      "AI_PROVIDER_ERROR",
    ].includes(code);
    await userTransaction(job.userId, async (tx) => {
      const current = await tx.nutritionGenerationJob.findFirst({
        where: { id: job.id, userId: job.userId },
      });
      if (!current || current.claimToken !== token) return;
      await tx.nutritionGenerationJob.updateMany({
        where: { id: job.id, claimToken: token },
        data: {
          status:
            current.status === "PAUSED"
              ? "PAUSED"
              : code === "NUTRITION_CONTEXT_CHANGED"
                ? "INVALIDATED"
                : retryable && job.attempts < 11
                  ? "RETRY_WAIT"
                  : "FAILED",
          errorCode: code,
          claimToken: null,
          leaseUntil: null,
          nextAttemptAt: new Date(Date.now() + 30_000),
        },
      });
    });
    await prisma.nutritionWorkerAttempt.updateMany({
      where: { id: attempt.id },
      data: { status: "FAILED", errorCode: code, elapsedMs: Date.now() - started },
    });
    // No user identifiers, health input or AI output in worker logs.
    logger.warn({ code }, "Nutrition worker step rejected");
  } finally {
    await prisma.nutritionGenerationJob.updateMany({
      where: { id: job.id, claimToken: token, status: "PAUSED" },
      data: { claimToken: null, leaseUntil: null },
    });
  }
  return true;
}

export async function expireNutritionJobs(): Promise<void> {
  requireNutritionJobs();
  const expired = await prisma.nutritionGenerationJob.findMany({
    where: { expiresAt: { lte: new Date() }, input: { not: Prisma.DbNull } },
    select: { id: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.nutritionGenerationBatch.deleteMany({
      where: { jobId: { in: expired.map((job) => job.id) } },
    });
    await tx.nutritionGenerationJob.updateMany({
      where: { id: { in: expired.map((job) => job.id) } },
      data: {
        status: "EXPIRED",
        input: Prisma.DbNull,
        contextHash: "expired",
        baseStateHash: null,
        claimToken: null,
        leaseUntil: null,
      },
    });
  });
}
