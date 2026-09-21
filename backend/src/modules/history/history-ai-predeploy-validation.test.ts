import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeHtmlCharacterReferencesOnce,
  normalizeHistoryInsightText,
  repairUtf8MojibakeOnce,
} from "./history-ai-text";

test("pre-deploy UTF-8 words stay unchanged", () => {
  const input = "İyi öğün öğle ölçüm sağlık yağ karşılaştırma İstanbul";
  assert.equal(normalizeHistoryInsightText(input), input);
});

test("pre-deploy HTML entities normalize exactly once", () => {
  assert.equal(
    normalizeHistoryInsightText("&amp; &quot; &#39; &#x11F; &#287;"),
    "& \" ' ğ ğ",
  );
  assert.equal(
    decodeHtmlCharacterReferencesOnce("&amp;lt;script&amp;gt;"),
    "&lt;script&gt;",
  );
});

test("pre-deploy raw markup remains string data", () => {
  const raw = '<script>alert("x")</script> <img onerror=alert(1)>';
  assert.equal(normalizeHistoryInsightText(raw), raw);
});

test("pre-deploy mojibake repair is guarded", () => {
  assert.equal(repairUtf8MojibakeOnce("BugÃ¼nkÃ¼ Ã¶ÄŸÃ¼n"), "Bugünkü öğün");
  const normal = "İyi öğün öğle ölçüm sağlık yağ karşılaştırma İstanbul";
  assert.equal(repairUtf8MojibakeOnce(normal), normal);
});
