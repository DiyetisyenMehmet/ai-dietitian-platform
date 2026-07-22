import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { trackingController } from "./tracking.controller";
import {
  createMealLogSchema,
  createWaterLogSchema,
  createWeightLogSchema,
} from "./tracking.schemas";

/**
 * Tracking router (mounted at /api/tracking). Every route is owner-scoped and
 * requires a valid access token. These logs feed the AI Health Coach's
 * trend/consistency/risk analysis.
 *
 * @openapi
 * tags:
 *   - name: Tracking
 *     description: Weight, meal and water time-series logging (Sprint 19).
 */
export const trackingRouter = Router();

/**
 * @openapi
 * /api/tracking/weight:
 *   post:
 *     tags: [Tracking]
 *     summary: Log a weight measurement
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: The created weight log. }
 *   get:
 *     tags: [Tracking]
 *     summary: List weight measurements (optionally since a date)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Weight logs, newest first. }
 */
trackingRouter.post(
  "/weight",
  authenticate,
  validate({ body: createWeightLogSchema }),
  trackingController.createWeight,
);
trackingRouter.get("/weight", authenticate, trackingController.listWeight);

/**
 * @openapi
 * /api/tracking/meals:
 *   post:
 *     tags: [Tracking]
 *     summary: Log a meal
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: The created meal log. }
 *   get:
 *     tags: [Tracking]
 *     summary: List meals (optionally since a date)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Meal logs, newest first. }
 */
trackingRouter.post(
  "/meals",
  authenticate,
  validate({ body: createMealLogSchema }),
  trackingController.createMeal,
);
trackingRouter.get("/meals", authenticate, trackingController.listMeals);

/**
 * @openapi
 * /api/tracking/water:
 *   post:
 *     tags: [Tracking]
 *     summary: Log water intake
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: The created water log. }
 *   get:
 *     tags: [Tracking]
 *     summary: List water intake (optionally since a date)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Water logs, newest first. }
 */
trackingRouter.post(
  "/water",
  authenticate,
  validate({ body: createWaterLogSchema }),
  trackingController.createWater,
);
trackingRouter.get("/water", authenticate, trackingController.listWater);
