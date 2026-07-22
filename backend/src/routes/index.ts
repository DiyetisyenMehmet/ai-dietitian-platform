import { Router } from "express";

import { accountRouter } from "../modules/account/account.routes";
import { authRouter } from "../modules/auth/auth.routes";
import { bloodTestRouter } from "../modules/blood-test/blood-test.routes";
import { bloodTestAnalysisModule } from "../modules/blood-test-analysis/blood-test-analysis.module";
import { nutritionPlanModule } from "../modules/nutrition-plan/nutrition-plan.module";
import { aiChatModule } from "../modules/ai-chat/ai-chat.module";
import { aiUsageModule } from "../modules/ai-usage/ai-usage.module";
import { paymentsModule } from "../modules/payments/payments.module";
import { legalModule } from "../modules/legal/legal.module";
import { trackingModule } from "../modules/tracking/tracking.module";
import { notificationModule } from "../modules/notifications/notification.module";
import { aiCoachModule } from "../modules/ai-coach/ai-coach.module";
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

// AI Dietitian Chat (Sprint 14, C2) and AI Usage Quota (Sprint 14, C5). Each
// mounts at its own base path with no ordering concerns.
for (const { path, router } of aiChatModule.routes) {
  apiRouter.use(path, router);
}
for (const { path, router } of aiUsageModule.routes) {
  apiRouter.use(path, router);
}

// Payments & Subscriptions (Sprint 15) and Legal & Consent (Sprint 15). Each
// mounts at its own base path with no ordering concerns.
for (const { path, router } of paymentsModule.routes) {
  apiRouter.use(path, router);
}
for (const { path, router } of legalModule.routes) {
  apiRouter.use(path, router);
}

// AI Health Coach Intelligence (Sprint 19): time-series tracking, the coach
// endpoints and the scheduled-notification surface. Each mounts at its own base
// path with no ordering concerns.
for (const { path, router } of trackingModule.routes) {
  apiRouter.use(path, router);
}
for (const { path, router } of notificationModule.routes) {
  apiRouter.use(path, router);
}
for (const { path, router } of aiCoachModule.routes) {
  apiRouter.use(path, router);
}
