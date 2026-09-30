const ISO_CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses an ISO calendar date only when the literal year/month/day exists in
 * the Gregorian calendar. JavaScript Date parsing alone is intentionally not
 * used for validation because values such as 2026-02-31 may roll into March.
 */
export function parseIsoCalendarDateUtc(value: string): Date | null {
  const match = ISO_CALENDAR_DATE_RE.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const probe = new Date(0);
  probe.setUTCHours(0, 0, 0, 0);
  probe.setUTCFullYear(year, month - 1, day);

  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return probe;
}

export function isValidIsoCalendarDate(value: string): boolean {
  return parseIsoCalendarDateUtc(value) !== null;
}
