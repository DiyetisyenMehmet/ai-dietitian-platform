import { NOTIFICATION_PREFERENCES } from "./types";

export const NOTIFICATION_DETAILS = {
  meals: { key: "mealReminders", kind: "plan", title: "Öğün hatırlatmaları" },
  activity: {
    key: "activityReminders",
    kind: "daily",
    title: "Aktivite hatırlatmaları",
    timeField: "activityReminderTime",
  },
  sleep: {
    key: "sleepReminders",
    kind: "daily",
    title: "Uyku hazırlığı",
    timeField: "sleepReminderTime",
  },
  weekly: {
    key: "weeklySummary",
    kind: "weekly",
    title: "Haftalık özet",
    timeField: "weeklySummaryTime",
  },
  coach: { key: "coachTips", kind: "event", title: "Diewish Koç bildirimleri" },
} as const;

export type NotificationDetailSlug = keyof typeof NOTIFICATION_DETAILS;
export function isNotificationDetailSlug(value: string): value is NotificationDetailSlug {
  return Object.hasOwn(NOTIFICATION_DETAILS, value);
}
export function notificationDetailHref(key: string): string {
  if (key === "waterReminders") return "/profile/notifications/water";
  const entry = Object.entries(NOTIFICATION_DETAILS).find(([, item]) => item.key === key);
  return entry ? `/profile/notifications/${entry[0]}` : "/profile/notifications";
}
export function notificationDetailMeta(slug: NotificationDetailSlug) {
  return NOTIFICATION_PREFERENCES.find((item) => item.key === NOTIFICATION_DETAILS[slug].key)!;
}
