import assert from "node:assert/strict";
import test from "node:test";

import {
  meaningfulCharCount,
  shouldPreferWholeDocumentPdfExtraction,
} from "./pdf-text-extractor";

test("multi-page laboratory PDFs use the whole-document extraction path", () => {
  assert.equal(shouldPreferWholeDocumentPdfExtraction(0), false);
  assert.equal(shouldPreferWholeDocumentPdfExtraction(1), false);
  assert.equal(shouldPreferWholeDocumentPdfExtraction(2), true);
  assert.equal(shouldPreferWholeDocumentPdfExtraction(3), true);
  assert.equal(shouldPreferWholeDocumentPdfExtraction(20), true);
});

test("meaningfulCharCount includes Turkish letters and digits", () => {
  assert.equal(meaningfulCharCount("ÇĞİÖŞÜçğıöşü123"), 15);
  assert.equal(meaningfulCharCount("   - / , .   "), 0);
});
