import assert from "node:assert/strict";
import test from "node:test";

import {
  HISTORY_INSIGHT_CONTEXT_VERSION,
  canonicalHistoryContext,
  createHistoryContextHash,
  historyWaterGoalForInsight,
  sanitizeHistoryInsightText,
  shouldBypassHistoryInsightCache,
} from "./history-ai.service";
import { DISCLAIMER } from "../blood-test-analysis/constants";
import {
  decodeHtmlCharacterReferencesOnce,
  normalizeHistoryInsightText,
  repairUtf8MojibakeOnce,
} from "./history-ai-text";
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

test("history AI normalizes HTML entities and Turkish Unicode exactly once", () => {
  assert.equal(
    normalizeHistoryInsightText(
      "Bug&#252;nk&#252; kay&#305;tlar&#305;na g&#246;re su &amp; aktivite dengeli. &#128154;",
    ),
    "Bugünkü kayıtlarına göre su & aktivite dengeli. 💚",
  );
  assert.equal(
    normalizeHistoryInsightText("&quot;İyi&quot; &#39;ilerleme&#39;"),
    "\"İyi\" 'ilerleme'",
  );
  assert.equal(
    decodeHtmlCharacterReferencesOnce("&amp;lt;script&amp;gt;"),
    "&lt;script&gt;",
  );
});

test("history AI repairs a single valid UTF-8/Windows-1252 mojibake layer", () => {
  assert.equal(
    repairUtf8MojibakeOnce("BugÃ¼nkÃ¼ kayÄ±tlarÄ±na gÃ¶re ilerleme iyi."),
    "Bugünkü kayıtlarına göre ilerleme iyi.",
  );
  assert.equal(
    repairUtf8MojibakeOnce("Normal Türkçe metin değişmez."),
    "Normal Türkçe metin değişmez.",
  );
});

test("history AI keeps decoded markup as plain text data and preserves line breaks", () => {
  const normalized = normalizeHistoryInsightText(
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;\r\n<img onerror=alert(1)>",
  );
  assert.equal(normalized, '<script>alert("x")</script>\n<img onerror=alert(1)>');
  assert.equal(normalized.includes("&lt;script&gt;"), false);
});

test("history insight sanitizer removes the disclaimer after normalization", () => {
  const encoded = "Bug&#252;nk&#252; kay&#305;tlar&#305;na g&#246;re iyi ilerliyor.";
  const sanitized = sanitizeHistoryInsightText(`${encoded}\n\n${DISCLAIMER}`);
  assert.equal(sanitized, "Bugünkü kayıtlarına göre iyi ilerliyor.");
});

test("history insight cache version invalidates pre-normalization cache hashes", () => {
  assert.equal(HISTORY_INSIGHT_CONTEXT_VERSION, "history-insight-v3");
  assert.notEqual(
    createHistoryContextHash({ contextVersion: "history-insight-v2", sample: "same-source" }),
    createHistoryContextHash({
      contextVersion: HISTORY_INSIGHT_CONTEXT_VERSION,
      sample: "same-source",
    }),
  );
});

test("HTML character-reference normalization preserves case-sensitive Turkish entities", () => {
  assert.equal(
    decodeHtmlCharacterReferencesOnce(
      "&Ccedil; &ccedil; &Ouml; &ouml; &Uuml; &uuml; &AMP; &QUOT;",
    ),
    'Ç ç Ö ö Ü ü & "',
  );
});
