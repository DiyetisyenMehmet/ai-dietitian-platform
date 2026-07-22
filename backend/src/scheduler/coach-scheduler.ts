import { logger } from "../lib/logger";
import { coachJobs } from "../modules/ai-coach/coach-jobs";
import { toTurkeyTime } from "../modules/ai-coach/metrics";

/**
 * Lightweight in-process scheduler for the AI Health Coach (Sprint 19).
 *
 * The codebase does not use a job framework, so rather than add a dependency
 * (e.g. @nestjs/schedule / node-cron) this schedules work with a single
 * `setInterval` tick and fires jobs when the current Turkey-local wall clock
 * enters the target slot. A per-slot "last run day" guard makes each job run at
 * most once per calendar day even though the tick fires several times an hour.
 *
 * Slots (Turkey local time, UTC+3):
 *   - Daily   20:00  → proactive nudges + derived-memory refresh
 *   - Sunday  21:00  → weekly reviews
 *   - 1st     08:00  → monthly reviews (premium users)
 *   - Every tick     → dispatch due notifications
 *
 * Times need not be exact — the job runs on the first tick within the target
 * hour. The scheduler is best-effort and never throws into the event loop.
 */

/** How often the scheduler wakes up to evaluate slots. */
const TICK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** Tracks the last Turkey day-key each named slot ran, to de-duplicate. */
const lastRun: Record<string, string> = {};

let timer: NodeJS.Timeout | null = null;
let running = false;

/** A stable `YYYY-MM-DD` key for a Turkey-local date. */
function dayKey(turkeyNow: Date): string {
  return turkeyNow.toISOString().slice(0, 10);
}

/** Runs a job once per day for the given slot key, guarding re-entrancy. */
async function runOncePerDay(
  slot: string,
  turkeyNow: Date,
  job: () => Promise<void>,
): Promise<void> {
  const key = dayKey(turkeyNow);
  if (lastRun[slot] === key) return;
  lastRun[slot] = key;
  try {
    await job();
  } catch (error) {
    logger.error({ err: error, slot }, "Coach scheduler job failed");
  }
}

/** Evaluates all slots for the current instant. Exported for testing. */
export async function tick(now: Date = new Date()): Promise<void> {
  const turkeyNow = toTurkeyTime(now);
  const hour = turkeyNow.getUTCHours();
  const dayOfWeek = turkeyNow.getUTCDay(); // 0 = Sunday
  const dayOfMonth = turkeyNow.getUTCDate();

  // Always attempt to flush due notifications.
  try {
    await coachJobs.dispatchNotifications();
  } catch (error) {
    logger.warn({ err: error }, "Notification dispatch tick failed");
  }

  // Daily proactive nudges at 20:00.
  if (hour === 20) {
    await runOncePerDay("daily-proactive", turkeyNow, () => coachJobs.runDailyProactive());
  }

  // Weekly reviews on Sunday at 21:00.
  if (dayOfWeek === 0 && hour === 21) {
    await runOncePerDay("weekly-review", turkeyNow, () => coachJobs.runWeeklyReviews());
  }

  // Monthly reviews on the 1st at 08:00.
  if (dayOfMonth === 1 && hour === 8) {
    await runOncePerDay("monthly-review", turkeyNow, () => coachJobs.runMonthlyReviews());
  }
}

/** Starts the scheduler. Idempotent; a no-op if already started. */
export function startCoachScheduler(): void {
  if (timer) return;
  running = true;
  logger.info({ tickIntervalMs: TICK_INTERVAL_MS }, "AI Health Coach scheduler started");
  timer = setInterval(() => {
    if (!running) return;
    void tick();
  }, TICK_INTERVAL_MS);
  // Do not keep the process alive solely for the scheduler.
  timer.unref?.();
}

/** Stops the scheduler (used in shutdown/tests). */
export function stopCoachScheduler(): void {
  running = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
