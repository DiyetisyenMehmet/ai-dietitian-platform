import { randomUUID } from "node:crypto";

import type { Notification } from "@prisma/client";

import type { Request, Response } from "express";

import { ApiError } from "../../utils/api-error";
import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { notificationDeviceService } from "./notification-device.service";
import { getNotificationProvider } from "./notification.provider";
import { notificationService } from "./notification.service";
import type {
  RegisterNotificationDeviceInput,
  UnregisterNotificationDeviceInput,
  UpdateNotificationPreferencesInput,
} from "./notification.schemas";

/** Resolves the authenticated user id or throws 401. */
function requireUserId(req: Request): string {
  if (!req.user) {
    throw ApiError.unauthorized("Authentication required.");
  }
  return req.user.id;
}

/** Controller for the notifications surface. */
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

  registerDevice: asyncHandler(async (req: Request, res: Response) => {
    await notificationDeviceService.register(
      requireUserId(req),
      req.body as RegisterNotificationDeviceInput,
    );
    sendSuccess(res, { registered: true });
  }),

  unregisterDevice: asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.body as UnregisterNotificationDeviceInput;
    await notificationDeviceService.unregister(requireUserId(req), token);
    sendSuccess(res, { registered: false });
  }),

  testDelivery: asyncHandler(async (req: Request, res: Response) => {
    const serviceName = process.env.K_SERVICE?.trim() ?? "";
    if (!serviceName.endsWith("-staging")) {
      throw ApiError.notFound("Notification test endpoint is available only in staging.");
    }

    const now = new Date();
    const notification: Notification = {
      id: `staging-test-${randomUUID()}`,
      userId: requireUserId(req),
      type: "PROACTIVE_MESSAGE",
      title: "Diewish test bildirimi",
      body: "Bildirim bağlantısı güvenli şekilde çalışıyor.",
      scheduledFor: now,
      deliveredAt: null,
      metadata: null,
      createdAt: now,
    };

    const result = await getNotificationProvider().send(notification);
    sendSuccess(res, {
      disposition: result.disposition,
      code: result.code ?? null,
      deliveredDeviceCount: result.deliveredDeviceKeys.length,
    });
  }),
};
