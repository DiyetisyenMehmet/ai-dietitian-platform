import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeightCheckInStatus,
  WEIGHT_CHECK_IN_INTERVAL_DAYS,
} from "./weight-check-in";

const NOW = new Date("2026-09-07T12:00:00.000Z");
const DAY_MS = 86_400_000;

function daysBefore(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

test("weekly weight check-in is inactive before onboarding", () => {
  const status = buildWeightCheckInStatus(false, null, NOW);
  assert.equal(status.active, false);
  assert.equal(status.required, false);
  assert.equal(status.nextDueAt, null);
});

test("completed onboarding without a persisted weight is immediately due", () => {
  const status = buildWeightCheckInStatus(true, null, NOW);
  assert.equal(status.active, true);
  assert.equal(status.required, true);
  assert.equal(status.lastLoggedAt, null);
});

test("fresh baseline satisfies the weekly check-in requirement", () => {
  const last = daysBefore(6);
  const status = buildWeightCheckInStatus(true, last, NOW);
  assert.equal(status.intervalDays, WEIGHT_CHECK_IN_INTERVAL_DAYS);
  assert.equal(status.required, false);
  assert.equal(status.overdueDays, 0);
  assert.equal(
    status.nextDueAt,
    new Date(last.getTime() + WEIGHT_CHECK_IN_INTERVAL_DAYS * DAY_MS).toISOString(),
  );
});

test("check-in becomes mandatory at the exact seven-day boundary", () => {
  const status = buildWeightCheckInStatus(true, daysBefore(7), NOW);
  assert.equal(status.required, true);
  assert.equal(status.overdueDays, 0);
});

test("overdue days are deterministic after the weekly boundary", () => {
  const status = buildWeightCheckInStatus(true, daysBefore(10), NOW);
  assert.equal(status.required, true);
  assert.equal(status.overdueDays, 3);
});
