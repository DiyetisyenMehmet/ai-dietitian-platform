import {
  effectiveWaterTimes,
  isWaterReminderSchedule,
} from "../../domain/account/water-reminder-plan";

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

export interface NotificationCenterServerRecord {
  id: string;
  type: string;
  title: string;
  body: string;
  scheduledFor: string;
  deliveredAt: string | null;
  readAt: string | null;
}

export interface NotificationCenterNativeRecord {
  id: string;
  serverId?: string | null;
  title: string;
  body: string;
  target: string;
  occurredAt: number;
  readAt?: number | null;
}

export interface NotificationCenterItem {
  key: string;
  serverId?: string;
  nativeId?: string;
  title: string;
  body: string;
  target: string;
  occurredAt: string;
  read: boolean;
}

export function mergeNotificationCenterItems(
  serverRecords: NotificationCenterServerRecord[],
  nativeRecords: NotificationCenterNativeRecord[],
): NotificationCenterItem[] {
  const items: NotificationCenterItem[] = serverRecords.map((record) => ({
    key: `server:${record.id}`,
    serverId: record.id,
    title: record.title,
    body: record.body,
    target: resolveNotificationTypeTarget(record.type),
    occurredAt: record.deliveredAt ?? record.scheduledFor,
    read: Boolean(record.readAt),
  }));
  const byServerId = new Map(
    items
      .filter((item): item is NotificationCenterItem & { serverId: string } =>
        Boolean(item.serverId),
      )
      .map((item) => [item.serverId, item]),
  );

  for (const record of nativeRecords) {
    const target = resolvePendingNotificationTarget(record.target, true) ?? "/dashboard";
    const duplicate = record.serverId ? byServerId.get(record.serverId) : undefined;
    if (duplicate) {
      duplicate.nativeId = record.id;
      duplicate.read = duplicate.read || Boolean(record.readAt);
      continue;
    }

    items.push({
      key: `native:${record.id}`,
      nativeId: record.id,
      serverId: record.serverId || undefined,
      title: record.title,
      body: record.body,
      target,
      occurredAt: new Date(record.occurredAt).toISOString(),
      read: Boolean(record.readAt),
    });
  }

  return items.sort(
    (left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime(),
  );
}

export interface WellnessPreferenceLike {
  waterReminders: boolean;
  activityReminders: boolean;
  sleepReminders: boolean;
  waterReminderTime: string;
  waterReminderSchedule?: unknown;
  activityReminderTime: string;
  sleepReminderTime: string;
}

export interface WellnessReminderEntry {
  id: string;
  at: number;
  type: "water" | "activity" | "sleep";
  /** Device-only weekly recurrence seed; never an account preference. */
  repeatDays?: 7;
}

function dateAt(base: Date, time: string): Date {
  const [hour, minute] = time.split(":").map(Number);
  const result = new Date(base);
  result.setHours(hour, minute, 0, 0);
  return result;
}

// Device budget belongs to the existing Android adapter, never the account model.
const ANDROID_WATER_WINDOW_DAYS = 7;

/** Materializes the existing Android bridge's queue. Eight daily water times
 * over seven rolling days (56), plus unchanged activity/sleep entries (60),
 * fit below its 128-entry cap. Water seeds renew in the same native scheduler.
 * Legacy water retains its 30-day behavior. */
export function buildAndroidWellnessReminderSchedule(
  preferences: WellnessPreferenceLike,
  now: Date = new Date(),
): WellnessReminderEntry[] {
  const schedule: WellnessReminderEntry[] = [];
  const waterWindowEnd = new Date(now);
  waterWindowEnd.setDate(now.getDate() + ANDROID_WATER_WINDOW_DAYS);
  for (let day = 0; day < 30; day += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + day);
    const add = (enabled: boolean, time: string, type: WellnessReminderEntry["type"]) => {
      if (!enabled) return;
      const at = dateAt(date, time);
      if (at.getTime() > now.getTime()) {
        schedule.push({ id: `${type}-${at.toISOString()}`, at: at.getTime(), type });
      }
    };
    if (preferences.waterReminderSchedule == null) {
      add(preferences.waterReminders, preferences.waterReminderTime, "water");
    } else if (
      day <= ANDROID_WATER_WINDOW_DAYS &&
      isWaterReminderSchedule(preferences.waterReminderSchedule)
    ) {
      for (const time of effectiveWaterTimes(preferences.waterReminderSchedule, date.getDay())) {
        const at = dateAt(date, time);
        if (preferences.waterReminders && at.getTime() > now.getTime() && at <= waterWindowEnd) {
          schedule.push({
            id: `water-${at.toISOString()}`,
            at: at.getTime(),
            type: "water",
            repeatDays: 7,
          });
        }
      }
    }
    add(preferences.activityReminders, preferences.activityReminderTime, "activity");
    add(preferences.sleepReminders, preferences.sleepReminderTime, "sleep");
  }
  return schedule.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
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
