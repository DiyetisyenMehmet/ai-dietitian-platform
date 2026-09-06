import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendCreated, sendNoContent, sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { nutritionPlanDeviationService } from "./nutrition-plan-deviation.service";
import { nutritionPlanRevisionService } from "./nutrition-plan-revision.service";
import { nutritionPlanService } from "./nutrition-plan.service";
import type {
  ActivePlanQuery,
  CreateDeviationInput,
  ExtendPlanInput,
  GeneratePlanInput,
  PlanDeviationParam,
  PlanIdParam,
  RefreshPlanInput,
  ShiftPlanDayInput,
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
  generate: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { duration, startDate } = req.body as GeneratePlanInput;
    const plan = await nutritionPlanService.generate(userId, duration, startDate);
    sendCreated(res, { plan });
  }),

  regenerate: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as PlanIdParam;
    const plan = await nutritionPlanService.regenerate(userId, id);
    sendCreated(res, { plan });
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as PlanIdParam;
    const input = req.body as RefreshPlanInput;
    const plan = await nutritionPlanRevisionService.refresh(userId, id, input);
    sendCreated(res, { plan });
  }),

  extend: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as PlanIdParam;
    const input = req.body as ExtendPlanInput;
    const plan = await nutritionPlanRevisionService.extend(userId, id, input);
    sendCreated(res, { plan });
  }),

  shiftDay: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as PlanIdParam;
    const input = req.body as ShiftPlanDayInput;
    const plan = await nutritionPlanRevisionService.shiftDay(userId, id, input);
    sendCreated(res, { plan });
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const plans = await nutritionPlanService.list(userId);
    sendSuccess(res, { plans });
  }),

  getActive: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { duration } = req.query as unknown as ActivePlanQuery;
    const plan = await nutritionPlanService.getActive(userId, duration);
    sendSuccess(res, { plan });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as PlanIdParam;
    const plan = await nutritionPlanService.getById(userId, id);
    sendSuccess(res, { plan });
  }),

  deletePlan: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as PlanIdParam;
    await nutritionPlanService.remove(userId, id);
    sendNoContent(res);
  }),

  listDeviations: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as PlanIdParam;
    const deviations = await nutritionPlanDeviationService.list(userId, id);
    sendSuccess(res, { deviations });
  }),

  createDeviation: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = req.params as PlanIdParam;
    const input = req.body as CreateDeviationInput;
    const deviation = await nutritionPlanDeviationService.create(userId, id, input);
    sendCreated(res, { deviation });
  }),

  deleteDeviation: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id, deviationId } = req.params as PlanDeviationParam;
    await nutritionPlanDeviationService.remove(userId, id, deviationId);
    sendNoContent(res);
  }),
};
