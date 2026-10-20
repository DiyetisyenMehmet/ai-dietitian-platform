import { Router } from "express";
import { z } from "zod";
import { drainPasswordResetDeliveries } from "../modules/account/password-reset-delivery";

import { requireSchedulerIdentity } from "../middleware/require-scheduler-identity";
import { sendSuccess } from "../utils/api-response";
import { asyncHandler } from "../utils/async-handler";
import { tick } from "./coach-scheduler";
import { stagingAutomationPaused } from "./automation-policy";
import { ApiError } from "../utils/api-error";
import { validate } from "../middleware/validate";
import { servePasswordResetDelivery } from "../modules/account/password-reset-request-delivery";
import {
  expireNutritionJobs,
  runNutritionWorkerStep,
} from "../modules/nutrition-plan/nutrition-generation-jobs";

export const schedulerTriggerRouter = Router();
// Separate authenticated request worker; never called by the paused cron job.
schedulerTriggerRouter.post(
  "/password-reset",
  (_req, _res, next) => stagingAutomationPaused() ? next() : next(new ApiError(404, "Not found.")),
  requireSchedulerIdentity,
  validate({ body: z.object({ userId: z.string().uuid().nullable() }).strict() }),
  asyncHandler(servePasswordResetDelivery),
);
// Separate explicit-request drain; leaves notification /tick timing untouched.
schedulerTriggerRouter.post(
  "/nutrition-step",
  requireSchedulerIdentity,
  asyncHandler(async (_req, res) => {
    await expireNutritionJobs();
    const worked = await runNutritionWorkerStep();
    sendSuccess(res, { worked });
  }),
);

/**
 * External wake-up hook for staging Cloud Scheduler. The actual work remains
 * the existing scheduler tick, including notification leases/retries and the
 * once-per-day DB claims for coach jobs.
 */
schedulerTriggerRouter.post(
  "/tick",
  (_req, _res, next) => stagingAutomationPaused()
    ? next(new ApiError(404, "Staging automation is paused.", { code: "STAGING_AUTOMATION_PAUSED" }))
    : next(),
  requireSchedulerIdentity,
  asyncHandler(async (_req, res) => {
    // Await durable recovery delivery inside the existing authenticated request.
    // Cloud Run can suspend CPU after public requests; timers alone are insufficient.
    await drainPasswordResetDeliveries();
    await tick();
    sendSuccess(res, { triggered: true });
  }),
);
