import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalHistoryContext,
  createHistoryContextHash,
  historyWaterGoalForInsight,
  sanitizeHistoryInsightText,
  shouldBypassHistoryInsightCache,
} from "./history-ai.service";
import { DISCLAIMER } from "../blood-test-analysis/constants";
import type { DailyHistoryResponse } from "./history.types";

test("context hash is stable across object key insertion order", () => {
  const first = {
    scope: "DAY",
    nested: { b: 2, a: 1 },
    values: [{ z: 3, a: 2 }],
  };
  const second = {
    values: [{ a: 2, z: 3 }],
    nested: { a: 1, b: 2 },
    scope: "DAY",
  };
  assert.equal(canonicalHistoryContext(first), canonicalHistoryContext(second));
  assert.equal(createHistoryContextHash(first), createHistoryContextHash(second));
});

test("source mutation changes deterministic context hash", () => {
  const base = {
    contextVersion: "history-insight-v1",
    sourceFingerprint: {
      meals: [{ id: "meal-1", calories: 200 }],
    },
    context: { nutrition: { calories: 200 } },
  };
  const changed = {
    ...base,
    sourceFingerprint: {
      meals: [{ id: "meal-1", calories: 250 }],
    },
    context: { nutrition: { calories: 250 } },
  };
  assert.notEqual(createHistoryContextHash(base), createHistoryContextHash(changed));
});

test("partial or unavailable source state bypasses persistent insight cache", () => {
  assert.equal(shouldBypassHistoryInsightCache(true, false), true);
  assert.equal(shouldBypassHistoryInsightCache(false, true), true);
  assert.equal(shouldBypassHistoryInsightCache(false, false), false);
});

test("history insight removes the adapter's blood-test disclaimer at its boundary", () => {
  const turkishHistoryText = "Bugünkü kayıtlarına göre su tüketimin düzenli ilerliyor.";
  const sanitized = sanitizeHistoryInsightText(`${turkishHistoryText}\n\n${DISCLAIMER}`);

  assert.equal(sanitized, turkishHistoryText);
  assert.equal(sanitized.includes("Diewish provides educational"), false);
  assert.equal(sanitized.includes("Blood-test values"), false);
});

function historyWithGoal(
  currentGoalMl: DailyHistoryResponse["water"]["currentGoalMl"],
  historicalGoalComparisonAvailable: boolean,
): DailyHistoryResponse {
  return {
    water: { currentGoalMl, historicalGoalComparisonAvailable },
  } as DailyHistoryResponse;
}

test("history AI receives only an authoritative available water goal", () => {
  assert.deepEqual(
    historyWaterGoalForInsight(historyWithGoal({ state: "KNOWN_VALUE", value: 2500 }, true)),
    { state: "KNOWN_VALUE", value: 2500 },
  );
  assert.equal(
    historyWaterGoalForInsight(historyWithGoal({ state: "UNKNOWN", value: null }, false)),
    null,
  );
  assert.equal(
    historyWaterGoalForInsight(historyWithGoal({ state: "KNOWN_VALUE", value: 500 }, false)),
    null,
  );
});
