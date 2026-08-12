import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendCreated, sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { activityService } from "./activity.service";
import type { CreateActivityInput } from "./activity.schemas";

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

/**
 * Controller for the Sprint 22 Activity API. Owner-scoped; reuses the Sprint
 * 22.1B activity service. Mirrors the Sprint 19 tracking controller.
 */
export const activityController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const activity = await activityService.logActivity(userId, req.body as CreateActivityInput);
    sendCreated(res, { activity });
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const activities = await activityService.listActivities(userId, parseSince(req));
    sendSuccess(res, { activities });
  }),
};
