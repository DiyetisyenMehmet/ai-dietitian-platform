import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { requireConsent } from "../../middleware/require-consent";
import { validate } from "../../middleware/validate";
import { nutritionPlanController } from "./nutrition-plan.controller";
import {
  activePlanQuerySchema,
  createDeviationSchema,
  extendPlanSchema,
  generatePlanSchema,
  planDeviationParamSchema,
  planIdParamSchema,
  refreshPlanSchema,
  shiftPlanDaySchema,
} from "./dto/nutrition-plan.schemas";

/**
 * Nutrition-plan router (mounted at /api/nutrition-plans). Every route requires
 * a valid access token; the service scopes all access by owner. Generation,
 * regeneration/revision and new adherence writes require current mandatory
 * consent; existing plans and adherence history remain readable/correctable
 * after consent withdrawal.
 */
export const nutritionPlanRouter = Router();

nutritionPlanRouter.post(
  "/generate",
  authenticate,
  requireConsent,
  validate({ body: generatePlanSchema }),
  nutritionPlanController.generate,
);

nutritionPlanRouter.get(
  "/active",
  authenticate,
  validate({ query: activePlanQuerySchema }),
  nutritionPlanController.getActive,
);

nutritionPlanRouter.get("/", authenticate, nutritionPlanController.list);

nutritionPlanRouter.post(
  "/:id/regenerate",
  authenticate,
  requireConsent,
  validate({ params: planIdParamSchema }),
  nutritionPlanController.regenerate,
);

nutritionPlanRouter.post(
  "/:id/refresh",
  authenticate,
  requireConsent,
  validate({ params: planIdParamSchema, body: refreshPlanSchema }),
  nutritionPlanController.refresh,
);

nutritionPlanRouter.post(
  "/:id/extend",
  authenticate,
  requireConsent,
  validate({ params: planIdParamSchema, body: extendPlanSchema }),
  nutritionPlanController.extend,
);

/** Paid non-AI calendar continuity operation: move today's plan day to tomorrow. */
nutritionPlanRouter.post(
  "/:id/shift-day",
  authenticate,
  requireConsent,
  validate({ params: planIdParamSchema, body: shiftPlanDaySchema }),
  nutritionPlanController.shiftDay,
);

nutritionPlanRouter.get(
  "/:id/deviations",
  authenticate,
  validate({ params: planIdParamSchema }),
  nutritionPlanController.listDeviations,
);

nutritionPlanRouter.post(
  "/:id/deviations",
  authenticate,
  requireConsent,
  validate({ params: planIdParamSchema, body: createDeviationSchema }),
  nutritionPlanController.createDeviation,
);

nutritionPlanRouter.delete(
  "/:id/deviations/:deviationId",
  authenticate,
  validate({ params: planDeviationParamSchema }),
  nutritionPlanController.deleteDeviation,
);

nutritionPlanRouter.delete(
  "/:id",
  authenticate,
  validate({ params: planIdParamSchema }),
  nutritionPlanController.deletePlan,
);

/** Returns a specific plan by id. Keep this catch-all route last. */
nutritionPlanRouter.get(
  "/:id",
  authenticate,
  validate({ params: planIdParamSchema }),
  nutritionPlanController.getById,
);
