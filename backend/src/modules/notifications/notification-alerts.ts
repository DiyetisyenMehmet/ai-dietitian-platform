import { z } from "zod";

export const ALERT_CATEGORIES = ["meals", "water", "activity", "sleep", "weekly", "coach"] as const;
export type AlertCategory = (typeof ALERT_CATEGORIES)[number];
export const notificationAlertSchema = z
  .object({
    soundPreset: z.enum(["silent", "system", "diewish_drop", "diewish_gentle"]),
    vibrationPreset: z.enum(["off", "short", "double_short", "long", "short_long"]),
  })
  .strict();
export type NotificationAlertPreference = z.infer<typeof notificationAlertSchema>;
export const categoryAlertsSchema = z
  .object({
    meals: notificationAlertSchema.optional(),
    water: notificationAlertSchema.optional(),
    activity: notificationAlertSchema.optional(),
    sleep: notificationAlertSchema.optional(),
    weekly: notificationAlertSchema.optional(),
    coach: notificationAlertSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Supply at least one category.");
export function normalizedCategoryAlerts(
  value: unknown,
): Record<AlertCategory, NotificationAlertPreference> {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    ALERT_CATEGORIES.map((category) => {
      const entry = notificationAlertSchema.safeParse(raw[category]);
      return [
        category,
        entry.success ? entry.data : { soundPreset: "system", vibrationPreset: "off" },
      ];
    }),
  ) as Record<AlertCategory, NotificationAlertPreference>;
}
export function remoteCategory(type: string): AlertCategory | null {
  if (type === "WEEKLY_REVIEW" || type === "MONTHLY_REVIEW") return "weekly";
  if (["PROACTIVE_MESSAGE", "RISK_ALERT", "GOAL_REMINDER"].includes(type)) return "coach";
  return type === "WATER_REMINDER" ? "water" : null;
}
