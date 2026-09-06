import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendCreated, sendNoContent, sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { nutritionPlanDeviationService } from "./nutrition-plan-deviation.service";
import { nutritionPlanService } from "./nutrition-plan.service";
import type {
  ActivePlanQuery,
  CreateDeviationInput,
  GeneratePlanInput,
  PlanDeviationParam,
  PlanIdParam,
} from "./dto/nutrition-plan.schemas";

/** Resolves the authenticated user id or throws 401. */
function requireUserId(req: Request): string {
  if (!req.user) {
    throw ApiError.unauthorized("Authentication required.");
  }
  return req.user.id;
}

/**
 * Controller for Diewish's Personalized Nutrition Plan Engine endpoints. The
 * generation pipeline runs synchronously (no job queue in this codebase), so
 * the full plan is returned on completion.
 */
export const nutritionPlanController = {
  /** Generates a new nutrition plan for the authenticated user. */
  generate: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { duration } = req.body as GeneratePlanInput;
    const plan = await nutritionPlanService.generate(userId, duration);
    sendCreated(res, { plan });
  }),

  /** Regenerates a plan (new version) based on an existing plan's duration. */
  regenerate: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as PlanIdParam;
    const plan = await nutritionPlanService.regenerate(userId, id);
    sendCreated(res, { plan });
  }),

  /** Lists all of the authenticated user's plans (all versions). */
  list: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const plans = await nutritionPlanService.list(userId);
    sendSuccess(res, { plans });
  }),

  /** Returns the active plan for a given duration. */
  getActive: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { duration } = req.query as unknown as ActivePlanQuery;
    const plan = await nutritionPlanService.getActive(userId, duration);
    sendSuccess(res, { plan });
  }),

  /** Returns a specific plan by id. */
  getById: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as PlanIdParam;
    const plan = await nutritionPlanService.getById(userId, id);
    sendSuccess(res, { plan });
  }),

  /** Lists owner-scoped adherence/Kaçamak records for a plan. */
  listDeviations: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as PlanIdParam;
    const deviations = await nutritionPlanDeviationService.list(userId, id);
    sendSuccess(res, { deviations });
  }),

  /** Records a paid user's food/meal/day-level Kaçamak without mutating the plan. */
  createDeviation: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as PlanIdParam;
    const input = req.body as CreateDeviationInput;
    const deviation = await nutritionPlanDeviationService.create(userId, id, input);
    sendCreated(res, { deviation });
  }),

  /** Removes an owner-scoped Kaçamak record so users can correct their own history. */
  deleteDeviation: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id, deviationId } = req.params as PlanDeviationParam;
    await nutritionPlanDeviationService.remove(userId, id, deviationId);
    sendNoContent(res);
  }),
};
