import type { WellnessPreferenceLike } from "./notification-lifecycle";
import { buildAndroidWellnessReminderSchedule } from "./notification-lifecycle";

/** Apply the shared generator to the existing Android bridge, without creating
 * another scheduler or requesting permission during preference loading. */
export function syncWellnessReminderSchedule(preferences: WellnessPreferenceLike): void {
  if (typeof window === "undefined") return;
  try {
    const native = (
      window as unknown as {
        DiewishReminders?: {
          isAvailable?: () => boolean;
          replaceWellnessSchedule?: (schedule: string) => number;
          cancelWellness?: () => void;
        };
      }
    ).DiewishReminders;
    if (
      !native?.isAvailable?.() ||
      typeof native.replaceWellnessSchedule !== "function" ||
      typeof native.cancelWellness !== "function"
    )
      return;
    const schedule = buildAndroidWellnessReminderSchedule(preferences);
    if (schedule.length) native.replaceWellnessSchedule(JSON.stringify(schedule));
    else native.cancelWellness();
  } catch {
    // Older/partial JavaScriptInterface proxies must not crash account settings.
  }
}
