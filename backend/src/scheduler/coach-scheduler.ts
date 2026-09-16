import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { coachJobs } from "../modules/ai-coach/coach-jobs";
import { toTurkeyTime } from "../modules/ai-coach/metrics";

/**
 * Lightweight in-process scheduler for the AI Health Coach (Sprint 19).
 *
 * Every web instance evaluates the same slots, but recurring generation jobs
 * acquire a database-backed slot/day claim before running. This keeps staging
 * safe when Cloud Run scales above one instance. Notification dispatch itself
 * has a separate per-notification database lease in notification.service.ts.
 *
 * Slots (Turkey local time, UTC+3):
 *   - Daily   20:00  → proactive nudges + derived-memory refresh
 *   - Sunday  21:00  → weekly reviews
 *   - 1st     08:00  → monthly reviews (premium users)
 *   - Every tick     → dispatch due notifications
 */

/** How often the scheduler wakes up to evaluate slots. */
const TICK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** Process-local fast path; the database remains the cross-instance authority. */
const lastRun: Record<string, string> = {};

let timer: NodeJS.Timeout | null = null;
let running = false;

/** A stable `YYYY-MM-DD` key for a Turkey-local date. */
function dayKey(turkeyNow: Date): string {
  return turkeyNow.toISOString().slice(0, 10);
}

async function claimSchedulerRun(slot: string, key: string): Promise<boolean> {
  const inserted = await prisma.$executeRaw`
    INSERT INTO "scheduler_job_runs" ("slot", "dayKey", "createdAt")
    VALUES (${slot}, ${key}, CURRENT_TIMESTAMP)
    ON CONFLICT ("slot", "dayKey") DO NOTHING
  `;
  return inserted === 1;
}

/** Runs a job once per day globally across all backend instances. */
async function runOncePerDay(
  slot: string,
  turkeyNow: Date,
  job: () => Promise<void>,
): Promise<void> {
  const key = dayKey(turkeyNow);
  if (lastRun[slot] === key) return;

  try {
    const claimed = await claimSchedulerRun(slot, key);
    lastRun[slot] = key;
    if (!claimed) return;
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

  // Always attempt to flush due notifications. Per-notification DB leases make
  // this safe when multiple Cloud Run instances tick at the same time.
  try {
    await coachJobs.dispatchNotifications();
  } catch (error) {
    logger.warn({ err: error }, "Notification dispatch tick failed");
  }

  if (hour === 20) {
    await runOncePerDay("daily-proactive", turkeyNow, () => coachJobs.runDailyProactive());
  }

  if (dayOfWeek === 0 && hour === 21) {
    await runOncePerDay("weekly-review", turkeyNow, () => coachJobs.runWeeklyReviews());
  }

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
