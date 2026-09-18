import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { requireConsent } from "../../middleware/require-consent";
import { validate } from "../../middleware/validate";
import { notificationController } from "./notification.controller";
import {
  registerNotificationDeviceSchema,
  unregisterNotificationDeviceSchema,
  updateNotificationPreferencesSchema,
} from "./notification.schemas";

/** Notifications router (mounted at /api/notifications). */
export const notificationRouter = Router();

notificationRouter.get("/preferences", authenticate, notificationController.getPreferences);
notificationRouter.patch(
  "/preferences",
  authenticate,
  requireConsent,
  validate({ body: updateNotificationPreferencesSchema }),
  notificationController.updatePreferences,
);

notificationRouter.get("/scheduled", authenticate, notificationController.listScheduled);

notificationRouter.post(
  "/devices",
  authenticate,
  requireConsent,
  validate({ body: registerNotificationDeviceSchema }),
  notificationController.registerDevice,
);
notificationRouter.post(
  "/test",
  authenticate,
  requireConsent,
  notificationController.testDelivery,
);

notificationRouter.post(
  "/devices/unregister",
  authenticate,
  validate({ body: unregisterNotificationDeviceSchema }),
  notificationController.unregisterDevice,
);
