import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendCreated, sendNoContent, sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { goalsService } from "./goals.service";
import type { CreateGoalInput, GoalQuery, UpdateGoalInput } from "./goals.schemas";

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized("Authentication required.");
  return req.user.id;
}

function timezone(req: Request): string | undefined {
  return (req.query as unknown as GoalQuery).timezone;
}

export const goalsController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const goals = await goalsService.listGoals(requireUserId(req), timezone(req));
    sendSuccess(res, { goals });
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const goal = await goalsService.getGoal(requireUserId(req), req.params.id, timezone(req));
    sendSuccess(res, { goal });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const goal = await goalsService.createGoal(
      requireUserId(req),
      req.body as CreateGoalInput,
      timezone(req),
    );
    sendCreated(res, { goal });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const goal = await goalsService.updateGoal(
      requireUserId(req),
      req.params.id,
      req.body as UpdateGoalInput,
      timezone(req),
    );
    sendSuccess(res, { goal });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await goalsService.deleteGoal(requireUserId(req), req.params.id);
    sendNoContent(res);
  }),
};
