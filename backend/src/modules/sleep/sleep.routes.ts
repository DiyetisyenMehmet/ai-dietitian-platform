import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { requireConsent } from "../../middleware/require-consent";
import { validate } from "../../middleware/validate";
import { sleepController } from "./sleep.controller";
import { createSleepSchema, sleepIdParamsSchema, updateSleepSchema } from "./sleep.schemas";

/**
 * Sleep router (mounted at /api/sleep). Sleep data is owner-scoped health data.
 * Mutations and AI processing require current consent; authenticated users can
 * still read/delete previously stored data after withdrawal.
 */
export const sleepRouter = Router();

sleepRouter.post(
  "/",
  authenticate,
  requireConsent,
  validate({ body: createSleepSchema }),
  sleepController.create,
);
sleepRouter.get("/", authenticate, sleepController.list);
sleepRouter.get("/daily-assessment", authenticate, sleepController.dailyAssessment);
sleepRouter.get("/weekly-analysis", authenticate, sleepController.weeklyAnalysis);
sleepRouter.post("/ai-comment", authenticate, requireConsent, sleepController.aiComment);
sleepRouter.patch(
  "/:id",
  authenticate,
  requireConsent,
  validate({ params: sleepIdParamsSchema, body: updateSleepSchema }),
  sleepController.update,
);
sleepRouter.delete(
  "/:id",
  authenticate,
  validate({ params: sleepIdParamsSchema }),
  sleepController.remove,
);
