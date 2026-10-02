import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { Prisma } from "@prisma/client";

import { createApp } from "../app";
import { prisma } from "../lib/prisma";
import type { NormalizedBloodTestValue } from "../modules/blood-test-analysis/types";
import { signAccessToken } from "../utils/jwt";

function normalized(code: string, numericValue: number): NormalizedBloodTestValue {
  return {
    biomarkerCode: code,
    biomarkerName: code,
    rawValue: String(numericValue),
    numericValue,
    unit: "mg/dL",
    extractedUnit: "mg/dL",
    conversionFactor: 1,
    referenceRange: {
      unit: "mg/dL",
      minValue: 1,
      maxValue: 100,
      optimalMin: null,
      optimalMax: null,
      source: "LAB_REPORT",
    },
    status: "NORMAL",
  };
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

test("longitudinal analysis detail is owner-scoped and uses real test dates", async (t) => {
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/blood-tests`;
  const prefix = `blood-longitudinal-${crypto.randomUUID()}`;
  const userIds: string[] = [];

  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${prefix}-${label}@example.com`,
        passwordHash: "LONGITUDINAL-TEST",
        fullName: `Longitudinal ${label}`,
        onboardingCompleted: true,
      },
    });
    userIds.push(user.id);
    return {
      user,
      token: signAccessToken({ userId: user.id, email: user.email, role: user.role }),
    };
  }

  async function createCompletedAnalysis(
    userId: string,
    label: string,
    testDate: string | null,
    createdAt: string,
    values: NormalizedBloodTestValue[],
  ) {
    const upload = await prisma.bloodTestUpload.create({
      data: {
        userId,
        storageProvider: "memory",
        storageKey: `${prefix}/${label}`,
        originalFilename: `${label}.pdf`,
        mimeType: "application/pdf",
        fileSizeBytes: 100,
        checksumSha256: crypto.createHash("sha256").update(label).digest("hex"),
        testDate: testDate ? new Date(`${testDate}T00:00:00.000Z`) : null,
        createdAt: new Date(createdAt),
      },
    });
    const analysis = await prisma.bloodTestAnalysis.create({
      data: {
        userId,
        bloodTestId: upload.id,
        status: "COMPLETED",
        normalizedValues: json(values),
        abnormalValues: json([]),
        aiExplanations: json([]),
        nutritionImplications: json([]),
        overallRecommendations: json([]),
        createdAt: new Date(createdAt),
      },
    });
    return { upload, analysis };
  }

  const owner = await createUser("owner");
  const other = await createUser("other");

  const previous = await createCompletedAnalysis(
    owner.user.id,
    "previous",
    "2026-08-01",
    "2026-08-02T08:00:00.000Z",
    [normalized("GLUCOSE", 80)],
  );
  await createCompletedAnalysis(
    owner.user.id,
    "future-test",
    "2026-10-01",
    "2026-08-31T08:00:00.000Z",
    [normalized("GLUCOSE", 70)],
  );
  const current = await createCompletedAnalysis(
    owner.user.id,
    "current",
    "2026-09-01",
    "2026-09-02T08:00:00.000Z",
    [normalized("GLUCOSE", 100)],
  );
  const otherAnalysis = await createCompletedAnalysis(
    other.user.id,
    "other-newer",
    "2026-08-31",
    "2026-09-01T08:00:00.000Z",
    [normalized("GLUCOSE", 10)],
  );

  const response = await fetch(`${base}/${current.upload.id}/analysis`, {
    headers: { authorization: `Bearer ${owner.token}` },
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    data: {
      analysis: {
        id: string;
        longitudinalComparison: {
          previousAnalysisId: string;
          previousMeasuredAt: string | null;
          currentMeasuredAt: string | null;
          comparedCount: number;
          comparisons: Array<{
            biomarkerCode: string;
            previousValue: number;
            currentValue: number;
          }>;
        } | null;
      };
    };
  };

  assert.equal(body.data.analysis.id, current.analysis.id);
  assert.equal(body.data.analysis.longitudinalComparison?.previousAnalysisId, previous.analysis.id);
  assert.equal(body.data.analysis.longitudinalComparison?.previousMeasuredAt, "2026-08-01");
  assert.equal(body.data.analysis.longitudinalComparison?.currentMeasuredAt, "2026-09-01");
  assert.equal(body.data.analysis.longitudinalComparison?.comparedCount, 1);
  assert.deepEqual(body.data.analysis.longitudinalComparison?.comparisons[0], {
    biomarkerCode: "GLUCOSE",
    previousValue: 80,
    currentValue: 100,
    biomarkerName: "GLUCOSE",
    unit: "mg/dL",
    absoluteDifference: 20,
    percentageDifference: 25,
    direction: "increased",
    previousReferenceStatus: "NORMAL",
    currentReferenceStatus: "NORMAL",
  });

  const crossOwner = await fetch(`${base}/${otherAnalysis.upload.id}/analysis`, {
    headers: { authorization: `Bearer ${owner.token}` },
  });
  assert.equal(crossOwner.status, 404);

  const listResponse = await fetch(`${base}/analyses`, {
    headers: { authorization: `Bearer ${owner.token}` },
  });
  assert.equal(listResponse.status, 200);
  const listBody = (await listResponse.json()) as { data: { analyses: unknown[] } };
  assert.ok(listBody.data.analyses.length >= 3);
  assert.ok(
    listBody.data.analyses.every(
      (analysis) =>
        typeof analysis === "object" &&
        analysis !== null &&
        !("longitudinalComparison" in analysis),
    ),
  );
});
