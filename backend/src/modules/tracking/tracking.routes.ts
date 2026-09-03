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
} from "./tracking.schemas";

/**
 * Tracking router (mounted at /api/tracking). Every route is owner-scoped and
 * requires a valid access token. New health/nutrition writes require current
 * mandatory consent, while reads and user-initiated deletes remain available
 * after withdrawal so users can still access/remove their existing data.
 */
export const trackingRouter = Router();

/** Weight time-series. */
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
 * check-in ("I ate this meal"); nutrition-bearing rows continue to represent
 * individual logged foods. DELETE is owner-scoped and intentionally does not
 * require current processing consent because deletion is a data-subject action.
 */
trackingRouter.post(
  "/meals",
  authenticate,
  requireConsent,
  validate({ body: createMealLogSchema }),
  trackingController.createMeal,
);
trackingRouter.get("/meals", authenticate, trackingController.listMeals);
trackingRouter.delete(
  "/meals/:id",
  authenticate,
  validate({ params: mealLogIdParamsSchema }),
  trackingController.deleteMeal,
);

/** Water time-series. */
trackingRouter.post(
  "/water",
  authenticate,
  requireConsent,
  validate({ body: createWaterLogSchema }),
  trackingController.createWater,
);
trackingRouter.get("/water", authenticate, trackingController.listWater);
