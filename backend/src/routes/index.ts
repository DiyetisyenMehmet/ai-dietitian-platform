import { Router } from "express";

import { accountRouter } from "../modules/account/account.routes";
import { authRouter } from "../modules/auth/auth.routes";
import { bloodTestRouter } from "../modules/blood-test/blood-test.routes";
import { bloodTestAnalysisModule } from "../modules/blood-test-analysis/blood-test-analysis.module";
import { nutritionPlanModule } from "../modules/nutrition-plan/nutrition-plan.module";
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
apiRouter.use("/account", accountRouter);
apiRouter.use("/onboarding", onboardingRouter);

// Blood-test analysis module (Sprint 12). `mountFirst` routers are mounted
// before the Sprint 11 upload router so their concrete paths (e.g. /analyses)
// are not shadowed by the upload router's parameterized `/:id` routes.
for (const { path, router, mountFirst } of bloodTestAnalysisModule.routes) {
  if (mountFirst) apiRouter.use(path, router);
}
apiRouter.use("/blood-tests", bloodTestRouter);
for (const { path, router, mountFirst } of bloodTestAnalysisModule.routes) {
  if (!mountFirst) apiRouter.use(path, router);
}

// Nutrition Plan Engine (Sprint 13). Mounted at its own base path; no ordering
// concerns since it does not share a base with any other module.
for (const { path, router } of nutritionPlanModule.routes) {
  apiRouter.use(path, router);
}
