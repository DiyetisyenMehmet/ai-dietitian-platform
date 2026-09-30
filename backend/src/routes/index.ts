import { Router } from "express";

import { authenticateAny } from "../middleware/authenticate";
import { requireOnboardingCompleted } from "../middleware/require-onboarding";

import { accountRouter } from "../modules/account/account.routes";
import { authRouter } from "../modules/auth/auth.routes";
import { identityRouter } from "../modules/identity/identity.routes";
import { bloodTestRouter } from "../modules/blood-test/blood-test.routes";
import { bloodTestAnalysisModule } from "../modules/blood-test-analysis/blood-test-analysis.module";
import { nutritionPlanModule } from "../modules/nutrition-plan/nutrition-plan.module";
import { nutritionDataModule } from "../modules/nutrition-data/nutrition-data.module";
import { aiChatModule } from "../modules/ai-chat/ai-chat.module";
import { aiUsageModule } from "../modules/ai-usage/ai-usage.module";
import { paymentsModule } from "../modules/payments/payments.module";
import { legalModule } from "../modules/legal/legal.module";
import { trackingModule } from "../modules/tracking/tracking.module";
import { notificationModule } from "../modules/notifications/notification.module";
import { aiCoachModule } from "../modules/ai-coach/ai-coach.module";
import { activityModule } from "../modules/activity/activity.module";
import { sleepModule } from "../modules/sleep/sleep.module";
import { historyModule } from "../modules/history/history.module";
import { expertProductModule } from "../modules/expert-products/expert-product.module";
import { goalsModule } from "../modules/goals/goals.module";
import { onboardingRouter } from "../modules/onboarding/onboarding.routes";
import { foodScanRouter } from "../modules/food-scan/food-scan.routes";
import { adminModule } from "../modules/admin/admin.module";
import { healthRouter } from "./health.route";
import { schedulerTriggerRouter } from "../scheduler/scheduler-trigger.routes";

/**
 * Root API router. Domain routers are mounted here as sprints deliver them.
 * Keeping a single aggregation point makes the mounted surface explicit and
 * testable.
 */
export const apiRouter = Router();

/**
 * Routes intentionally available before onboarding completes.
 *
 * These cover service health, authentication/identity, account security,
 * mandatory legal consent, onboarding itself, existing payment/webhook
 * behavior, and the separately authorized Management Center.
 */
apiRouter.use("/health", healthRouter);
apiRouter.use("/internal/scheduler", schedulerTriggerRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/identity", identityRouter);
apiRouter.use("/account", accountRouter);
apiRouter.use("/onboarding", onboardingRouter);

for (const { path, router } of legalModule.routes) {
  apiRouter.use(path, router);
}

// Keep payment/webhook behavior unchanged in this task. Payment routes retain
// their existing authentication/provider-signature controls.
for (const { path, router } of paymentsModule.routes) {
  apiRouter.use(path, router);
}

for (const { path, router } of adminModule.routes) {
  apiRouter.use(path, router);
}

/**
 * Central mount helper for normal application features. authenticateAny
 * resolves the current server-side User row, then the onboarding gate blocks
 * incomplete full accounts. Child routers keep their existing auth/consent/
 * subscription guards, including their existing guest restrictions.
 */
function mountOnboarded(path: string, router: ReturnType<typeof Router>): void {
  apiRouter.use(path, authenticateAny, requireOnboardingCompleted, router);
}

mountOnboarded("/food-scan", foodScanRouter);
for (const { path, router } of nutritionDataModule.routes) {
  mountOnboarded(path, router);
}

// Concrete blood-test analysis paths still mount before the upload router so
// they cannot be shadowed by parameterized /:id routes.
for (const { path, router, mountFirst } of bloodTestAnalysisModule.routes) {
  if (mountFirst) mountOnboarded(path, router);
}
mountOnboarded("/blood-tests", bloodTestRouter);
for (const { path, router, mountFirst } of bloodTestAnalysisModule.routes) {
  if (!mountFirst) mountOnboarded(path, router);
}

for (const { path, router } of nutritionPlanModule.routes) {
  mountOnboarded(path, router);
}
for (const { path, router } of aiChatModule.routes) {
  mountOnboarded(path, router);
}
for (const { path, router } of aiUsageModule.routes) {
  mountOnboarded(path, router);
}
for (const { path, router } of trackingModule.routes) {
  mountOnboarded(path, router);
}
for (const { path, router } of notificationModule.routes) {
  mountOnboarded(path, router);
}
for (const { path, router } of aiCoachModule.routes) {
  mountOnboarded(path, router);
}
for (const { path, router } of activityModule.routes) {
  mountOnboarded(path, router);
}
for (const { path, router } of sleepModule.routes) {
  mountOnboarded(path, router);
}
for (const { path, router } of historyModule.routes) {
  mountOnboarded(path, router);
}
for (const { path, router } of expertProductModule.routes) {
  mountOnboarded(path, router);
}
for (const { path, router } of goalsModule.routes) {
  mountOnboarded(path, router);
}
