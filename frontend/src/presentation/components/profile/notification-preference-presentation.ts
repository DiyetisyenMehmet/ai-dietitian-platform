import type { NotificationPreferences } from "@/domain/account/types";

export const DISPLAY_NOTIFICATION_PREFERENCE_KEYS = [
  "mealReminders",
  "waterReminders",
  "activityReminders",
  "sleepReminders",
  "weeklySummary",
  "coachTips",
] as const;

export type DisplayNotificationPreferenceKey =
  (typeof DISPLAY_NOTIFICATION_PREFERENCE_KEYS)[number];

const WEEKDAY_LABELS = [
  "Pazar",
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
] as const;

export function notificationProgramSummary(
  key: DisplayNotificationPreferenceKey,
  preferences: NotificationPreferences,
): string {
  switch (key) {
    case "mealReminders":
      return "Öğün planındaki saatlere göre";
    case "waterReminders":
      return `Her gün · ${preferences.waterReminderTime}`;
    case "activityReminders":
      return `Her gün · ${preferences.activityReminderTime}`;
    case "sleepReminders":
      return `Her gün · ${preferences.sleepReminderTime}`;
    case "weeklySummary": {
      const day = WEEKDAY_LABELS[preferences.weeklySummaryDay] ?? "Bilgi yok";
      return `${day} · ${preferences.weeklySummaryTime}`;
    }
    case "coachTips":
      return "Özel saat ayarı yok";
  }
}
