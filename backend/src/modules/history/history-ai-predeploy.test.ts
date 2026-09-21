import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeHtmlCharacterReferencesOnce,
  normalizeHistoryInsightText,
  repairUtf8MojibakeOnce,
} from "./history-ai-text";

test("predeploy exact UTF-8 vectors remain unchanged", () => {
  const text = "İyi öğün öğle ölçüm sağlık yağ karşılaştırma İstanbul";
  assert.equal(normalizeHistoryInsightText(text), text);
});

test("predeploy exact HTML entity vectors normalize once", () => {
  assert.equal(
    normalizeHistoryInsightText("&amp; &quot; &#39; &#x11F; &#287;"),
    '& " \' ğ ğ',
  );
  assert.equal(
    decodeHtmlCharacterReferencesOnce("&amp;lt;script&amp;gt;"),
    "&lt;script&gt;",
  );
});

test("predeploy raw markup remains plain string data", () => {
  assert.equal(
    normalizeHistoryInsightText("<script>alert(1)</script>\n<img onerror=alert(1)>"),
    "<script>alert(1)</script>\n<img onerror=alert(1)>",
  );
});

test("predeploy mojibake repair does not alter normal Unicode", () => {
  const normal = "İyi öğün öğle ölçüm sağlık yağ karşılaştırma İstanbul";
  assert.equal(repairUtf8MojibakeOnce(normal), normal);
  assert.equal(
    repairUtf8MojibakeOnce("BugÃ¼nkÃ¼ kayÄ±tlarÄ±na gÃ¶re"),
    "Bugünkü kayıtlarına göre",
  );
});
