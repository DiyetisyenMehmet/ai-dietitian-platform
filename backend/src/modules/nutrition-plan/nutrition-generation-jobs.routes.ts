import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { authenticate } from "../../middleware/authenticate";
import { requireConsent } from "../../middleware/require-consent";
import { requireCurrentWeightCheckIn } from "../../middleware/require-weight-check-in";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/async-handler";
import { sendSuccess } from "../../utils/api-response";
import { nutritionGenerationJobs, publicNutritionJob } from "./nutrition-generation-jobs";
import { nutritionRights, requireNutritionJobs } from "./nutrition-rights.service";
import { publicNutritionPlan } from "./nutrition-plan-public";
import { generatePlanSchema, PLAN_DURATIONS } from "./dto/nutrition-plan.schemas";

export const nutritionGenerationJobsRouter = Router();
nutritionGenerationJobsRouter.use(authenticate);
nutritionGenerationJobsRouter.get("/capabilities", (_req, res) =>
  sendSuccess(res, {
    resumable:
      env.NUTRITION_JOBS_ENABLED &&
      !!env.NUTRITION_RIGHTS_EFFECTIVE_AT &&
      (env.DIEWISH_ENVIRONMENT === "test" ||
        env.DIEWISH_ENVIRONMENT === "development" ||
        env.DIEWISH_ENVIRONMENT === "staging" ||
        (!env.DIEWISH_ENVIRONMENT && env.NODE_ENV !== "production")),
  }),
);
nutritionGenerationJobsRouter.use((_req, _res, next) => {
  try {
    requireNutritionJobs();
    next();
  } catch (error) {
    next(error);
  }
});
nutritionGenerationJobsRouter.get(
  "/current",
  asyncHandler(async (req, res) => {
    const job = await nutritionGenerationJobs.current(req.user!.id);
    sendSuccess(res, { job: job ? publicNutritionJob(job) : null });
  }),
);
nutritionGenerationJobsRouter.get(
  "/rights",
  validate({
    query: z.object({
      kind: z.enum(["NEW_PLAN", "MEAL_CHANGE"]),
      planId: z.string().uuid().optional(),
      dayNumber: z.coerce.number().int().min(1).max(30).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as {
      kind: "NEW_PLAN" | "MEAL_CHANGE";
      planId?: string;
      dayNumber?: number;
    };
    const plan = query.planId
      ? await import("../../lib/prisma").then(({ prisma }) =>
          prisma.nutritionPlan.findFirst({
            where: { id: query.planId, userId: req.user!.id, deletedAt: null },
          }),
        )
      : null;
    // Never accept a client-supplied origin id; derive it from the owner-scoped plan.
    sendSuccess(res, {
      rights: await nutritionRights(
        req.user!.id,
        query.kind,
        undefined,
        plan?.originPlanId ?? plan?.id,
        query.dayNumber,
      ),
    });
  }),
);
nutritionGenerationJobsRouter.post(
  "/",
  requireConsent,
  requireCurrentWeightCheckIn,
  validate({ body: generatePlanSchema.extend({ requestKey: z.string().uuid() }).strict() }),
  asyncHandler(async (req, res) => {
    const job = await nutritionGenerationJobs.start(req.user!.id, req.body);
    res.status(202);
    sendSuccess(res, { job: publicNutritionJob(job) });
  }),
);
nutritionGenerationJobsRouter.post(
  "/meal",
  requireConsent,
  requireCurrentWeightCheckIn,
  validate({
    body: z
      .object({
        requestKey: z.string().uuid(),
        sourcePlanId: z.string().uuid(),
        duration: z.enum(PLAN_DURATIONS),
        dayNumber: z.number().int().min(1).max(30),
        mealIndex: z.number().int().min(0).max(8),
      })
      .strict(),
  }),
  asyncHandler(async (req, res) => {
    const job = await nutritionGenerationJobs.start(req.user!.id, req.body);
    res.status(202);
    sendSuccess(res, { job: publicNutritionJob(job) });
  }),
);
const param = z.object({ id: z.string().uuid() });
nutritionGenerationJobsRouter.post(
  "/revision",
  requireConsent,
  requireCurrentWeightCheckIn,
  validate({
    body: z
      .object({
        requestKey: z.string().uuid(),
        sourcePlanId: z.string().uuid(),
        duration: z.enum(PLAN_DURATIONS),
        revisionMode: z.enum(["DAY", "FROM_DAY", "EXTEND"]),
        dayNumber: z.number().int().min(1).max(30).optional(),
      })
      .strict()
      .refine(
        (body) => body.revisionMode === "EXTEND" || !!body.dayNumber,
        "A revision day is required",
      ),
  }),
  asyncHandler(async (req, res) => {
    const job = await nutritionGenerationJobs.start(req.user!.id, req.body);
    res.status(202);
    sendSuccess(res, { job: publicNutritionJob(job) });
  }),
);
nutritionGenerationJobsRouter.get(
  "/:id",
  validate({ params: param }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, {
      job: publicNutritionJob(await nutritionGenerationJobs.get(req.user!.id, req.params.id)),
    }),
  ),
);
nutritionGenerationJobsRouter.post(
  "/:id/pause",
  validate({ params: param }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, {
      job: publicNutritionJob(await nutritionGenerationJobs.pause(req.user!.id, req.params.id)),
    }),
  ),
);
nutritionGenerationJobsRouter.post(
  "/:id/deliver",
  requireConsent,
  requireCurrentWeightCheckIn,
  validate({ params: param }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, {
      plan: publicNutritionPlan(await nutritionGenerationJobs.deliver(req.user!.id, req.params.id)),
    }),
  ),
);
