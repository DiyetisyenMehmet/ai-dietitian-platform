import { z } from "zod";

const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected a 24-hour HH:MM time.");
const pushToken = z
  .string()
  .trim()
  .min(20)
  .max(4096)
  .regex(/^\S+$/, "Push token cannot contain whitespace.");

export const updateNotificationPreferencesSchema = z
  .object({
    mealReminders: z.boolean().optional(),
    waterReminders: z.boolean().optional(),
    activityReminders: z.boolean().optional(),
    sleepReminders: z.boolean().optional(),
    weeklySummary: z.boolean().optional(),
    coachTips: z.boolean().optional(),
    bloodTestReminders: z.boolean().optional(),
    productUpdates: z.boolean().optional(),
    waterReminderTime: localTime.optional(),
    activityReminderTime: localTime.optional(),
    sleepReminderTime: localTime.optional(),
    weeklySummaryDay: z.number().int().min(0).max(6).optional(),
    weeklySummaryTime: localTime.optional(),
    timezoneOffsetMinutes: z.number().int().min(-840).max(840).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one preference must be supplied.");

export const registerNotificationDeviceSchema = z.object({
  token: pushToken,
  platform: z.enum(["android", "web"]).default("android"),
  appVersion: z.string().trim().min(1).max(64).optional(),
});

export const unregisterNotificationDeviceSchema = z.object({
  token: pushToken,
});

export type UpdateNotificationPreferencesInput = z.infer<
  typeof updateNotificationPreferencesSchema
>;
export type RegisterNotificationDeviceInput = z.infer<typeof registerNotificationDeviceSchema>;
export type UnregisterNotificationDeviceInput = z.infer<typeof unregisterNotificationDeviceSchema>;
