import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalHistoryContext,
  createHistoryContextHash,
  shouldBypassHistoryInsightCache,
} from "./history-ai.service";

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
