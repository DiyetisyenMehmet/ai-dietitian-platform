import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { requireConsent } from "../../middleware/require-consent";
import { validate } from "../../middleware/validate";
import { notificationController } from "./notification.controller";
import { updateNotificationPreferencesSchema } from "./notification.schemas";

/**
 * Notifications router (mounted at /api/notifications). Owner-scoped; requires a
 * valid access token.
 *
 * @openapi
 * tags:
 *   - name: Notifications
 *     description: Scheduled push-notification layer (Sprint 19).
 */
export const notificationRouter = Router();

notificationRouter.get("/preferences", authenticate, notificationController.getPreferences);
notificationRouter.patch(
  "/preferences",
  authenticate,
  requireConsent,
  validate({ body: updateNotificationPreferencesSchema }),
  notificationController.updatePreferences,
);

/**
 * @openapi
 * /api/notifications/scheduled:
 *   get:
 *     tags: [Notifications]
 *     summary: List the caller's scheduled (undelivered) notifications
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Scheduled notifications, soonest first. }
 *       401: { description: Missing or invalid access token. }
 */
notificationRouter.get("/scheduled", authenticate, notificationController.listScheduled);
