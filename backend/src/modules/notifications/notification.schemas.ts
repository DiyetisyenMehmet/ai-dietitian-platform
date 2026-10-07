import { z } from "zod";

const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected a 24-hour HH:MM time.");
export const MAX_WATER_TIMES_PER_DAY = 8;
const waterTimes = z
  .array(localTime)
  .max(MAX_WATER_TIMES_PER_DAY)
  .refine(
    (times) => new Set(times).size === times.length,
    "Duplicate reminder times are not allowed.",
  )
  .transform((times) => [...times].sort());
export const waterReminderScheduleSchema = z
  .object({
    version: z.literal(1),
    mode: z.enum(["same", "custom"]),
    dailyTimes: waterTimes,
    days: z
      .array(
        z
          .object({ day: z.number().int().min(0).max(6), enabled: z.boolean(), times: waterTimes })
          .strict(),
      )
      .length(7)
      .refine(
        (days) => new Set(days.map((day) => day.day)).size === 7,
        "Every week day must appear exactly once.",
      )
      .transform((days) => [...days].sort((a, b) => a.day - b.day)),
  })
  .strict();
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
    waterReminderSchedule: waterReminderScheduleSchema.optional(),
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

export const notificationIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type UpdateNotificationPreferencesInput = z.infer<
  typeof updateNotificationPreferencesSchema
>;
export type RegisterNotificationDeviceInput = z.infer<typeof registerNotificationDeviceSchema>;
export type UnregisterNotificationDeviceInput = z.infer<typeof unregisterNotificationDeviceSchema>;
