import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { notificationController } from "./notification.controller";

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
