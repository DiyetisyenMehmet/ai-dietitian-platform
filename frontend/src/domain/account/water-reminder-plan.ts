// Product limit for a manageable daily routine, independent of device queue limits.
export const MAX_WATER_TIMES_PER_DAY = 8;
export const WEEK_DAYS = [
  { day: 1, label: "Pazartesi", short: "Pzt" },
  { day: 2, label: "Salı", short: "Sal" },
  { day: 3, label: "Çarşamba", short: "Çar" },
  { day: 4, label: "Perşembe", short: "Per" },
  { day: 5, label: "Cuma", short: "Cum" },
  { day: 6, label: "Cumartesi", short: "Cmt" },
  { day: 0, label: "Pazar", short: "Paz" },
] as const;

export interface WaterReminderDay {
  day: number;
  enabled: boolean;
  times: string[];
}

export interface WaterReminderSchedule {
  version: 1;
  mode: "same" | "custom";
  dailyTimes: string[];
  days: WaterReminderDay[];
}

export function isReminderTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validTimes(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_WATER_TIMES_PER_DAY &&
    value.every(isReminderTime) &&
    new Set(value).size === value.length
  );
}

export function isWaterReminderSchedule(value: unknown): value is WaterReminderSchedule {
  if (!value || typeof value !== "object") return false;
  const plan = value as WaterReminderSchedule;
  return (
    plan.version === 1 &&
    (plan.mode === "same" || plan.mode === "custom") &&
    validTimes(plan.dailyTimes) &&
    Array.isArray(plan.days) &&
    plan.days.length === 7 &&
    new Set(plan.days.map((day) => day?.day)).size === 7 &&
    plan.days.every(
      (day) =>
        day &&
        Number.isInteger(day.day) &&
        day.day >= 0 &&
        day.day <= 6 &&
        typeof day.enabled === "boolean" &&
        validTimes(day.times),
    )
  );
}

/** Expands a legacy single time without changing the account until Save. */
export function waterReminderPlan(value: unknown, legacyTime: string): WaterReminderSchedule {
  if (isWaterReminderSchedule(value)) return cloneWaterPlan(value);
  const times = isReminderTime(legacyTime) ? [legacyTime] : [];
  return {
    version: 1,
    mode: "same",
    dailyTimes: times,
    days: WEEK_DAYS.map(({ day }) => ({ day, enabled: true, times: [...times] })),
  };
}

export function cloneWaterPlan(plan: WaterReminderSchedule): WaterReminderSchedule {
  return {
    // JSONB can reorder object keys; canonicalize them for saved/draft comparisons.
    version: plan.version,
    mode: plan.mode,
    dailyTimes: [...plan.dailyTimes].sort(),
    days: plan.days
      .map((day) => ({ day: day.day, enabled: day.enabled, times: [...day.times].sort() }))
      .sort((a, b) => a.day - b.day),
  };
}

export function effectiveWaterTimes(plan: WaterReminderSchedule, day: number): string[] {
  if (plan.mode === "same") return plan.dailyTimes;
  const entry = plan.days.find((entry) => entry.day === day);
  return entry?.enabled ? entry.times : [];
}

export function waterPlanSummary(plan: WaterReminderSchedule): string {
  if (plan.mode === "same")
    return plan.dailyTimes.length
      ? `Her gün · ${plan.dailyTimes.join(", ")}`
      : "Program boş · Saat ekle";
  const active = plan.days.filter((day) => day.enabled && day.times.length);
  if (!active.length) return "Program boş · Saat ekle";
  return `${active.length} gün · Haftada ${active.reduce((total, day) => total + day.times.length, 0)} hatırlatma`;
}

/** Copies only explicitly chosen target days, preserving inactive targets by default. */
export function copyWaterDay(
  plan: WaterReminderSchedule,
  sourceDay: number,
  targetDays: number[],
  includeClosed = false,
): WaterReminderSchedule {
  const next = cloneWaterPlan(plan);
  const source = next.days.find((day) => day.day === sourceDay);
  if (!source) return next;
  next.days = next.days.map((day) =>
    day.day !== sourceDay && targetDays.includes(day.day) && (includeClosed || day.enabled)
      ? { ...day, times: [...source.times], enabled: includeClosed ? true : day.enabled }
      : day,
  );
  return next;
}
