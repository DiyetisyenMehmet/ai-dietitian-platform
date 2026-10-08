export const ALERT_CATEGORIES = ["meals", "water", "activity", "sleep", "weekly", "coach"] as const;
export type AlertCategory = (typeof ALERT_CATEGORIES)[number];
export const SOUND_PRESETS = [
  { id: "silent", label: "Sessiz" },
  { id: "system", label: "Sistem varsayılanı" },
  { id: "diewish_drop", label: "Diewish · Damla", asset: "/audio/diewish_drop.wav" },
  { id: "diewish_gentle", label: "Diewish · Nazik", asset: "/audio/diewish_gentle.wav" },
] as const;
export const VIBRATION_PRESETS = [
  { id: "off", label: "Kapalı" },
  { id: "short", label: "Kısa" },
  { id: "double_short", label: "Çift kısa" },
  { id: "long", label: "Uzun" },
  { id: "short_long", label: "Kısa - Uzun" },
] as const;
export type SoundPreset = (typeof SOUND_PRESETS)[number]["id"];
export type VibrationPreset = (typeof VIBRATION_PRESETS)[number]["id"];
export interface NotificationAlertPreference {
  soundPreset: SoundPreset;
  vibrationPreset: VibrationPreset;
}
export type CategoryAlertPreferences = Partial<Record<AlertCategory, NotificationAlertPreference>>;
export const DEFAULT_ALERT: NotificationAlertPreference = {
  soundPreset: "system",
  vibrationPreset: "off",
};
export function alertForCategory(
  value: unknown,
  category: AlertCategory,
): NotificationAlertPreference {
  const raw =
    value && typeof value === "object" ? (value as Record<string, unknown>)[category] : null;
  const entry = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    soundPreset: SOUND_PRESETS.some((p) => p.id === entry.soundPreset)
      ? (entry.soundPreset as SoundPreset)
      : DEFAULT_ALERT.soundPreset,
    vibrationPreset: VIBRATION_PRESETS.some((p) => p.id === entry.vibrationPreset)
      ? (entry.vibrationPreset as VibrationPreset)
      : DEFAULT_ALERT.vibrationPreset,
  };
}
export function alertCategoryForPreference(key: string): AlertCategory | null {
  return (
    (
      {
        mealReminders: "meals",
        waterReminders: "water",
        activityReminders: "activity",
        sleepReminders: "sleep",
        weeklySummary: "weekly",
        coachTips: "coach",
      } as Record<string, AlertCategory>
    )[key] ?? null
  );
}
