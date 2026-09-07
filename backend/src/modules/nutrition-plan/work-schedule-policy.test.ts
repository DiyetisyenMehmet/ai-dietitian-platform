import assert from "node:assert/strict";
import test from "node:test";

import {
  allowsWallClockHungerAdaptation,
  workScheduleBehaviorInsight,
} from "./work-schedule-policy";

test("variable shift disables fixed wall-clock hunger learning", () => {
  assert.equal(allowsWallClockHungerAdaptation("VARIABLE_SHIFT"), false);
  assert.equal(allowsWallClockHungerAdaptation("REGULAR"), true);
  assert.equal(allowsWallClockHungerAdaptation("NIGHT_SHIFT"), true);
  assert.equal(allowsWallClockHungerAdaptation(null), true);
});

test("shift schedules expose bounded practical provider context", () => {
  assert.match(workScheduleBehaviorInsight("VARIABLE_SHIFT") ?? "", /değişken\/vardiyalı/i);
  assert.match(workScheduleBehaviorInsight("NIGHT_SHIFT") ?? "", /gece vardiyasında/i);
  assert.equal(workScheduleBehaviorInsight("REGULAR"), null);
});
