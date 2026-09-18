const SAFE_NOTIFICATION_TARGETS = new Set([
  "/dashboard",
  "/ai",
  "/insights",
  "/goals",
  "/meals",
  "/activity",
  "/sleep",
  "/progress",
  "/profile/blood-tests",
  "/profile/notifications",
]);

export function resolveNotificationTypeTarget(type: string | null | undefined): string {
  switch (type?.trim()) {
    case "PROACTIVE_MESSAGE":
      return "/ai";
    case "WEEKLY_REVIEW":
    case "MONTHLY_REVIEW":
    case "RISK_ALERT":
      return "/insights";
    case "GOAL_REMINDER":
      return "/goals";
    case "WATER_REMINDER":
      return "/dashboard";
    default:
      return "/dashboard";
  }
}

export interface WellnessPreferenceLike {
  waterReminders: boolean;
  activityReminders: boolean;
  sleepReminders: boolean;
  waterReminderTime: string;
  activityReminderTime: string;
  sleepReminderTime: string;
}

export interface WellnessReminderEntry {
  id: string;
  at: number;
  type: "water" | "activity" | "sleep";
}

function dateAt(base: Date, time: string): Date {
  const [hour, minute] = time.split(":").map(Number);
  const result = new Date(base);
  result.setHours(hour, minute, 0, 0);
  return result;
}

/** Builds a 30-day local schedule. Weekly summaries are intentionally remote-only. */
export function buildWellnessReminderSchedule(
  preferences: WellnessPreferenceLike,
  now: Date = new Date(),
): WellnessReminderEntry[] {
  const schedule: WellnessReminderEntry[] = [];
  for (let day = 0; day < 30; day += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + day);
    const add = (
      enabled: boolean,
      time: string,
      type: WellnessReminderEntry["type"],
    ) => {
      if (!enabled) return;
      const at = dateAt(date, time);
      if (at.getTime() > now.getTime()) {
        schedule.push({ id: `${type}-${at.toISOString()}`, at: at.getTime(), type });
      }
    };
    add(preferences.waterReminders, preferences.waterReminderTime, "water");
    add(preferences.activityReminders, preferences.activityReminderTime, "activity");
    add(preferences.sleepReminders, preferences.sleepReminderTime, "sleep");
  }
  return schedule;
}

/** Stable idempotency key: any token rotation or account switch changes it. */
export function notificationRegistrationKey(userId: string, token: string): string {
  const cleanUserId = userId.trim();
  const cleanToken = token.trim();
  return cleanUserId && cleanToken ? `${cleanUserId}:${cleanToken}` : "";
}

/**
 * Returns null while auth/onboarding is not ready, deliberately preserving the
 * native pending target for a later authenticated pass. Unknown targets fail
 * closed to dashboard rather than allowing arbitrary URLs or paths.
 */
export function resolvePendingNotificationTarget(
  raw: string | null | undefined,
  canNavigate: boolean,
): string | null {
  if (!canNavigate) return null;
  const target = raw?.trim() ?? "";
  if (!target) return null;
  return SAFE_NOTIFICATION_TARGETS.has(target) ? target : "/dashboard";
}

/**
 * Releases server ownership before native cleanup. Cleanup still runs when the
 * network/API unregister fails so an old account cannot keep a usable token on
 * the device indefinitely.
 */
export async function releaseNotificationDevice(
  token: string,
  unregister: (token: string) => Promise<unknown>,
  cleanup: () => void | Promise<void>,
): Promise<void> {
  const cleanToken = token.trim();
  if (cleanToken) {
    try {
      await unregister(cleanToken);
    } catch {
      // Native invalidation below remains mandatory even if the API is offline.
    }
  }
  try {
    await cleanup();
  } catch {
    // Optional native cleanup must never block account logout.
  }
}
