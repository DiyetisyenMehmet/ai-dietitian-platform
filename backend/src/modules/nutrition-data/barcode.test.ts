import assert from "node:assert/strict";
import { test } from "node:test";

import { isSupportedBarcode, normalizeBarcode } from "./barcode";

test("validates GTIN-13, GTIN-8, GTIN-12 and GTIN-14 check digits", () => {
  assert.equal(normalizeBarcode("4006381333931"), "4006381333931");
  assert.equal(normalizeBarcode("96385074"), "96385074");
  assert.equal(normalizeBarcode("036000291452"), "036000291452");
  assert.equal(normalizeBarcode("12345678901231"), "12345678901231");
});

test("accepts UPC-E and expands it to canonical UPC-A when needed", () => {
  assert.equal(normalizeBarcode("06543217"), "065100004327");
  assert.equal(isSupportedBarcode("06543217"), true);
});

test("rejects malformed and invalid-checksum barcodes", () => {
  assert.equal(isSupportedBarcode("4006381333932"), false);
  assert.equal(isSupportedBarcode("12345678901232"), false);
  assert.equal(isSupportedBarcode("abc"), false);
  assert.equal(isSupportedBarcode("1234567890"), false);
});

test("normalizes harmless spaces and hyphens", () => {
  assert.equal(normalizeBarcode("4006-3813 33931"), "4006381333931");
  assert.equal(normalizeBarcode("1234567-8901231"), "12345678901231");
});
