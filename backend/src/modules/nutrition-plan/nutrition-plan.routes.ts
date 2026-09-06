import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { requireConsent } from "../../middleware/require-consent";
import { validate } from "../../middleware/validate";
import { nutritionPlanController } from "./nutrition-plan.controller";
import {
  activePlanQuerySchema,
  createDeviationSchema,
  generatePlanSchema,
  planDeviationParamSchema,
  planIdParamSchema,
} from "./dto/nutrition-plan.schemas";

/**
 * Nutrition-plan router (mounted at /api/nutrition-plans). Every route requires
 * a valid access token; the service scopes all access by owner. Generation,
 * regeneration and new adherence writes require current mandatory consent;
 * existing plans and adherence history remain readable/correctable after
 * consent withdrawal.
 */
export const nutritionPlanRouter = Router();

/**
 * @openapi
 * /api/nutrition-plans/generate:
 *   post:
 *     tags: [NutritionPlan]
 *     summary: Generate a personalized nutrition plan
 *     security: [{ bearerAuth: [] }]
 */
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

/** Regenerate a supported plan as a new version. */
nutritionPlanRouter.post(
  "/:id/regenerate",
  authenticate,
  requireConsent,
  validate({ params: planIdParamSchema }),
  nutritionPlanController.regenerate,
);

/**
 * @openapi
 * /api/nutrition-plans/{id}/deviations:
 *   get:
 *     tags: [NutritionPlan]
 *     summary: List the user's Kaçamak/adherence records for a plan
 *   post:
 *     tags: [NutritionPlan]
 *     summary: Record a food, meal or day-level Kaçamak
 */
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

/** Returns a specific plan by id. Keep this catch-all route last. */
nutritionPlanRouter.get(
  "/:id",
  authenticate,
  validate({ params: planIdParamSchema }),
  nutritionPlanController.getById,
);
