import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "../../utils/api-error";
import {
  canonicalizeHistoryTimezone,
  dateKeyInTimezone,
  resolveHistoryDayRange,
} from "./history-time";

const AFTER_ALL_CASES = new Date("2026-12-01T12:00:00.000Z");

function durationHours(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 3_600_000;
}

function expectApiCode(run: () => unknown, code: string): void {
  assert.throws(run, (error: unknown) => error instanceof ApiError && error.code === code);
}

test("resolves Europe/Istanbul local day to a bounded UTC interval", () => {
  const range = resolveHistoryDayRange("2026-09-10", "Europe/Istanbul", AFTER_ALL_CASES);
  assert.equal(range.timezone, "Europe/Istanbul");
  assert.equal(range.fromUtc.toISOString(), "2026-09-09T21:00:00.000Z");
  assert.equal(range.toUtcExclusive.toISOString(), "2026-09-10T21:00:00.000Z");
  assert.equal(durationHours(range.fromUtc, range.toUtcExclusive), 24);
});

test("resolves Europe/Berlin spring DST day as 23 hours", () => {
  const range = resolveHistoryDayRange("2026-03-29", "Europe/Berlin", AFTER_ALL_CASES);
  assert.equal(range.fromUtc.toISOString(), "2026-03-28T23:00:00.000Z");
  assert.equal(range.toUtcExclusive.toISOString(), "2026-03-29T22:00:00.000Z");
  assert.equal(durationHours(range.fromUtc, range.toUtcExclusive), 23);
});

test("resolves Europe/Berlin fall DST day as 25 hours", () => {
  const range = resolveHistoryDayRange("2026-10-25", "Europe/Berlin", AFTER_ALL_CASES);
  assert.equal(range.fromUtc.toISOString(), "2026-10-24T22:00:00.000Z");
  assert.equal(range.toUtcExclusive.toISOString(), "2026-10-25T23:00:00.000Z");
  assert.equal(durationHours(range.fromUtc, range.toUtcExclusive), 25);
});

test("resolves America/New_York spring DST day as 23 hours", () => {
  const range = resolveHistoryDayRange("2026-03-08", "America/New_York", AFTER_ALL_CASES);
  assert.equal(range.fromUtc.toISOString(), "2026-03-08T05:00:00.000Z");
  assert.equal(range.toUtcExclusive.toISOString(), "2026-03-09T04:00:00.000Z");
  assert.equal(durationHours(range.fromUtc, range.toUtcExclusive), 23);
});

test("resolves America/New_York fall DST day as 25 hours", () => {
  const range = resolveHistoryDayRange("2026-11-01", "America/New_York", AFTER_ALL_CASES);
  assert.equal(range.fromUtc.toISOString(), "2026-11-01T04:00:00.000Z");
  assert.equal(range.toUtcExclusive.toISOString(), "2026-11-02T05:00:00.000Z");
  assert.equal(durationHours(range.fromUtc, range.toUtcExclusive), 25);
});

test("midnight boundary belongs to the selected local day", () => {
  assert.equal(
    dateKeyInTimezone(new Date("2026-09-09T21:00:00.000Z"), "Europe/Istanbul"),
    "2026-09-10",
  );
  assert.equal(
    dateKeyInTimezone(new Date("2026-09-10T20:59:59.999Z"), "Europe/Istanbul"),
    "2026-09-10",
  );
  assert.equal(
    dateKeyInTimezone(new Date("2026-09-10T21:00:00.000Z"), "Europe/Istanbul"),
    "2026-09-11",
  );
});

test("missing and invalid IANA timezone fail closed", () => {
  expectApiCode(() => canonicalizeHistoryTimezone(undefined), "TIMEZONE_REQUIRED");
  expectApiCode(() => canonicalizeHistoryTimezone("Not/A_Zone"), "INVALID_TIMEZONE");
});

test("invalid and future local dates fail closed", () => {
  expectApiCode(
    () => resolveHistoryDayRange("2026-02-30", "Europe/Istanbul", AFTER_ALL_CASES),
    "INVALID_HISTORY_DATE",
  );
  expectApiCode(
    () =>
      resolveHistoryDayRange(
        "2026-09-20",
        "Europe/Istanbul",
        new Date("2026-09-19T12:00:00.000Z"),
      ),
    "FUTURE_HISTORY_DATE",
  );
});
