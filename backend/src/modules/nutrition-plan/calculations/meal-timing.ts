/**
 * Deterministic meal-timing engine.
 *
 * Meal times are derived from the user's usual wake/sleep rhythm when those
 * profile fields are available. AI never decides these clock times. Existing
 * users without rhythm data keep the established fixed schedule as a backwards-
 * compatible fallback. A recurring hunger pattern may nudge only a snack slot,
 * and only while minimum meal gaps remain intact.
 */

import type { MealSlot, MealTimingRecommendation, WeightGoal } from "../types";

interface DailyRhythm {
  usualWakeTime?: string | null;
  usualSleepTime?: string | null;
  /** Evidence-backed recurring hunger time, never a one-off user event. */
  preferredSnackTime?: string | null;
}

/** Established fallback used for profiles created before sleep/wake capture. */
const STANDARD_FALLBACK: MealSlot[] = [
  { name: "Breakfast", time: "08:00", calorieShare: 0.3 },
  { name: "Lunch", time: "13:00", calorieShare: 0.35 },
  { name: "Snack", time: "16:30", calorieShare: 0.1 },
  { name: "Dinner", time: "19:30", calorieShare: 0.25 },
];

const GAIN_FALLBACK: MealSlot[] = [
  { name: "Breakfast", time: "08:00", calorieShare: 0.25 },
  { name: "Morning Snack", time: "10:30", calorieShare: 0.1 },
  { name: "Lunch", time: "13:00", calorieShare: 0.3 },
  { name: "Afternoon Snack", time: "16:30", calorieShare: 0.1 },
  { name: "Dinner", time: "19:30", calorieShare: 0.25 },
];

const STANDARD_TEMPLATE: Omit<MealSlot, "time">[] = [
  { name: "Breakfast", calorieShare: 0.3 },
  { name: "Lunch", calorieShare: 0.35 },
  { name: "Snack", calorieShare: 0.1 },
  { name: "Dinner", calorieShare: 0.25 },
];

const GAIN_TEMPLATE: Omit<MealSlot, "time">[] = [
  { name: "Breakfast", calorieShare: 0.25 },
  { name: "Morning Snack", calorieShare: 0.1 },
  { name: "Lunch", calorieShare: 0.3 },
  { name: "Afternoon Snack", calorieShare: 0.1 },
  { name: "Dinner", calorieShare: 0.25 },
];

function parseClock(value?: string | null): number | null {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatClock(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function roundToFiveMinutes(value: number): number {
  return Math.round(value / 5) * 5;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Builds monotonically increasing meal times inside the user's waking window.
 * The first meal lands roughly 45-90 minutes after waking and the final meal
 * roughly 2-3 hours before usual sleep. Interior meals are evenly distributed.
 */
function personalizedTimes(slotCount: number, rhythm: DailyRhythm): string[] | null {
  const wake = parseClock(rhythm.usualWakeTime);
  const sleepClock = parseClock(rhythm.usualSleepTime);
  if (wake === null || sleepClock === null) return null;

  let sleep = sleepClock;
  while (sleep <= wake) sleep += 1440;
  const wakingWindow = sleep - wake;

  // Reject implausibly short/long waking windows as bad profile data and keep
  // the established fallback rather than inventing unsafe or overlapping times.
  if (wakingWindow < 8 * 60 || wakingWindow > 22 * 60) return null;

  const firstOffset = clamp(Math.round(wakingWindow * 0.08), 45, 90);
  const lastLead = clamp(Math.round(wakingWindow * 0.14), 120, 180);
  let first = wake + firstOffset;
  let last = sleep - lastLead;

  const minimumGap = 120;
  const requiredSpan = minimumGap * (slotCount - 1);
  if (last - first < requiredSpan) {
    first = wake + 30;
    last = sleep - 60;
  }
  if (last - first < requiredSpan) return null;

  const step = (last - first) / (slotCount - 1);
  return Array.from({ length: slotCount }, (_, index) =>
    formatClock(roundToFiveMinutes(first + step * index)),
  );
}

function timelineMinutes(slots: MealSlot[]): number[] | null {
  let dayOffset = 0;
  let previous = -1;
  const result: number[] = [];
  for (const slot of slots) {
    const clock = parseClock(slot.time);
    if (clock === null) return null;
    let minute = clock + dayOffset;
    if (minute <= previous) {
      dayOffset += 1440;
      minute = clock + dayOffset;
    }
    result.push(minute);
    previous = minute;
  }
  return result;
}

/**
 * Nudges only an existing snack slot toward a recurring hunger window. It never
 * adds meals or calories and keeps at least two hours between neighbouring meals.
 */
function applyRecurringHungerTiming(slots: MealSlot[], preferredTime?: string | null): MealSlot[] {
  const preferredClock = parseClock(preferredTime);
  const timeline = timelineMinutes(slots);
  if (preferredClock === null || !timeline || timeline.length < 3) return slots;

  let preferred = preferredClock;
  while (preferred < timeline[0]) preferred += 1440;
  if (preferred > timeline[timeline.length - 1]) return slots;

  const snackIndexes = slots
    .map((slot, index) => (/snack|ara\s*öğün/i.test(slot.name) ? index : -1))
    .filter((index) => index > 0 && index < slots.length - 1);
  if (!snackIndexes.length) return slots;

  const snackIndex = snackIndexes.sort(
    (a, b) => Math.abs(timeline[a] - preferred) - Math.abs(timeline[b] - preferred),
  )[0];
  const min = timeline[snackIndex - 1] + 120;
  const max = timeline[snackIndex + 1] - 120;
  if (min > max) return slots;

  const adaptedMinute = roundToFiveMinutes(clamp(preferred, min, max));
  return slots.map((slot, index) =>
    index === snackIndex ? { ...slot, time: formatClock(adaptedMinute) } : slot,
  );
}

/** Resolves deterministic meal timing from goal + optional daily rhythm/adaptation. */
export function calculateMealTiming(
  goal: WeightGoal,
  rhythm: DailyRhythm = {},
): MealTimingRecommendation {
  const template = goal === "GAIN_WEIGHT" ? GAIN_TEMPLATE : STANDARD_TEMPLATE;
  const fallback = goal === "GAIN_WEIGHT" ? GAIN_FALLBACK : STANDARD_FALLBACK;
  const times = personalizedTimes(template.length, rhythm);

  const baseSlots = times
    ? template.map((slot, index) => ({ ...slot, time: times[index] }))
    : fallback.map((slot) => ({ ...slot }));
  const slots = applyRecurringHungerTiming(baseSlots, rhythm.preferredSnackTime);

  return { mealsPerDay: slots.length, slots };
}
