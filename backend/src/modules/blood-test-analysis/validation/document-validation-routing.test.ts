import assert from "node:assert/strict";
import test from "node:test";

import { shouldValidatePdfAsWholeDocument } from "./document-validation.service";

test("single-page PDFs keep the cheaper text-first validation path", () => {
  assert.equal(shouldValidatePdfAsWholeDocument(0), false);
  assert.equal(shouldValidatePdfAsWholeDocument(1), false);
});

test("multi-page PDFs preserve the whole document for ambiguous validation", () => {
  assert.equal(shouldValidatePdfAsWholeDocument(2), true);
  assert.equal(shouldValidatePdfAsWholeDocument(3), true);
  assert.equal(shouldValidatePdfAsWholeDocument(12), true);
});
