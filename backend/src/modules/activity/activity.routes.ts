import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { requireConsent } from "../../middleware/require-consent";
import { validate } from "../../middleware/validate";
import { activityController } from "./activity.controller";
import { activityIdParamsSchema, createActivitySchema } from "./activity.schemas";

/**
 * Activity router (mounted at /api/activity). Every route is owner-scoped and
 * requires a valid access token. Creating a new health/activity log requires
 * current mandatory consent; existing logs remain readable/deletable after
 * withdrawal so users can still control data already stored about them.
 * These entries feed the AI Health Coach's activity-consistency and inactivity
 * analysis (Sprint 22).
 *
 * @openapi
 * tags:
 *   - name: Activity
 *     description: Physical-activity logging (Sprint 22).
 */
export const activityRouter = Router();

/**
 * @openapi
 * /api/activity:
 *   post:
 *     tags: [Activity]
 *     summary: Log a physical activity
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: The created activity. }
 *   get:
 *     tags: [Activity]
 *     summary: List activities (optionally since a date)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Activities, newest first. }
 */
activityRouter.post(
  "/",
  authenticate,
  requireConsent,
  validate({ body: createActivitySchema }),
  activityController.create,
);
activityRouter.get("/", authenticate, activityController.list);

/**
 * @openapi
 * /api/activity/{id}:
 *   delete:
 *     tags: [Activity]
 *     summary: Delete one of the authenticated user's activity logs
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Activity removed or already absent. }
 */
activityRouter.delete(
  "/:id",
  authenticate,
  validate({ params: activityIdParamsSchema }),
  activityController.remove,
);
