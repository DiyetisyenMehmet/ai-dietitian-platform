/**
 * Account-management domain types: persisted notification preferences and
 * client-side account presentation state.
 */

/** Toggleable notification/reminder preferences. */
export interface NotificationPreferences {
  id?: string;
  userId?: string;
  mealReminders: boolean;
  waterReminders: boolean;
  activityReminders: boolean;
  sleepReminders: boolean;
  weeklySummary: boolean;
  coachTips: boolean;
  bloodTestReminders: boolean;
  productUpdates: boolean;
  waterReminderTime: string;
  activityReminderTime: string;
  sleepReminderTime: string;
  weeklySummaryDay: number;
  weeklySummaryTime: string;
  timezoneOffsetMinutes: number;
}

/** A single notification preference definition for rendering the settings UI. */
export interface NotificationPreferenceMeta {
  key:
    | "mealReminders"
    | "waterReminders"
    | "activityReminders"
    | "sleepReminders"
    | "weeklySummary"
    | "coachTips"
    | "bloodTestReminders"
    | "productUpdates";
  label: string;
  description: string;
}

/** Default notification preferences: every channel requires explicit opt-in. */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  mealReminders: false,
  waterReminders: false,
  activityReminders: false,
  sleepReminders: false,
  weeklySummary: false,
  coachTips: false,
  bloodTestReminders: false,
  productUpdates: false,
  waterReminderTime: "10:00",
  activityReminderTime: "18:00",
  sleepReminderTime: "22:30",
  weeklySummaryDay: 0,
  weeklySummaryTime: "10:00",
  timezoneOffsetMinutes: 0,
};

/** Ordered metadata for the notification preferences screen. */
export const NOTIFICATION_PREFERENCES: readonly NotificationPreferenceMeta[] = [
  {
    key: "mealReminders",
    label: "Öğün hatırlatmaları",
    description: "Öğünlerini kaydetmeyi unuttuğunda nazikçe hatırlatalım.",
  },
  {
    key: "waterReminders",
    label: "Su hatırlatmaları",
    description: "Gün içinde su hedefine ulaşman için hatırlatma gönderelim.",
  },
  {
    key: "activityReminders",
    label: "Aktivite hatırlatmaları",
    description: "Günlük hareket hedefini nazikçe hatırlatalım.",
  },
  {
    key: "sleepReminders",
    label: "Uyku hazırlığı",
    description: "Belirlediğin saatte uyku rutinine hazırlanmanı hatırlatalım.",
  },
  {
    key: "weeklySummary",
    label: "Haftalık özet",
    description: "Her hafta ilerlemeni ve koç yorumunu özetleyelim.",
  },
  {
    key: "coachTips",
    label: "Diewish koç bildirimleri",
    description: "Seçtiğin hedeflere göre önemli koç önerilerini telefona bildirelim.",
  },
] as const;
