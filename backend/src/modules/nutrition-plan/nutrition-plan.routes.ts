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

/** Get the active plan for a supported duration. */
nutritionPlanRouter.get(
  "/active",
  authenticate,
  validate({ query: activePlanQuerySchema }),
  nutritionPlanController.getActive,
);

/** List all owner-scoped plan versions. */
nutritionPlanRouter.get("/", authenticate, nutritionPlanController.list);

/** Regenerate a supported plan as a completely new version. */
nutritionPlanRouter.post(
  "/:id/regenerate",
  authenticate,
  requireConsent,
  validate({ params: planIdParamSchema }),
  nutritionPlanController.regenerate,
);

/** Paid scoped refresh: one day or the selected day plus all future days. */
nutritionPlanRouter.post(
  "/:id/refresh",
  authenticate,
  requireConsent,
  validate({ params: planIdParamSchema, body: refreshPlanSchema }),
  nutritionPlanController.refresh,
);

/** Paid extension preserves existing plan days and generates only added days. */
nutritionPlanRouter.post(
  "/:id/extend",
  authenticate,
  requireConsent,
  validate({ params: planIdParamSchema, body: extendPlanSchema }),
  nutritionPlanController.extend,
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

/** Delete/correct a single owner-scoped Kaçamak record. */
nutritionPlanRouter.delete(
  "/:id/deviations/:deviationId",
  authenticate,
  validate({ params: planDeviationParamSchema }),
  nutritionPlanController.deleteDeviation,
);

/** Soft-delete one owner-scoped plan; deletion never requires paid entitlement or current consent. */
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
