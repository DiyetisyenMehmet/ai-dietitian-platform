import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp } from "../app";
import { prisma } from "../lib/prisma";
import { nutritionDataRepository } from "../modules/nutrition-data/nutrition-data.repository";
import type { CanonicalFood } from "../modules/nutrition-data/nutrition-data.types";

type ApiEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

interface AuthData {
  user: { id: string; email: string };
  tokens: { accessToken: string };
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

function cachedFood(externalId: string): CanonicalFood {
  return {
    externalId,
    provider: "USDA",
    name: "Chicken breast, cooked",
    displayNameTr: "Pişmiş tavuk göğsü",
    brand: null,
    barcode: null,
    imageUrl: null,
    quantity: null,
    serving: null,
    nutrientsPer100g: {
      energyKcal: 165,
      proteinG: 31,
      carbohydratesG: 0,
      fatG: 3.6,
      saturatedFatG: 1,
      sugarsG: 0,
      fiberG: 0,
      sodiumMg: 74,
      saltG: 0.185,
    },
    ingredients: [],
    allergens: [],
    additives: [],
    labels: [],
    vegan: false,
    vegetarian: false,
    glutenFree: true,
    nutriScore: null,
    novaGroup: null,
    provenance: {
      provider: "USDA",
      externalId,
      retrievedAt: new Date().toISOString(),
      dataBasis: "PER_100_G",
      confidence: 0.95,
      sourceReference: "integration-cache",
    },
  };
}

test("nutrition routes enforce consent, read persistent cache and validate deterministic inputs", async (t) => {
  const stamp = Date.now();
  const email = `nutrition.integration.${stamp}@example.com`;
  const password = "IntegrationPass123";
  const externalId = `integration-${stamp}`;

  await prisma.user.deleteMany({ where: { email } });
  const { server, baseUrl } = await startServer();

  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await prisma.$executeRaw`DELETE FROM nutrition_food_aliases WHERE provider = 'USDA' AND external_id = ${externalId}`;
    await prisma.$executeRaw`DELETE FROM nutrition_foods WHERE provider = 'USDA' AND external_id = ${externalId}`;
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  const unauthenticated = await apiRequest<unknown>(baseUrl, "/api/nutrition/search?q=tavuk");
  assert.equal(unauthenticated.status, 401);
  expectFailure(unauthenticated.body);

  const registration = await apiRequest<AuthData>(baseUrl, "/api/auth/register", {
    method: "POST",
    body: { email, password, fullName: "Nutrition Integration" },
  });
  assert.equal(registration.status, 201);
  expectSuccess(registration.body);
  const token = registration.body.data.tokens.accessToken;

  const blocked = await apiRequest<unknown>(baseUrl, "/api/nutrition/search?q=tavuk", { token });
  assert.equal(blocked.status, 403);
  expectFailure(blocked.body);
  assert.equal(blocked.body.error.code, "CONSENT_REQUIRED");

  for (const type of ["TERMS_OF_SERVICE", "MEDICAL_DISCLAIMER", "KVKK_EXPLICIT_CONSENT"] as const) {
    const consent = await apiRequest<unknown>(baseUrl, "/api/legal/consents", {
      method: "POST",
      token,
      body: { type },
    });
    assert.equal(consent.status, 200);
    expectSuccess(consent.body);
  }

  const food = cachedFood(externalId);
  await nutritionDataRepository.upsertFood(food, new Date(Date.now() + 60 * 60 * 1000));

  const search = await apiRequest<{ foods: CanonicalFood[] }>(
    baseUrl,
    "/api/nutrition/search?q=Pi%C5%9Fmi%C5%9F%20tavuk%20g%C3%B6%C4%9Fs%C3%BC",
    { token },
  );
  assert.equal(search.status, 200);
  expectSuccess(search.body);
  assert.equal(search.body.data.foods[0]?.externalId, externalId);
  assert.equal(search.body.data.foods[0]?.nutrientsPer100g.energyKcal, 165);

  const personalized = await apiRequest<{
    personalization: { nutrients: CanonicalFood["nutrientsPer100g"]; metrics: unknown; profileContextUsed: boolean };
  }>(baseUrl, "/api/nutrition/personalize-nutrients", {
    method: "POST",
    token,
    body: { nutrients: food.nutrientsPer100g },
  });
  assert.equal(personalized.status, 200);
  expectSuccess(personalized.body);
  assert.equal(personalized.body.data.personalization.nutrients.energyKcal, 165);
  assert.equal(personalized.body.data.personalization.metrics, null);
  assert.equal(personalized.body.data.personalization.profileContextUsed, false);

  const invalid = await apiRequest<unknown>(baseUrl, "/api/nutrition/personalize-nutrients", {
    method: "POST",
    token,
    body: { nutrients: { ...food.nutrientsPer100g, energyKcal: -1 } },
  });
  assert.equal(invalid.status, 400);
  expectFailure(invalid.body);
});
