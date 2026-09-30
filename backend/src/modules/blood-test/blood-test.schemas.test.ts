import assert from "node:assert/strict";
import test from "node:test";

import { uploadMetadataSchema } from "./blood-test.schemas";

function expectRejectedDate(value: string): void {
  const result = uploadMetadataSchema.safeParse({ testDate: value });
  assert.equal(result.success, false, `${value} must be rejected`);
  if (!result.success) {
    assert.match(
      result.error.issues.map((issue) => issue.message).join(" "),
      /valid calendar date/i,
    );
  }
}

function expectAcceptedDate(value: string): void {
  const result = uploadMetadataSchema.safeParse({ testDate: value });
  assert.equal(result.success, true, `${value} must be accepted`);
  if (result.success) {
    assert.equal(result.data.testDate, value);
  }
}

test("blood-test metadata rejects impossible calendar dates without rollover", () => {
  expectRejectedDate("2026-02-31");
  expectRejectedDate("2025-02-29");
  expectRejectedDate("2026-04-31");
});

test("blood-test metadata accepts real dates including leap day", () => {
  expectAcceptedDate("2026-02-28");
  expectAcceptedDate("2024-02-29");
});


test("blood-test metadata requires the real test date and rejects future dates", () => {
  assert.equal(uploadMetadataSchema.safeParse({}).success, false);
  assert.equal(uploadMetadataSchema.safeParse({ testDate: "2999-01-01" }).success, false);
});
