export type DailyDataReadiness = "UNKNOWN" | "KNOWN_ZERO" | "KNOWN";

export function localDayKey(value: Date = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfLocalDay(value: Date = new Date()): Date {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function isIsoOnLocalDay(iso: string, dayKey: string): boolean {
  const value = new Date(iso);
  return Number.isFinite(value.getTime()) && localDayKey(value) === dayKey;
}

export function readinessFromCount(count: number): DailyDataReadiness {
  return count > 0 ? "KNOWN" : "KNOWN_ZERO";
}

function utcDayNumber(dayKey: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return null;
  const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 86_400_000) : null;
}

export function localCalendarDayDistance(fromDayKey: string, toDayKey: string): number | null {
  const from = utcDayNumber(fromDayKey);
  const to = utcDayNumber(toDayKey);
  return from === null || to === null ? null : Math.max(0, to - from);
}

export function msUntilNextLocalDay(now: Date = new Date()): number {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 50);
  return Math.max(50, next.getTime() - now.getTime());
}
