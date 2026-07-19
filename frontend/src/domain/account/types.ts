/**
 * Account-management domain types: local user preferences that live on the
 * client (avatar + notification toggles). These are UX-layer settings backed by
 * localStorage in V1; the shapes are backend-ready for a future settings API.
 */

/** Toggleable notification/reminder preferences. */
export interface NotificationPreferences {
  mealReminders: boolean;
  waterReminders: boolean;
  weeklySummary: boolean;
  coachTips: boolean;
  bloodTestReminders: boolean;
  productUpdates: boolean;
}

/** A single notification preference definition for rendering the settings UI. */
export interface NotificationPreferenceMeta {
  key: keyof NotificationPreferences;
  label: string;
  description: string;
}

/** Default notification preferences (opt-in to the helpful ones). */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  mealReminders: true,
  waterReminders: true,
  weeklySummary: true,
  coachTips: true,
  bloodTestReminders: true,
  productUpdates: false,
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
    key: "weeklySummary",
    label: "Haftalık özet",
    description: "Her hafta ilerlemeni ve koç yorumunu özetleyelim.",
  },
  {
    key: "coachTips",
    label: "Koç önerileri",
    description: "Sağlığına özel proaktif koç tavsiyeleri al.",
  },
  {
    key: "bloodTestReminders",
    label: "Kan tahlili hatırlatmaları",
    description: "Kontrol zamanı geldiğinde tahlil yüklemeni hatırlatalım.",
  },
  {
    key: "productUpdates",
    label: "Ürün güncellemeleri",
    description: "Yeni özellikler ve duyurulardan haberdar ol.",
  },
] as const;
