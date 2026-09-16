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
  user: { id: string };
  tokens: { accessToken: string };
}

interface WeightLogData {
  log: { id: string; weightKg: number; loggedAt: string; note?: string | null };
}

interface WeightListData {
  logs: Array<{ id: string; weightKg: number; loggedAt: string; note?: string | null }>;
}

interface ProfileData {
  profile: { currentWeightKg: number; targetWeightKg: number } | null;
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
  options: { method?: "GET" | "POST" | "PATCH"; token?: string; body?: unknown } = {},
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

async function deleteRequest(baseUrl: string, path: string, token: string): Promise<number> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
  return response.status;
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
  fullName: "Weight CRUD User",
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

test("weight edit/delete stays chronological, bounded and owner-scoped", async (t) => {
  const nonce = Date.now();
  const email = `weight.crud.${nonce}@example.com`;
  const otherEmail = `weight.crud.other.${nonce}@example.com`;
  const password = "IntegrationPass123";
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
  await grantMandatoryConsents(baseUrl, token);

  const onboarding = await apiRequest<ProfileData>(baseUrl, "/api/onboarding", {
    method: "POST",
    token,
    body: profilePayload,
  });
  assert.equal(onboarding.status, 200);
  expectSuccess(onboarding.body);

  const baseline = await prisma.weightLog.findFirstOrThrow({
    where: { userId, note: "Başlangıç" },
  });
  const baselineAt = new Date(Date.now() - 10 * DAY_MS);
  await prisma.weightLog.update({ where: { id: baseline.id }, data: { loggedAt: baselineAt } });

  const historical = await apiRequest<WeightLogData>(baseUrl, "/api/tracking/weight", {
    method: "POST",
    token,
    body: { weightKg: 71, loggedAt: new Date(baselineAt.getTime() + DAY_MS).toISOString() },
  });
  const latest = await apiRequest<WeightLogData>(baseUrl, "/api/tracking/weight", {
    method: "POST",
    token,
    body: { weightKg: 69.8 },
  });
  assert.equal(historical.status, 201);
  assert.equal(latest.status, 201);
  expectSuccess(historical.body);
  expectSuccess(latest.body);
  const historicalId = historical.body.data.log.id;
  const latestId = latest.body.data.log.id;

  const ownGet = await apiRequest<WeightLogData>(baseUrl, `/api/tracking/weight/${latestId}`, { token });
  assert.equal(ownGet.status, 200);
  expectSuccess(ownGet.body);
  assert.equal(ownGet.body.data.log.weightKg, 69.8);

  const editLatest = await apiRequest<WeightLogData>(baseUrl, `/api/tracking/weight/${latestId}`, {
    method: "PATCH",
    token,
    body: { weightKg: 69.5 },
  });
  assert.equal(editLatest.status, 200);
  expectSuccess(editLatest.body);
  assert.equal(editLatest.body.data.log.weightKg, 69.5);

  let profile = await apiRequest<ProfileData>(baseUrl, "/api/onboarding", { token });
  expectSuccess(profile.body);
  assert.equal(profile.body.data.profile?.currentWeightKg, 69.5);

  for (const invalidWeight of [0, -1, 24.9, 400.1, 69.85]) {
    const invalid = await apiRequest<WeightLogData>(baseUrl, `/api/tracking/weight/${latestId}`, {
      method: "PATCH",
      token,
      body: { weightKg: invalidWeight },
    });
    assert.equal(invalid.status, 422, `expected PATCH ${invalidWeight} kg to be rejected`);
    expectFailure(invalid.body);
  }
  profile = await apiRequest<ProfileData>(baseUrl, "/api/onboarding", { token });
  expectSuccess(profile.body);
  assert.equal(profile.body.data.profile?.currentWeightKg, 69.5);

  const editHistorical = await apiRequest<WeightLogData>(
    baseUrl,
    `/api/tracking/weight/${historicalId}`,
    {
      method: "PATCH",
      token,
      body: {
        weightKg: 71.3,
        loggedAt: new Date(baselineAt.getTime() + 2 * DAY_MS).toISOString(),
      },
    },
  );
  assert.equal(editHistorical.status, 200);
  expectSuccess(editHistorical.body);
  profile = await apiRequest<ProfileData>(baseUrl, "/api/onboarding", { token });
  expectSuccess(profile.body);
  assert.equal(profile.body.data.profile?.currentWeightKg, 69.5);

  const otherRegistration = await apiRequest<AuthData>(baseUrl, "/api/auth/register", {
    method: "POST",
    body: { email: otherEmail, password, fullName: "Other Weight CRUD User" },
  });
  assert.equal(otherRegistration.status, 201);
  expectSuccess(otherRegistration.body);
  const otherToken = otherRegistration.body.data.tokens.accessToken;
  await grantMandatoryConsents(baseUrl, otherToken);

  const crossGet = await apiRequest<WeightLogData>(baseUrl, `/api/tracking/weight/${latestId}`, {
    token: otherToken,
  });
  assert.equal(crossGet.status, 404);
  expectFailure(crossGet.body);

  const crossPatch = await apiRequest<WeightLogData>(baseUrl, `/api/tracking/weight/${latestId}`, {
    method: "PATCH",
    token: otherToken,
    body: { weightKg: 80 },
  });
  assert.equal(crossPatch.status, 404);
  expectFailure(crossPatch.body);
  assert.equal(await deleteRequest(baseUrl, `/api/tracking/weight/${latestId}`, otherToken), 404);

  assert.equal(await deleteRequest(baseUrl, `/api/tracking/weight/${historicalId}`, token), 204);
  profile = await apiRequest<ProfileData>(baseUrl, "/api/onboarding", { token });
  expectSuccess(profile.body);
  assert.equal(profile.body.data.profile?.currentWeightKg, 69.5);

  assert.equal(await deleteRequest(baseUrl, `/api/tracking/weight/${latestId}`, token), 204);
  profile = await apiRequest<ProfileData>(baseUrl, "/api/onboarding", { token });
  expectSuccess(profile.body);
  assert.equal(profile.body.data.profile?.currentWeightKg, 70);

  const baselineEdit = await apiRequest<WeightLogData>(baseUrl, `/api/tracking/weight/${baseline.id}`, {
    method: "PATCH",
    token,
    body: { weightKg: 70.2 },
  });
  assert.equal(baselineEdit.status, 409);
  expectFailure(baselineEdit.body);
  assert.equal(await deleteRequest(baseUrl, `/api/tracking/weight/${baseline.id}`, token), 409);

  const capRows = Array.from({ length: 510 }, (_, index) => ({
    userId,
    weightKg: 70 + (index % 5) / 10,
    note: "history-cap-test",
    loggedAt: new Date(baselineAt.getTime() + (index + 1) * 60_000),
  }));
  await prisma.weightLog.createMany({ data: capRows });
  const boundedHistory = await apiRequest<WeightListData>(baseUrl, "/api/tracking/weight", { token });
  assert.equal(boundedHistory.status, 200);
  expectSuccess(boundedHistory.body);
  assert.equal(boundedHistory.body.data.logs.length, 500);
  assert.ok(
    boundedHistory.body.data.logs.some((log) => log.id === baseline.id),
    "bounded history must retain the canonical starting-weight baseline",
  );
});
