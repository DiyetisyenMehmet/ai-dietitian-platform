import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendCreated, sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { trackingService } from "./tracking.service";
import type {
  CreateMealLogInput,
  CreateWaterLogInput,
  CreateWeightLogInput,
} from "./tracking.schemas";

/** Resolves the authenticated user id or throws 401. */
function requireUserId(req: Request): string {
  if (!req.user) {
    throw ApiError.unauthorized("Authentication required.");
  }
  return req.user.id;
}

/** Parses a `?since=<ISO>` query param into a Date, if present and valid. */
function parseSince(req: Request): Date | undefined {
  const raw = req.query.since;
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Controller for the Sprint 19 tracking logs. */
export const trackingController = {
  createWeight: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const log = await trackingService.logWeight(userId, req.body as CreateWeightLogInput);
    sendCreated(res, { log });
  }),

  listWeight: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const logs = await trackingService.listWeight(userId, parseSince(req));
    sendSuccess(res, { logs });
  }),

  createMeal: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const log = await trackingService.logMeal(userId, req.body as CreateMealLogInput);
    sendCreated(res, { log });
  }),

  listMeals: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const logs = await trackingService.listMeals(userId, parseSince(req));
    sendSuccess(res, { logs });
  }),

  createWater: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const log = await trackingService.logWater(userId, req.body as CreateWaterLogInput);
    sendCreated(res, { log });
  }),

  listWater: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const logs = await trackingService.listWater(userId, parseSince(req));
    sendSuccess(res, { logs });
  }),
};
