import assert from "node:assert/strict";
import test from "node:test";
import {
  addCalendarMonths,
  subscriptionMonth,
  turkeyDay,
  nutritionLimits,
  freeAvailableAt,
} from "./nutrition-rights-policy";

test("five calendar months clamp month-end and preserve clock time", () => {
  assert.equal(
    freeAvailableAt(new Date("2026-01-31T12:34:00Z"))?.toISOString(),
    "2026-06-30T12:34:00.000Z",
  );
  assert.equal(
    addCalendarMonths(new Date("2024-01-31T12:00:00Z"), 1).toISOString(),
    "2024-02-29T12:00:00.000Z",
  );
  assert.equal(freeAvailableAt(null), null);
});
test("annual subscription uses monthly original-anchor anniversaries without drift", () => {
  const range = subscriptionMonth(
    new Date("2026-01-31T12:00:00Z"),
    new Date("2026-03-30T00:00:00Z"),
  );
  assert.equal(range.start.toISOString(), "2026-02-28T12:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-03-31T12:00:00.000Z");
});
test("daily limits use Türkiye calendar day; new paid rights and legacy promises stay separate", () => {
  assert.equal(
    turkeyDay(new Date("2026-10-14T21:00:00Z")).start.toISOString(),
    "2026-10-14T21:00:00.000Z",
  );
  assert.deepEqual(nutritionLimits("PREMIUM"), { day: 2, month: 5 });
  assert.deepEqual(nutritionLimits("PREMIUM_PLUS"), { day: 3, month: 10 });
  assert.deepEqual(nutritionLimits("FREE"), { day: null, month: null });
  assert.deepEqual(nutritionLimits("PREMIUM", true), { day: 15, month: 100 });
});
