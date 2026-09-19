import { ApiError } from "../../utils/api-error";

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface LocalDateParts {
  year: number;
  month: number;
  day: number;
}

export interface HistoryDayRange {
  date: string;
  timezone: string;
  localStartDate: string;
  localEndDateExclusive: string;
  fromUtc: Date;
  toUtcExclusive: Date;
}

interface ZonedDateTimeParts extends LocalDateParts {
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getZonedFormatter(timezone: string): Intl.DateTimeFormat {
  const existing = formatterCache.get(timezone);
  if (existing) return existing;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    calendar: "gregory",
    numberingSystem: "latn",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatterCache.set(timezone, formatter);
  return formatter;
}

function readNumericPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) {
    throw ApiError.internal("History timezone formatter returned an incomplete date.");
  }
  return Number(value);
}

function getZonedParts(date: Date, timezone: string): ZonedDateTimeParts {
  const parts = getZonedFormatter(timezone).formatToParts(date);
  return {
    year: readNumericPart(parts, "year"),
    month: readNumericPart(parts, "month"),
    day: readNumericPart(parts, "day"),
    hour: readNumericPart(parts, "hour"),
    minute: readNumericPart(parts, "minute"),
    second: readNumericPart(parts, "second"),
    millisecond: date.getUTCMilliseconds(),
  };
}

function assertSameLocalDateTime(
  actual: ZonedDateTimeParts,
  expected: ZonedDateTimeParts,
): void {
  if (
    actual.year !== expected.year ||
    actual.month !== expected.month ||
    actual.day !== expected.day ||
    actual.hour !== expected.hour ||
    actual.minute !== expected.minute ||
    actual.second !== expected.second
  ) {
    throw ApiError.badRequest("The requested local time does not exist in this timezone.", {
      code: "NONEXISTENT_LOCAL_TIME",
    });
  }
}

export function parseHistoryDate(date: string): LocalDateParts {
  const match = DATE_KEY_RE.exec(date);
  if (!match) {
    throw new ApiError(400, "date must use YYYY-MM-DD.", { code: "INVALID_HISTORY_DATE" });
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));

  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new ApiError(400, "date is not a valid calendar date.", {
      code: "INVALID_HISTORY_DATE",
    });
  }

  return { year, month, day };
}

export function canonicalizeHistoryTimezone(timezone: string | undefined): string {
  const trimmed = timezone?.trim();
  if (!trimmed) {
    throw new ApiError(400, "timezone is required.", { code: "TIMEZONE_REQUIRED" });
  }

  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).resolvedOptions().timeZone;
  } catch {
    throw new ApiError(400, "timezone must be a valid IANA timezone.", {
      code: "INVALID_TIMEZONE",
    });
  }
}

export function addCalendarDays(date: string, days: number): string {
  const parsed = parseHistoryDate(date);
  const value = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function dateKeyInTimezone(date: Date, timezone: string): string {
  const zone = canonicalizeHistoryTimezone(timezone);
  const parts = getZonedParts(date, zone);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

/**
 * Converts one concrete local wall-clock timestamp to UTC without assuming a
 * fixed offset. The iterative correction asks Intl how the candidate instant
 * is represented in the requested IANA timezone, so historical DST rules are
 * applied for the selected date rather than today's device offset.
 */
export function localDateTimeToUtc(
  local: LocalDateParts & Partial<Pick<ZonedDateTimeParts, "hour" | "minute" | "second" | "millisecond">>,
  timezone: string,
): Date {
  const zone = canonicalizeHistoryTimezone(timezone);
  const expected: ZonedDateTimeParts = {
    year: local.year,
    month: local.month,
    day: local.day,
    hour: local.hour ?? 0,
    minute: local.minute ?? 0,
    second: local.second ?? 0,
    millisecond: local.millisecond ?? 0,
  };

  const targetAsUtc = Date.UTC(
    expected.year,
    expected.month - 1,
    expected.day,
    expected.hour,
    expected.minute,
    expected.second,
    expected.millisecond,
  );

  let candidateMs = targetAsUtc;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const represented = getZonedParts(new Date(candidateMs), zone);
    const representedAsUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      represented.second,
      expected.millisecond,
    );
    const correctionMs = targetAsUtc - representedAsUtc;
    if (correctionMs === 0) {
      const result = new Date(candidateMs);
      assertSameLocalDateTime(getZonedParts(result, zone), expected);
      return result;
    }
    candidateMs += correctionMs;
  }

  const result = new Date(candidateMs);
  assertSameLocalDateTime(getZonedParts(result, zone), expected);
  return result;
}

export function resolveHistoryDayRange(
  date: string,
  timezone: string | undefined,
  now = new Date(),
): HistoryDayRange {
  const zone = canonicalizeHistoryTimezone(timezone);
  const start = parseHistoryDate(date);
  const today = dateKeyInTimezone(now, zone);

  if (date > today) {
    throw new ApiError(400, "History cannot be requested for a future local date.", {
      code: "FUTURE_HISTORY_DATE",
    });
  }

  const localEndDateExclusive = addCalendarDays(date, 1);
  const end = parseHistoryDate(localEndDateExclusive);

  return {
    date,
    timezone: zone,
    localStartDate: date,
    localEndDateExclusive,
    fromUtc: localDateTimeToUtc(start, zone),
    toUtcExclusive: localDateTimeToUtc(end, zone),
  };
}
