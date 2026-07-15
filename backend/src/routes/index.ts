import { Router } from "express";

import { authRouter } from "../modules/auth/auth.routes";
import { onboardingRouter } from "../modules/onboarding/onboarding.routes";
import { healthRouter } from "./health.route";

/**
 * Root API router. Domain routers are mounted here as sprints deliver them.
 * Keeping a single aggregation point makes the mounted surface explicit and
 * testable.
 */
export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/onboarding", onboardingRouter);
