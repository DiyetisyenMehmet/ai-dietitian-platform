import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { notificationService } from "./notification.service";
import type { UpdateNotificationPreferencesInput } from "./notification.schemas";

/** Resolves the authenticated user id or throws 401. */
function requireUserId(req: Request): string {
  if (!req.user) {
    throw ApiError.unauthorized("Authentication required.");
  }
  return req.user.id;
}

/** Controller for the Sprint 19 notifications surface. */
export const notificationController = {
  getPreferences: asyncHandler(async (req: Request, res: Response) => {
    const preferences = await notificationService.getPreferences(requireUserId(req));
    sendSuccess(res, { preferences });
  }),

  updatePreferences: asyncHandler(async (req: Request, res: Response) => {
    const preferences = await notificationService.updatePreferences(
      requireUserId(req),
      req.body as UpdateNotificationPreferencesInput,
    );
    sendSuccess(res, { preferences });
  }),

  listScheduled: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const notifications = await notificationService.getScheduledNotifications(userId);
    sendSuccess(res, { notifications });
  }),
};
