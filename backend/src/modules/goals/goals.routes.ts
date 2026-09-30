import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { requireConsent } from "../../middleware/require-consent";
import { validate } from "../../middleware/validate";
import { goalsController } from "./goals.controller";
import {
  createGoalSchema,
  goalIdParamsSchema,
  goalQuerySchema,
  updateGoalSchema,
} from "./goals.schemas";

export const goalsRouter = Router();

goalsRouter.get(
  "/",
  authenticate,
  validate({ query: goalQuerySchema }),
  goalsController.list,
);

goalsRouter.post(
  "/",
  authenticate,
  requireConsent,
  validate({ query: goalQuerySchema, body: createGoalSchema }),
  goalsController.create,
);

goalsRouter.get(
  "/:id",
  authenticate,
  validate({ params: goalIdParamsSchema, query: goalQuerySchema }),
  goalsController.get,
);

goalsRouter.patch(
  "/:id",
  authenticate,
  requireConsent,
  validate({ params: goalIdParamsSchema, query: goalQuerySchema, body: updateGoalSchema }),
  goalsController.update,
);

goalsRouter.delete(
  "/:id",
  authenticate,
  validate({ params: goalIdParamsSchema }),
  goalsController.remove,
);
