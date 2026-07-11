import { Router } from "express";

import { healthRouter } from "./health.route";

/**
 * Root API router. Domain routers are mounted here in later sprints. Keeping a
 * single aggregation point makes the mounted surface explicit and testable.
 */
export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
