import assert from "node:assert/strict";
import { test } from "node:test";

import { isSupportedBarcode, normalizeBarcode } from "./barcode";

test("validates EAN-13, EAN-8 and UPC-A check digits", () => {
  assert.equal(normalizeBarcode("4006381333931"), "4006381333931");
  assert.equal(normalizeBarcode("96385074"), "96385074");
  assert.equal(normalizeBarcode("036000291452"), "036000291452");
});

test("rejects malformed and invalid-checksum barcodes", () => {
  assert.equal(isSupportedBarcode("4006381333932"), false);
  assert.equal(isSupportedBarcode("abc"), false);
  assert.equal(isSupportedBarcode("1234567890"), false);
});

test("normalizes harmless spaces and hyphens", () => {
  assert.equal(normalizeBarcode("4006-3813 33931"), "4006381333931");
});
