/**
 * Shared, dependency-free helpers for the AI Health Coach (Sprint 19).
 *
 * Covers time/date math (ISO week numbers, Turkey-local day bucketing) and small
 * statistical utilities used across the memory, review, risk and adaptation
 * services. Kept pure so it can be imported anywhere without cycles.
 */

/** Turkey is UTC+3 year-round (no DST since 2016). */
export const TURKEY_UTC_OFFSET_MINUTES = 180;

/** Milliseconds in one day. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** A Date `days` days before `from` (defaults to now). */
export function daysAgo(days: number, from: Date = new Date()): Date {
  return new Date(from.getTime() - days * DAY_MS);
}

/** Whole days between two instants (a - b), floored. */
export function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / DAY_MS);
}

/** The equivalent wall-clock Date in Turkey local time. */
export function toTurkeyTime(date: Date = new Date()): Date {
  return new Date(date.getTime() + TURKEY_UTC_OFFSET_MINUTES * 60 * 1000);
}

/**
 * A stable `YYYY-MM-DD` day key in Turkey local time, used to bucket logs into
 * distinct calendar days for consistency scoring.
 */
export function turkeyDayKey(date: Date): string {
  return toTurkeyTime(date).toISOString().slice(0, 10);
}

/**
 * ISO-8601 week number and its ISO week-year for a date. Weeks start Monday and
 * week 1 contains the year's first Thursday, matching how weekly reviews are
 * keyed by (weekNumber, year).
 */
export function getIsoWeek(date: Date = new Date()): { weekNumber: number; year: number } {
  // Work on a UTC copy shifted to the ISO week's Thursday.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return { weekNumber, year: d.getUTCFullYear() };
}

/** The Monday 00:00 UTC and following Monday for a given ISO (week, year). */
export function isoWeekRange(weekNumber: number, year: number): { start: Date; end: Date } {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const week1Monday = new Date(jan4.getTime() - (jan4Day - 1) * DAY_MS);
  const start = new Date(week1Monday.getTime() + (weekNumber - 1) * 7 * DAY_MS);
  const end = new Date(start.getTime() + 7 * DAY_MS);
  return { start, end };
}

/** First and last instant of a calendar month (UTC). `month` is 1-12. */
export function monthRange(month: number, year: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

/** Arithmetic mean, or 0 for an empty list. */
export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Sum of a list. */
export function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

/** Clamps a number into the inclusive [min, max] range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Rounds to a whole number, clamped to [0, 100] — used for 0-100 scores. */
export function toScore(value: number): number {
  return Math.round(clamp(value, 0, 100));
}

/** Groups items by a string key derived from each item. */
export function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}
