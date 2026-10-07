import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_WATER_TIMES_PER_DAY,
  updateNotificationPreferencesSchema,
  waterReminderScheduleSchema,
} from "./notification.schemas";

const plan = () => ({
  version: 1,
  mode: "custom",
  dailyTimes: ["14:00", "09:00"],
  days: Array.from({ length: 7 }, (_, day) => ({
    day,
    enabled: day !== 0,
    times: ["21:00", "09:00", "18:00", "14:00"],
  })),
});

test("water plans accept four times and canonicalize while preserving disabled days", () => {
  const parsed = waterReminderScheduleSchema.parse(plan());
  assert.equal(MAX_WATER_TIMES_PER_DAY, 8);
  assert.deepEqual(parsed.dailyTimes, ["09:00", "14:00"]);
  assert.deepEqual(parsed.days[0]?.times, ["09:00", "14:00", "18:00", "21:00"]);
  assert.equal(parsed.days[0]?.enabled, false);
  assert.equal(
    waterReminderScheduleSchema.safeParse({
      ...plan(),
      dailyTimes: Array.from(
        { length: 8 },
        (_, index) => `${String(index + 8).padStart(2, "0")}:00`,
      ),
    }).success,
    true,
  );
});

test("invalid or oversized weekly programs are rejected", () => {
  const value = plan();
  const invalid = [
    { ...value, version: 2 },
    { ...value, mode: "hourly" },
    { ...value, dailyTimes: ["25:00"] },
    { ...value, dailyTimes: ["09:00", "09:00"] },
    {
      ...value,
      dailyTimes: ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"],
    },
    { ...value, days: value.days.slice(1) },
    { ...value, days: [...value.days, value.days[0]] },
    { ...value, days: value.days.map((day) => ({ ...day, day: 1 })) },
    { ...value, days: value.days.map((day) => ({ ...day, times: ["09:00", "09:00"] })) },
    {
      ...value,
      days: value.days.map((day) => ({
        ...day,
        times: ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"],
      })),
    },
    { ...value, days: value.days.map((day) => ({ ...day, enabled: "yes" })) },
    { ...value, sound: "drop" },
    { ...value, days: value.days.map((day) => ({ ...day, sound: "drop" })) },
  ];
  for (const payload of invalid)
    assert.equal(waterReminderScheduleSchema.safeParse(payload).success, false);
});

test("empty hour sets are allowed for controlled clear, without changing day flags", () => {
  const value = plan();
  assert.equal(
    waterReminderScheduleSchema.safeParse({
      ...value,
      dailyTimes: [],
      days: value.days.map((day) => ({ ...day, times: [] })),
    }).success,
    true,
  );
});

test("the existing preferences endpoint validates new plans atomically and keeps legacy updates", () => {
  assert.equal(
    updateNotificationPreferencesSchema.safeParse({
      waterReminderSchedule: plan(),
      waterReminders: true,
    }).success,
    true,
  );
  assert.equal(
    updateNotificationPreferencesSchema.safeParse({
      waterReminderSchedule: { ...plan(), dailyTimes: ["bad"] },
      waterReminders: true,
    }).success,
    false,
  );
  assert.equal(
    updateNotificationPreferencesSchema.safeParse({ waterReminderTime: "13:55" }).success,
    true,
  );
  assert.equal(
    updateNotificationPreferencesSchema.safeParse({ coachTips: true, weeklySummaryTime: "12:00" })
      .success,
    true,
  );
});
