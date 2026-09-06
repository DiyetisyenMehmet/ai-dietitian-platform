import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { requireConsent } from "../../middleware/require-consent";
import { validate } from "../../middleware/validate";
import { nutritionPlanController } from "./nutrition-plan.controller";
import {
  activePlanQuerySchema,
  generatePlanSchema,
  planIdParamSchema,
} from "./dto/nutrition-plan.schemas";

/**
 * Nutrition-plan router (mounted at /api/nutrition-plans). Every route requires
 * a valid access token; the service scopes all access by owner. Generation and
 * regeneration process health/profile context and therefore require current
 * mandatory consent; existing plans remain readable after consent withdrawal.
 */
export const nutritionPlanRouter = Router();

/**
 * @openapi
 * /api/nutrition-plans/generate:
 *   post:
 *     tags: [NutritionPlan]
 *     summary: Generate a personalized nutrition plan
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [duration]
 *             properties:
 *               duration: { type: string, enum: [SEVEN_DAY, FOURTEEN_DAY, THIRTY_DAY] }
 *     responses:
 *       201: { description: The generated plan. }
 *       400: { description: Onboarding profile is incomplete or duration is unsupported. }
 *       401: { description: Missing or invalid access token. }
 *       403: { description: Current mandatory consent is missing. }
 */
nutritionPlanRouter.post(
  "/generate",
  authenticate,
  requireConsent,
  validate({ body: generatePlanSchema }),
  nutritionPlanController.generate,
);

/**
 * @openapi
 * /api/nutrition-plans/active:
 *   get:
 *     tags: [NutritionPlan]
 *     summary: Get the active plan for a duration
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: duration
 *         required: true
 *         schema: { type: string, enum: [SEVEN_DAY, FOURTEEN_DAY, THIRTY_DAY] }
 *     responses:
 *       200: { description: The active plan. }
 *       401: { description: Missing or invalid access token. }
 *       404: { description: No active plan for this duration. }
 */
nutritionPlanRouter.get(
  "/active",
  authenticate,
  validate({ query: activePlanQuerySchema }),
  nutritionPlanController.getActive,
);

/**
 * @openapi
 * /api/nutrition-plans:
 *   get:
 *     tags: [NutritionPlan]
 *     summary: List the authenticated user's plans (all versions)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: The user's plans, newest first. }
 *       401: { description: Missing or invalid access token. }
 */
nutritionPlanRouter.get("/", authenticate, nutritionPlanController.list);

/**
 * @openapi
 * /api/nutrition-plans/{id}/regenerate:
 *   post:
 *     tags: [NutritionPlan]
 *     summary: Regenerate a supported plan (creates a new version)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       201: { description: The newly generated plan version. }
 *       400: { description: Legacy 60-day plan can no longer be regenerated. }
 *       401: { description: Missing or invalid access token. }
 *       403: { description: Current mandatory consent is missing. }
 *       404: { description: Source plan not found. }
 */
nutritionPlanRouter.post(
  "/:id/regenerate",
  authenticate,
  requireConsent,
  validate({ params: planIdParamSchema }),
  nutritionPlanController.regenerate,
);

/**
 * @openapi
 * /api/nutrition-plans/{id}:
 *   get:
 *     tags: [NutritionPlan]
 *     summary: Get a specific plan by id
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: The plan. }
 *       401: { description: Missing or invalid access token. }
 *       404: { description: Plan not found. }
 */
nutritionPlanRouter.get(
  "/:id",
  authenticate,
  validate({ params: planIdParamSchema }),
  nutritionPlanController.getById,
);
