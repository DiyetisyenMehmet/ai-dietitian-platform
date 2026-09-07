import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp } from "../app";
import { prisma } from "../lib/prisma";
import {
  setAIAdapter,
} from "../modules/blood-test-analysis/ai-adapter/ai-adapter.factory";
import type { IAIAdapter } from "../modules/blood-test-analysis/ai-adapter/ai-adapter.interface";

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

interface SendMessageData {
  conversationId: string;
  message: {
    id: string;
    role: "USER" | "ASSISTANT";
    content: string;
    provider: string | null;
    model: string | null;
    createdAt: string;
  };
}

interface ConversationSummary {
  id: string;
  title: string | null;
}

interface ConversationDetail extends ConversationSummary {
  messages: Array<{
    role: "USER" | "ASSISTANT";
    content: string;
  }>;
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

async function unusedProviderMethod(): Promise<never> {
  throw new Error("Unexpected provider method in AI Coach integration test.");
}

const providerCalls: Array<{ message: string; historyLength: number }> = [];
const fakeAdapter: IAIAdapter = {
  info: { provider: "integration-fake", model: "coach-contract-v1" },
  validateBloodTestDocument: unusedProviderMethod,
  extractBloodTestValues: unusedProviderMethod,
  analyzeBloodTestValues: unusedProviderMethod,
  generateNutritionPlan: unusedProviderMethod,
  async chatWithDietitian(input) {
    providerCalls.push({ message: input.message, historyLength: input.history.length });
    return { reply: `Entegrasyon koçu yanıtı: ${input.message}` };
  },
};

test("AI Coach: consent gate -> provider -> persistence -> usage", async (t) => {
  const email = `coach.integration.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;
  const password = "CoachIntegration123";
  providerCalls.length = 0;
  setAIAdapter(fakeAdapter);

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
    body: { email, password, fullName: "Coach Integration User" },
  });
  assert.equal(registration.status, 201);
  expectSuccess(registration.body);

  const { accessToken } = registration.body.data.tokens;
  const userId = registration.body.data.user.id;

  const blocked = await apiRequest<SendMessageData>(baseUrl, "/api/ai-chat/messages", {
    method: "POST",
    token: accessToken,
    body: { message: "Bugün öğün düzenimi nasıl koruyabilirim?" },
  });
  assert.equal(blocked.status, 403);
  expectFailure(blocked.body);
  assert.equal(blocked.body.error.code, "CONSENT_REQUIRED");
  assert.equal(providerCalls.length, 0, "provider must not run before mandatory consent");
  assert.equal(
    await prisma.aiUsageEvent.count({ where: { userId, feature: "DIETITIAN_CHAT" } }),
    0,
    "blocked requests must not consume AI Coach quota",
  );

  for (const type of [
    "TERMS_OF_SERVICE",
    "MEDICAL_DISCLAIMER",
    "KVKK_EXPLICIT_CONSENT",
  ] as const) {
    const consent = await apiRequest<unknown>(baseUrl, "/api/legal/consents", {
      method: "POST",
      token: accessToken,
      body: { type },
    });
    assert.equal(consent.status, 200);
    expectSuccess(consent.body);
  }

  const onboarding = await apiRequest<unknown>(baseUrl, "/api/onboarding", {
    method: "POST",
    token: accessToken,
    body: {
      fullName: "Coach Integration User",
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
    },
  });
  assert.equal(onboarding.status, 200);
  expectSuccess(onboarding.body);

  const userText = "Akşam yemeğine kadar dengeli kalmak için ne yapabilirim?";
  const sent = await apiRequest<SendMessageData>(baseUrl, "/api/ai-chat/messages", {
    method: "POST",
    token: accessToken,
    body: { message: userText },
  });
  assert.equal(sent.status, 201);
  expectSuccess(sent.body);
  assert.equal(sent.body.data.message.role, "ASSISTANT");
  assert.match(sent.body.data.message.content, /Entegrasyon koçu yanıtı/);
  assert.equal(sent.body.data.message.provider, "integration-fake");
  assert.equal(sent.body.data.message.model, "coach-contract-v1");
  assert.equal(providerCalls.length, 1);
  assert.deepEqual(providerCalls[0], { message: userText, historyLength: 0 });

  assert.equal(
    await prisma.aiUsageEvent.count({ where: { userId, feature: "DIETITIAN_CHAT" } }),
    1,
    "only the successful provider turn should consume one AI Coach usage event",
  );

  const list = await apiRequest<{ conversations: ConversationSummary[] }>(
    baseUrl,
    "/api/ai-chat/conversations",
    { token: accessToken },
  );
  assert.equal(list.status, 200);
  expectSuccess(list.body);
  assert.equal(list.body.data.conversations.length, 1);
  assert.equal(list.body.data.conversations[0].id, sent.body.data.conversationId);

  const detail = await apiRequest<{ conversation: ConversationDetail }>(
    baseUrl,
    `/api/ai-chat/conversations/${sent.body.data.conversationId}`,
    { token: accessToken },
  );
  assert.equal(detail.status, 200);
  expectSuccess(detail.body);
  assert.deepEqual(
    detail.body.data.conversation.messages.map((message) => message.role),
    ["USER", "ASSISTANT"],
  );
  assert.equal(detail.body.data.conversation.messages[0].content, userText);
  assert.match(detail.body.data.conversation.messages[1].content, /Entegrasyon koçu yanıtı/);
});
