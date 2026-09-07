import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp } from "../app";
import { prisma } from "../lib/prisma";

type WorkScheduleType = "REGULAR" | "VARIABLE_SHIFT" | "NIGHT_SHIFT";

type ApiEnvelope<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: { code: string; message: string; details?: unknown };
    };

interface AuthData {
  user: {
    id: string;
    email: string;
    onboardingCompleted: boolean;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

interface PublicProfile {
  usualWakeTime: string | null;
  usualSleepTime: string | null;
  workScheduleType: WorkScheduleType | null;
}

interface OnboardingCompleteData {
  onboardingCompleted: boolean;
  fullName: string;
  profile: PublicProfile;
}

interface OnboardingReadData {
  profile: PublicProfile | null;
}

interface MeData {
  user: {
    onboardingCompleted: boolean;
  };
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
  options: {
    method?: "GET" | "POST";
    token?: string;
    body?: unknown;
  } = {},
): Promise<{ status: number; body: ApiEnvelope<T> }> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  return {
    status: response.status,
    body: (await response.json()) as ApiEnvelope<T>,
  };
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

test("register -> consent gate -> onboarding -> persisted work-schedule update", async (t) => {
  const email = `integration.${Date.now()}@example.com`;
  const password = "IntegrationPass123";

  await prisma.user.deleteMany({ where: { email } });
  const { server, baseUrl } = await startServer();

  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  const registration = await apiRequest<AuthData>(baseUrl, "/api/auth/register", {
    method: "POST",
    body: { email, password, fullName: "Integration User" },
  });
  assert.equal(registration.status, 201);
  expectSuccess(registration.body);
  assert.equal(registration.body.data.user.onboardingCompleted, false);

  const { accessToken } = registration.body.data.tokens;
  const userId = registration.body.data.user.id;

  const emptyProfile = await apiRequest<OnboardingReadData>(baseUrl, "/api/onboarding", {
    token: accessToken,
  });
  assert.equal(emptyProfile.status, 200);
  expectSuccess(emptyProfile.body);
  assert.equal(emptyProfile.body.data.profile, null);

  const nightShiftProfile = {
    fullName: "Integration User",
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
    workScheduleType: "NIGHT_SHIFT",
    usualWakeTime: "17:00",
    usualSleepTime: "09:00",
  } as const;

  const blockedOnboarding = await apiRequest<OnboardingCompleteData>(baseUrl, "/api/onboarding", {
    method: "POST",
    token: accessToken,
    body: nightShiftProfile,
  });
  assert.equal(blockedOnboarding.status, 403);
  expectFailure(blockedOnboarding.body);
  assert.equal(blockedOnboarding.body.error.code, "CONSENT_REQUIRED");

  // PRIVACY_POLICY is an informational KVKK illumination notice, not an
  // affirmative consent. Only the three documents marked mandatory by the
  // legal module are grantable and required by the health-data write gate.
  const mandatoryConsents = [
    "TERMS_OF_SERVICE",
    "MEDICAL_DISCLAIMER",
    "KVKK_EXPLICIT_CONSENT",
  ] as const;
  for (const type of mandatoryConsents) {
    const consent = await apiRequest<unknown>(baseUrl, "/api/legal/consents", {
      method: "POST",
      token: accessToken,
      body: { type },
    });
    assert.equal(consent.status, 200);
    expectSuccess(consent.body);
  }

  const completed = await apiRequest<OnboardingCompleteData>(baseUrl, "/api/onboarding", {
    method: "POST",
    token: accessToken,
    body: nightShiftProfile,
  });
  assert.equal(completed.status, 200);
  expectSuccess(completed.body);
  assert.equal(completed.body.data.onboardingCompleted, true);
  assert.equal(completed.body.data.profile.workScheduleType, "NIGHT_SHIFT");
  assert.equal(completed.body.data.profile.usualWakeTime, "17:00");
  assert.equal(completed.body.data.profile.usualSleepTime, "09:00");

  const storedNightProfile = await apiRequest<OnboardingReadData>(baseUrl, "/api/onboarding", {
    token: accessToken,
  });
  assert.equal(storedNightProfile.status, 200);
  expectSuccess(storedNightProfile.body);
  assert.equal(storedNightProfile.body.data.profile?.workScheduleType, "NIGHT_SHIFT");

  const updated = await apiRequest<OnboardingCompleteData>(baseUrl, "/api/onboarding", {
    method: "POST",
    token: accessToken,
    body: {
      ...nightShiftProfile,
      workScheduleType: "VARIABLE_SHIFT",
      usualWakeTime: "06:30",
      usualSleepTime: "22:30",
    },
  });
  assert.equal(updated.status, 200);
  expectSuccess(updated.body);
  assert.equal(updated.body.data.profile.workScheduleType, "VARIABLE_SHIFT");
  assert.equal(updated.body.data.profile.usualWakeTime, "06:30");
  assert.equal(updated.body.data.profile.usualSleepTime, "22:30");

  const storedUpdatedProfile = await apiRequest<OnboardingReadData>(baseUrl, "/api/onboarding", {
    token: accessToken,
  });
  expectSuccess(storedUpdatedProfile.body);
  assert.equal(storedUpdatedProfile.body.data.profile?.workScheduleType, "VARIABLE_SHIFT");

  const baselineWeightRows = await prisma.weightLog.count({ where: { userId } });
  assert.equal(baselineWeightRows, 1, "profile edits must not duplicate the immutable starting weight");

  const me = await apiRequest<MeData>(baseUrl, "/api/auth/me", { token: accessToken });
  assert.equal(me.status, 200);
  expectSuccess(me.body);
  assert.equal(me.body.data.user.onboardingCompleted, true);
});
