import { Router } from "express";

import { requireSchedulerIdentity } from "../middleware/require-scheduler-identity";
import { sendSuccess } from "../utils/api-response";
import { asyncHandler } from "../utils/async-handler";
import { tick } from "./coach-scheduler";
import {
  expireNutritionJobs,
  runNutritionWorkerStep,
} from "../modules/nutrition-plan/nutrition-generation-jobs";

export const schedulerTriggerRouter = Router();
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
  requireSchedulerIdentity,
  asyncHandler(async (_req, res) => {
    await tick();
    sendSuccess(res, { triggered: true });
  }),
);
