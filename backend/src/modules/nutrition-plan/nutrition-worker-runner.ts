import { env } from "../../config/env";
import { expireNutritionJobs, runNutritionWorkerStep } from "./nutrition-generation-jobs";
import { logger } from "../../lib/logger";

/** Development runner only. Cloud runtime uses an authenticated bounded request. */
let timer: NodeJS.Timeout | undefined;
let running = false;
export function startNutritionWorker(): void {
  if (
    timer ||
    !env.NUTRITION_JOBS_ENABLED ||
    !env.NUTRITION_RIGHTS_EFFECTIVE_AT ||
    !["development", "test"].includes(env.NODE_ENV)
  )
    return;
  timer = setInterval(() => {
    if (running) return;
    running = true;
    void expireNutritionJobs()
      .then(() => runNutritionWorkerStep())
      .catch(() => logger.warn("Nutrition worker unavailable"))
      .finally(() => {
        running = false;
      });
  }, 1000);
  timer.unref();
}
export function stopNutritionWorker(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
