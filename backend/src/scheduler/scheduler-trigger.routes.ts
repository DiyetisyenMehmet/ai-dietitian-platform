import { Router } from "express";

import { requireSchedulerIdentity } from "../middleware/require-scheduler-identity";
import { sendSuccess } from "../utils/api-response";
import { asyncHandler } from "../utils/async-handler";
import { tick } from "./coach-scheduler";

export const schedulerTriggerRouter = Router();

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
