import type { WeightEntry } from "@/domain/health/types";

export const WEIGHT_MIN_KG = 25;
export const WEIGHT_MAX_KG = 400;
const DAY_MS = 86_400_000;

export interface WeightEntryTiming {
  loggedAt?: string;
  createdAt?: string;
}

/** Parses Turkish/English decimal input without silently rounding extra precision. */
export function parseWeightInput(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d)?$/.test(normalized)) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < WEIGHT_MIN_KG || parsed > WEIGHT_MAX_KG) {
    return null;
  }
  return parsed;
}

export function isValidWeightKg(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= WEIGHT_MIN_KG &&
    value <= WEIGHT_MAX_KG &&
    Math.abs(value * 10 - Math.round(value * 10)) < 1e-8
  );
}

export function formatWeightNumber(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

/** YYYY-MM-DD in the user's local calendar, not UTC. */
export function localDateKey(value: Date = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Converts a date-only field to local noon so timezone conversion cannot shift its calendar day. */
export function dateKeyToLocalNoon(dateKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const value = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    value.getFullYear() !== year ||
    value.getMonth() !== month - 1 ||
    value.getDate() !== day
  ) {
    return null;
  }
  return value;
}

export function localDateKeyFromIso(iso: string): string {
  const value = new Date(iso);
  return Number.isFinite(value.getTime()) ? localDateKey(value) : iso.slice(0, 10);
}

export function weightEntryTimestamp(entry: WeightEntry): number {
  const timed = entry as WeightEntry & WeightEntryTiming;
  if (timed.loggedAt) {
    const timestamp = new Date(timed.loggedAt).getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }

  return dateKeyToLocalNoon(entry.date)?.getTime() ?? 0;
}

function createdAtTimestamp(entry: WeightEntry): number {
  const timed = entry as WeightEntry & WeightEntryTiming;
  if (!timed.createdAt) return 0;
  const timestamp = new Date(timed.createdAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/** Stable chronological ordering: loggedAt -> createdAt -> id. */
export function sortWeightEntries(list: WeightEntry[]): WeightEntry[] {
  return [...list].sort((a, b) => {
    const byLoggedAt = weightEntryTimestamp(a) - weightEntryTimestamp(b);
    if (byLoggedAt !== 0) return byLoggedAt;

    const byCreatedAt = createdAtTimestamp(a) - createdAtTimestamp(b);
    if (byCreatedAt !== 0) return byCreatedAt;

    return a.id.localeCompare(b.id);
  });
}

function utcDayNumber(dateKey: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(timestamp) ? Math.floor(timestamp / DAY_MS) : null;
}

/** Calendar-day span avoids DST/UTC rollover errors in trend semantics. */
export function calendarDaySpan(from: WeightEntry, to: WeightEntry): number {
  const start = utcDayNumber(from.date);
  const end = utcDayNumber(to.date);
  if (start === null || end === null) return 0;
  return Math.max(0, end - start);
}
