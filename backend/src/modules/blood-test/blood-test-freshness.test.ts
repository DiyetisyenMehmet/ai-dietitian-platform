import assert from "node:assert/strict";
import test from "node:test";

import type { BloodTestAnalysis } from "@prisma/client";

import {
  assessBloodTestFreshness,
  selectLatestCurrentBloodTestAnalysis,
} from "./blood-test-freshness";

const NOW = new Date("2026-09-30T12:00:00.000Z");

function daysBefore(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function fakeAnalysis(id: string, createdAt: string): BloodTestAnalysis {
  return {
    id,
    bloodTestId: `upload-${id}`,
    userId: "user-1",
    status: "COMPLETED",
    extractionMethod: null,
    rawExtractedText: null,
    normalizedValues: [],
    abnormalValues: [],
    abnormalCount: 0,
    aiExplanations: [],
    nutritionImplications: [],
    overallRecommendations: [],
    summary: null,
    aiProvider: null,
    aiModel: null,
    processingTimeMs: null,
    errorMessage: null,
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
  } as unknown as BloodTestAnalysis;
}

test("blood-test freshness boundaries are inclusive at 60 and 90 days", () => {
  assert.equal(assessBloodTestFreshness(daysBefore(60), NOW).status, "CURRENT");
  assert.equal(assessBloodTestFreshness(daysBefore(61), NOW).status, "STALE");
  assert.equal(assessBloodTestFreshness(daysBefore(90), NOW).status, "STALE");
  assert.equal(assessBloodTestFreshness(daysBefore(91), NOW).status, "ARCHIVED");
});

test("blood-test freshness rejects future dates", () => {
  assert.throws(
    () => assessBloodTestFreshness(new Date("2026-10-01T00:00:00.000Z"), NOW),
    /future/i,
  );
});

test("personalization selects only the newest CURRENT test by real test date", () => {
  const selected = selectLatestCurrentBloodTestAnalysis(
    [
      {
        analysis: fakeAnalysis("new-upload-old-test", "2026-09-29T10:00:00.000Z"),
        testDate: daysBefore(61),
      },
      {
        analysis: fakeAnalysis("older-upload-current-test", "2026-09-20T10:00:00.000Z"),
        testDate: daysBefore(10),
      },
      {
        analysis: fakeAnalysis("archived", "2026-09-30T10:00:00.000Z"),
        testDate: daysBefore(91),
      },
    ],
    NOW,
  );

  assert.equal(selected?.analysis.id, "older-upload-current-test");
});

test("stale, archived and undated analyses are excluded from current personalization", () => {
  const selected = selectLatestCurrentBloodTestAnalysis(
    [
      { analysis: fakeAnalysis("stale", "2026-09-30T10:00:00.000Z"), testDate: daysBefore(61) },
      { analysis: fakeAnalysis("archived", "2026-09-29T10:00:00.000Z"), testDate: daysBefore(91) },
      { analysis: fakeAnalysis("legacy", "2026-09-28T10:00:00.000Z"), testDate: null },
    ],
    NOW,
  );
  assert.equal(selected, null);
});
