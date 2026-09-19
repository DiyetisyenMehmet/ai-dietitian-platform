import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { historyController } from "./history.controller";
import { historyComparisonQuerySchema, historyDayQuerySchema } from "./history.schemas";

export const historyRouter = Router();

historyRouter.get(
  "/day",
  authenticate,
  validate({ query: historyDayQuerySchema }),
  historyController.day,
);

historyRouter.get(
  "/comparison",
  authenticate,
  validate({ query: historyComparisonQuerySchema }),
  historyController.comparison,
);
