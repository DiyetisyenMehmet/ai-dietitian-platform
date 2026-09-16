import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp } from "../app";
import { prisma } from "../lib/prisma";

type ApiEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

interface AuthData {
  user: { id: string; email: string; onboardingCompleted: boolean };
  tokens: { accessToken: string; refreshToken: string };
}

interface ProfileData {
  profile: {
    currentWeightKg: number;
    targetWeightKg: number;
  } | null;
}

interface OnboardingData {
  profile: {
    currentWeightKg: number;
    targetWeightKg: number;
  };
}

interface WeightLogData {
  log: { id: string; weightKg: number; loggedAt: string; note?: string | null };
}

interface WeightListData {
  logs: Array<{ id: string; weightKg: number; loggedAt: string; note?: string | null }>;
}

function expectSuccess<T>(body: ApiEnvelope<T>): asserts body is { success: true; data: T } {
  assert.equal(body.success, true);
}

function expectFailure<T>(
  body: ApiEnvelope<T>,
): asserts body is { success: false; error: { code: string; message: string; details?: unknown } } {
  assert.equal(body.success, false);
}

async function apiRequest<T>(
  baseUrl: string,
  path: string,
  options: { method?: "GET" | "POST"; token?: string; body?: unknown } = {},
): Promise<{ status: number; body: ApiEnvelope<T> }> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: (await response.json()) as ApiEnvelope<T> };
}

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
  const app = createApp();
  let server: Server | undefined;
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  assert.ok(server);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return { server, baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}` };
}

async function grantMandatoryConsents(baseUrl: string, token: string): Promise<void> {
  for (const type of ["TERMS_OF_SERVICE", "MEDICAL_DISCLAIMER", "KVKK_EXPLICIT_CONSENT"] as const) {
    const response = await apiRequest<unknown>(baseUrl, "/api/legal/consents", {
      method: "POST",
      token,
      body: { type },
    });
    assert.equal(response.status, 200);
    expectSuccess(response.body);
  }
}

const profilePayload = {
  fullName: "Weight Integration User",
  dateOfBirth: "1990-05-20",
  gender: "PREFER_NOT_TO_SAY",
  heightCm: 175,
  currentWeightKg: 70,
  targetWeightKg: 65,
  activityLevel: "MODERATE",
  healthConditions: [],
  allergies: [],
  dietaryPreference: "OMNIVORE",
  dailyWaterGoalMl: 2500,
  workScheduleType: "REGULAR",
  usualWakeTime: "07:00",
  usualSleepTime: "23:00",
} as const;

const DAY_MS = 86_400_000;

test("weight history keeps profile current weight chronological and owner-scoped", async (t) => {
  const nonce = Date.now();
  const email = `weight.${nonce}@example.com`;
  const otherEmail = `weight.other.${nonce}@example.com`;
  const password = "IntegrationPass123";

  await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
  const { server, baseUrl } = await startServer();

  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    await prisma.$disconnect();
  });

  const registration = await apiRequest<AuthData>(baseUrl, "/api/auth/register", {
    method: "POST",
    body: { email, password, fullName: profilePayload.fullName },
  });
  assert.equal(registration.status, 201);
  expectSuccess(registration.body);
  const token = registration.body.data.tokens.accessToken;
  const userId = registration.body.data.user.id;

  const emptyHistory = await apiRequest<WeightListData>(baseUrl, "/api/tracking/weight", {
    token,
  });
  assert.equal(emptyHistory.status, 200);
  expectSuccess(emptyHistory.body);
  assert.deepEqual(emptyHistory.body.data.logs, []);

  const unauthorized = await apiRequest<WeightLogData>(baseUrl, "/api/tracking/weight", {
    method: "POST",
    body: { weightKg: 70 },
  });
  assert.equal(unauthorized.status, 401);
  expectFailure(unauthorized.body);

  await grantMandatoryConsents(baseUrl, token);
  const onboarding = await apiRequest<OnboardingData>(baseUrl, "/api/onboarding", {
    method: "POST",
    token,
    body: profilePayload,
  });
  assert.equal(onboarding.status, 200);
  expectSuccess(onboarding.body);
  assert.equal(onboarding.body.data.profile.currentWeightKg, 70);

  const baseline = await prisma.weightLog.findFirstOrThrow({
    where: { userId, note: "Başlangıç" },
  });
  const oldBaselineAt = new Date(Date.now() - 8 * DAY_MS);
  await prisma.weightLog.update({ where: { id: baseline.id }, data: { loggedAt: oldBaselineAt } });

  for (const invalidWeight of [0, -1, 24.9, 400.1, 69.85]) {
    const invalid = await apiRequest<WeightLogData>(baseUrl, "/api/tracking/weight", {
      method: "POST",
      token,
      body: { weightKg: invalidWeight },
    });
    assert.equal(invalid.status, 422, `expected ${invalidWeight} kg to be rejected`);
    expectFailure(invalid.body);
  }

  const now = Date.now();
  const olderAt = new Date(now - 120_000).toISOString();
  const latestAt = new Date(now - 60_000).toISOString();
  const [olderConcurrent, newerConcurrent] = await Promise.all([
    apiRequest<WeightLogData>(baseUrl, "/api/tracking/weight", {
      method: "POST",
      token,
      body: { weightKg: 70.1, loggedAt: olderAt },
    }),
    apiRequest<WeightLogData>(baseUrl, "/api/tracking/weight", {
      method: "POST",
      token,
      body: { weightKg: 69.9, loggedAt: latestAt },
    }),
  ]);
  assert.equal(olderConcurrent.status, 201);
  assert.equal(newerConcurrent.status, 201);
  expectSuccess(olderConcurrent.body);
  expectSuccess(newerConcurrent.body);

  const afterConcurrent = await apiRequest<ProfileData>(baseUrl, "/api/onboarding", { token });
  expectSuccess(afterConcurrent.body);
  assert.equal(afterConcurrent.body.data.profile?.currentWeightKg, 69.9);

  const backdated = await apiRequest<WeightLogData>(baseUrl, "/api/tracking/weight", {
    method: "POST",
    token,
    body: {
      weightKg: 71.2,
      loggedAt: new Date(oldBaselineAt.getTime() + DAY_MS).toISOString(),
    },
  });
  assert.equal(backdated.status, 201);
  expectSuccess(backdated.body);

  const afterBackdated = await apiRequest<ProfileData>(baseUrl, "/api/onboarding", { token });
  expectSuccess(afterBackdated.body);
  assert.equal(afterBackdated.body.data.profile?.currentWeightKg, 69.9);

  const sameDayBase = new Date(oldBaselineAt);
  sameDayBase.setUTCHours(8, 0, 0, 0);
  const sameDayEarly = await apiRequest<WeightLogData>(baseUrl, "/api/tracking/weight", {
    method: "POST",
    token,
    body: { weightKg: 71.1, loggedAt: sameDayBase.toISOString() },
  });
  const sameDayLate = await apiRequest<WeightLogData>(baseUrl, "/api/tracking/weight", {
    method: "POST",
    token,
    body: {
      weightKg: 71,
      loggedAt: new Date(sameDayBase.getTime() + 60 * 60_000).toISOString(),
    },
  });
  assert.equal(sameDayEarly.status, 201);
  assert.equal(sameDayLate.status, 201);
  expectSuccess(sameDayEarly.body);
  expectSuccess(sameDayLate.body);
  const sameDayEarlyId = sameDayEarly.body.data.log.id;
  const sameDayLateId = sameDayLate.body.data.log.id;

  const orderedHistory = await apiRequest<WeightListData>(baseUrl, "/api/tracking/weight", { token });
  expectSuccess(orderedHistory.body);
  const earlyIndex = orderedHistory.body.data.logs.findIndex((log) => log.id === sameDayEarlyId);
  const lateIndex = orderedHistory.body.data.logs.findIndex((log) => log.id === sameDayLateId);
  assert.ok(earlyIndex >= 0 && lateIndex >= 0);
  assert.ok(lateIndex < earlyIndex, "same-day logs must be newest-first deterministically");

  const currentWeighIn = await apiRequest<WeightLogData>(baseUrl, "/api/tracking/weight", {
    method: "POST",
    token,
    body: { weightKg: 69.8 },
  });
  assert.equal(currentWeighIn.status, 201);
  expectSuccess(currentWeighIn.body);

  const countBeforeProfileWeightEdit = await prisma.weightLog.count({ where: { userId } });
  const profileWeightEdit = await apiRequest<OnboardingData>(baseUrl, "/api/onboarding", {
    method: "POST",
    token,
    body: { ...profilePayload, currentWeightKg: 69.6, targetWeightKg: 64.5 },
  });
  assert.equal(profileWeightEdit.status, 200);
  expectSuccess(profileWeightEdit.body);
  assert.equal(profileWeightEdit.body.data.profile.currentWeightKg, 69.6);
  assert.equal(profileWeightEdit.body.data.profile.targetWeightKg, 64.5);
  assert.equal(
    await prisma.weightLog.count({ where: { userId } }),
    countBeforeProfileWeightEdit + 1,
    "profile weight edit must append exactly one history row atomically",
  );
  assert.equal(
    await prisma.weightLog.count({
      where: { userId, note: "Profil güncellemesi", weightKg: 69.6 },
    }),
    1,
  );

  const countBeforeGoalOnlyEdit = await prisma.weightLog.count({ where: { userId } });
  const goalOnlyEdit = await apiRequest<OnboardingData>(baseUrl, "/api/onboarding", {
    method: "POST",
    token,
    body: { ...profilePayload, currentWeightKg: 69.6, targetWeightKg: 64 },
  });
  assert.equal(goalOnlyEdit.status, 200);
  expectSuccess(goalOnlyEdit.body);
  assert.equal(goalOnlyEdit.body.data.profile.currentWeightKg, 69.6);
  assert.equal(goalOnlyEdit.body.data.profile.targetWeightKg, 64);
  assert.equal(
    await prisma.weightLog.count({ where: { userId } }),
    countBeforeGoalOnlyEdit,
    "goal-only updates must not create weight history",
  );

  const baselineCount = await prisma.weightLog.count({ where: { userId, note: "Başlangıç" } });
  assert.equal(baselineCount, 1, "starting-weight baseline must remain immutable");

  const otherRegistration = await apiRequest<AuthData>(baseUrl, "/api/auth/register", {
    method: "POST",
    body: { email: otherEmail, password, fullName: "Other User" },
  });
  assert.equal(otherRegistration.status, 201);
  expectSuccess(otherRegistration.body);
  const otherToken = otherRegistration.body.data.tokens.accessToken;

  const otherHistory = await apiRequest<WeightListData>(
    baseUrl,
    `/api/tracking/weight?userId=${encodeURIComponent(userId)}`,
    { token: otherToken },
  );
  assert.equal(otherHistory.status, 200);
  expectSuccess(otherHistory.body);
  assert.deepEqual(otherHistory.body.data.logs, [], "history must be scoped to the authenticated owner");
});
