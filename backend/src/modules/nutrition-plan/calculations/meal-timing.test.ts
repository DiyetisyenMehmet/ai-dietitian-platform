import assert from "node:assert/strict";
import test from "node:test";

import { calculateMealTiming } from "./meal-timing";

function timelineMinutes(times: string[]): number[] {
  let offset = 0;
  let previous = -1;
  return times.map((time) => {
    const [hours, minutes] = time.split(":").map(Number);
    let value = hours * 60 + minutes + offset;
    if (value <= previous) {
      offset += 1440;
      value += 1440;
    }
    previous = value;
    return value;
  });
}

test("keeps the established schedule when rhythm data is unavailable", () => {
  const result = calculateMealTiming("LOSE_WEIGHT");

  assert.deepEqual(
    result.slots.map(({ name, time }) => ({ name, time })),
    [
      { name: "Breakfast", time: "08:00" },
      { name: "Lunch", time: "13:00" },
      { name: "Snack", time: "16:30" },
      { name: "Dinner", time: "19:30" },
    ],
  );
});

test("derives deterministic meal times from a regular wake and sleep window", () => {
  const result = calculateMealTiming("LOSE_WEIGHT", {
    workScheduleType: "REGULAR",
    usualWakeTime: "07:00",
    usualSleepTime: "23:00",
  });

  assert.deepEqual(result.slots.map((slot) => slot.time), ["08:15", "12:25", "16:35", "20:45"]);

  const timeline = timelineMinutes(result.slots.map((slot) => slot.time));
  for (let index = 1; index < timeline.length; index += 1) {
    assert.ok(timeline[index] - timeline[index - 1] >= 120);
  }
});

test("supports night-shift overnight waking windows without forcing daytime meal times", () => {
  const result = calculateMealTiming("LOSE_WEIGHT", {
    workScheduleType: "NIGHT_SHIFT",
    usualWakeTime: "17:00",
    usualSleepTime: "09:00",
  });

  assert.deepEqual(result.slots.map((slot) => slot.time), ["18:15", "22:25", "02:35", "06:45"]);
  const timeline = timelineMinutes(result.slots.map((slot) => slot.time));
  assert.ok(timeline.every((value, index) => index === 0 || value > timeline[index - 1]));
});

test("moves only the snack toward an evidence-backed recurring hunger window", () => {
  const result = calculateMealTiming("LOSE_WEIGHT", {
    workScheduleType: "REGULAR",
    usualWakeTime: "07:00",
    usualSleepTime: "23:00",
    preferredSnackTime: "15:00",
  });

  assert.deepEqual(result.slots.map((slot) => slot.time), ["08:15", "12:25", "15:00", "20:45"]);
  assert.equal(result.slots[2].name, "Snack");
});

test("variable shift ignores fixed wall-clock hunger adaptation", () => {
  const result = calculateMealTiming("LOSE_WEIGHT", {
    workScheduleType: "VARIABLE_SHIFT",
    usualWakeTime: "07:00",
    usualSleepTime: "23:00",
    preferredSnackTime: "15:00",
  });

  assert.deepEqual(result.slots.map((slot) => slot.time), ["08:15", "12:25", "16:35", "20:45"]);
});

test("falls back instead of producing compressed meal times from implausible rhythm data", () => {
  const result = calculateMealTiming("LOSE_WEIGHT", {
    usualWakeTime: "08:00",
    usualSleepTime: "14:00",
  });

  assert.deepEqual(result.slots.map((slot) => slot.time), ["08:00", "13:00", "16:30", "19:30"]);
});
