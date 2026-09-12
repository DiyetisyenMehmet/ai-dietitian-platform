import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { requireConsent } from "../../middleware/require-consent";
import { validate } from "../../middleware/validate";
import { trackingController } from "./tracking.controller";
import {
  createMealLogSchema,
  createWaterLogSchema,
  createWeightLogSchema,
  mealLogIdParamsSchema,
  scheduleWaterReminderSchema,
  updateMealLogSchema,
  updateWaterGoalSchema,
  waterLogIdParamsSchema,
} from "./tracking.schemas";

/**
 * Tracking router (mounted at /api/tracking). Every route is owner-scoped and
 * requires a valid access token. New or changed health/nutrition data requires
 * current mandatory consent, while reads and user-initiated deletes remain
 * available after withdrawal so users can access/remove existing data.
 */
export const trackingRouter = Router();

/** Weight time-series and backend-owned weekly check-in schedule. */
trackingRouter.get("/weight/check-in", authenticate, trackingController.getWeightCheckIn);
trackingRouter.post(
  "/weight",
  authenticate,
  requireConsent,
  validate({ body: createWeightLogSchema }),
  trackingController.createWeight,
);
trackingRouter.get("/weight", authenticate, trackingController.listWeight);

/**
 * Meal time-series. A body containing only `mealType` is a valid explicit meal
 * check-in ("I ate this meal"); nutrition-bearing rows represent logged foods.
 */
trackingRouter.post(
  "/meals",
  authenticate,
  requireConsent,
  validate({ body: createMealLogSchema }),
  trackingController.createMeal,
);
trackingRouter.get("/meals", authenticate, trackingController.listMeals);
trackingRouter.patch(
  "/meals/:id",
  authenticate,
  requireConsent,
  validate({ params: mealLogIdParamsSchema, body: updateMealLogSchema }),
  trackingController.updateMeal,
);
trackingRouter.delete(
  "/meals/:id",
  authenticate,
  validate({ params: mealLogIdParamsSchema }),
  trackingController.deleteMeal,
);

/** Water tracking, personal goal, reminders and hydration guidance. */
trackingRouter.get("/water/goal", authenticate, trackingController.getWaterGoal);
trackingRouter.patch(
  "/water/goal",
  authenticate,
  requireConsent,
  validate({ body: updateWaterGoalSchema }),
  trackingController.updateWaterGoal,
);
trackingRouter.post(
  "/water/reminders",
  authenticate,
  requireConsent,
  validate({ body: scheduleWaterReminderSchema }),
  trackingController.scheduleWaterReminder,
);
trackingRouter.get(
  "/water/recommendation",
  authenticate,
  requireConsent,
  trackingController.getWaterRecommendation,
);
trackingRouter.post(
  "/water",
  authenticate,
  requireConsent,
  validate({ body: createWaterLogSchema }),
  trackingController.createWater,
);
trackingRouter.get("/water", authenticate, trackingController.listWater);
trackingRouter.delete(
  "/water/:id",
  authenticate,
  validate({ params: waterLogIdParamsSchema }),
  trackingController.deleteWater,
);
