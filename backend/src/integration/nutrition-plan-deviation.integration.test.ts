import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { Prisma } from "@prisma/client";

import { createApp } from "../app";
import { prisma } from "../lib/prisma";

type ApiEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

interface AuthData {
  user: { id: string; email: string };
  tokens: { accessToken: string };
}

interface DeviationView {
  id: string;
  dayNumber: number;
  mealIndex: number | null;
  foodIndex: number | null;
  scope: "FOOD" | "MEAL" | "DAY";
  type: "SKIPPED" | "REPLACED" | "EXTRA" | "PORTION_CHANGED";
  plannedItemName: string | null;
  actualItemName: string | null;
  plannedPortion: string | null;
  actualPortion: string | null;
}

function expectSuccess<T>(body: ApiEnvelope<T>): asserts body is { success: true; data: T } {
  assert.equal(body.success, true);
}

function expectFailure<T>(body: ApiEnvelope<T>): asserts body is { success: false; error: { code: string; message: string; details?: unknown } } {
  assert.equal(body.success, false);
}

async function apiRequest<T>(
  baseUrl: string,
  path: string,
  options: { method?: "GET" | "POST" | "DELETE"; token?: string; body?: unknown } = {},
): Promise<{ status: number; body: ApiEnvelope<T> | null }> {
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
    body: response.status === 204 ? null : ((await response.json()) as ApiEnvelope<T>),
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

function localYmd(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function register(baseUrl: string, email: string, password: string): Promise<AuthData> {
  const response = await apiRequest<AuthData>(baseUrl, "/api/auth/register", {
    method: "POST",
    body: { email, password, fullName: "Kaçamak Integration" },
  });
  assert.equal(response.status, 201);
  assert.ok(response.body);
  expectSuccess(response.body);
  return response.body.data;
}

async function grantConsents(baseUrl: string, token: string): Promise<void> {
  for (const type of ["TERMS_OF_SERVICE", "MEDICAL_DISCLAIMER", "KVKK_EXPLICIT_CONSENT"] as const) {
    const response = await apiRequest<unknown>(baseUrl, "/api/legal/consents", {
      method: "POST",
      token,
      body: { type },
    });
    assert.equal(response.status, 200);
  }
}

function planContent() {
  const longFoodName = "Domates, salatalık, maydanoz ve mevsim yeşillikleri ile hazırlanmış uzun isimli salata";
  const cycle = Array.from({ length: 7 }, (_, index) => ({
    dayLabel: `${index + 1}. Gün`,
    meals: [
      {
        name: "Kahvaltı",
        time: "08:00",
        foods: [
          { name: "Tam buğday ekmeği", portion: "100 g", calories: 200 },
          { name: longFoodName, portion: "1 porsiyon", calories: 80 },
        ],
        calories: 280,
        proteinGrams: 12,
        carbsGrams: 48,
        fatGrams: 6,
        explanation: "Test öğünü",
      },
      {
        name: "Öğle Yemeği",
        time: "13:00",
        foods: [{ name: "Yoğurt", portion: "200 g", calories: 120 }],
        calories: 120,
        proteinGrams: 8,
        carbsGrams: 10,
        fatGrams: 5,
        explanation: "Test öğünü",
      },
    ],
    totalCalories: 400,
    totalProteinGrams: 20,
    totalCarbsGrams: 58,
    totalFatGrams: 11,
  }));
  return {
    durationDays: 7,
    cycleLengthDays: 7,
    cycle,
    calendar: Array.from({ length: 7 }, (_, index) => ({ dayNumber: index + 1, cycleIndex: index })),
  };
}

async function seedPlan(userId: string) {
  const content = planContent();
  const plan = await prisma.nutritionPlan.create({
    data: {
      userId,
      startDate: new Date(`${localYmd()}T00:00:00.000Z`),
      duration: "SEVEN_DAY",
      version: 1,
      isActive: true,
      status: "COMPLETED",
      bmr: 1600,
      tdee: 2200,
      dailyCalories: 1900,
      proteinGrams: 120,
      carbsGrams: 210,
      fatGrams: 60,
      waterMl: 2500,
      mealsPerDay: 2,
      mealTiming: { mealsPerDay: 2, slots: [] } as Prisma.InputJsonValue,
      dailyPlans: content as Prisma.InputJsonValue,
      explanations: {} as Prisma.InputJsonValue,
      recommendations: [] as Prisma.InputJsonValue,
      summary: "Kaçamak integration plan",
    },
  });
  return { plan, content };
}

async function setPaid(userId: string, tier: "PREMIUM" | "PREMIUM_PLUS"): Promise<void> {
  const now = new Date();
  const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { subscriptionTier: tier } }),
    prisma.subscription.deleteMany({ where: { userId } }),
    prisma.subscription.create({
      data: {
        userId,
        tier,
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: end,
      },
    }),
  ]);
}

async function setFree(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.subscription.updateMany({ where: { userId }, data: { status: "EXPIRED" } }),
    prisma.user.update({ where: { id: userId }, data: { subscriptionTier: "FREE" } }),
  ]);
}

async function createDeviation(
  baseUrl: string,
  token: string,
  planId: string,
  body: Record<string, unknown>,
) {
  return apiRequest<{ deviation: DeviationView }>(baseUrl, `/api/nutrition-plans/${planId}/deviations`, {
    method: "POST",
    token,
    body: { localDate: localYmd(), ...body },
  });
}

test("Kaçamak lifecycle preserves plan snapshot, enforces entitlement/isolation/conflicts and uses MealLog once", async (t) => {
  const stamp = `${Date.now()}.${Math.random().toString(16).slice(2)}`;
  const email = `kacamak.a.${stamp}@example.com`;
  const otherEmail = `kacamak.b.${stamp}@example.com`;
  const password = "KacamakIntegration123";

  await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
  const { server, baseUrl } = await startServer();

  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    await prisma.$disconnect();
  });

  const primary = await register(baseUrl, email, password);
  const other = await register(baseUrl, otherEmail, password);
  await grantConsents(baseUrl, primary.tokens.accessToken);
  await grantConsents(baseUrl, other.tokens.accessToken);

  const { plan, content } = await seedPlan(primary.user.id);
  const { plan: otherPlan } = await seedPlan(other.user.id);
  const snapshotBefore = JSON.stringify(content);

  // FREE create is rejected by backend; READ remains available.
  const freeCreate = await createDeviation(baseUrl, primary.tokens.accessToken, plan.id, {
    dayNumber: 1,
    mealIndex: 0,
    foodIndex: 0,
    scope: "FOOD",
    type: "SKIPPED",
  });
  assert.equal(freeCreate.status, 403);
  assert.ok(freeCreate.body);
  expectFailure(freeCreate.body);
  assert.equal(freeCreate.body.error.code, "SUBSCRIPTION_REQUIRED");

  await setPaid(primary.user.id, "PREMIUM");

  // FOOD + SKIPPED; retry/double-submit is idempotent and creates no MealLog.
  const skipBody = {
    dayNumber: 1,
    mealIndex: 0,
    foodIndex: 0,
    scope: "FOOD",
    type: "SKIPPED",
  } as const;
  const [skipA, skipB] = await Promise.all([
    createDeviation(baseUrl, primary.tokens.accessToken, plan.id, skipBody),
    createDeviation(baseUrl, primary.tokens.accessToken, plan.id, skipBody),
  ]);
  assert.equal(skipA.status, 201);
  assert.equal(skipB.status, 201);
  assert.ok(skipA.body && skipB.body);
  expectSuccess(skipA.body);
  expectSuccess(skipB.body);
  assert.equal(skipA.body.data.deviation.id, skipB.body.data.deviation.id);
  assert.equal(
    await prisma.nutritionPlanDeviation.count({ where: { userId: primary.user.id, planId: plan.id } }),
    1,
  );
  assert.equal(await prisma.mealLog.count({ where: { id: skipA.body.data.deviation.id } }), 0);

  // Same planned food cannot carry a contradictory active main deviation.
  const conflict = await createDeviation(baseUrl, primary.tokens.accessToken, plan.id, {
    dayNumber: 1,
    mealIndex: 0,
    foodIndex: 0,
    scope: "FOOD",
    type: "REPLACED",
    actualItemName: "Yoğurt",
  });
  assert.equal(conflict.status, 409);

  // Whole-meal skip conflicts with food-level main deviation and carries no foodIndex.
  const mealConflict = await createDeviation(baseUrl, primary.tokens.accessToken, plan.id, {
    dayNumber: 1,
    mealIndex: 0,
    scope: "MEAL",
    type: "SKIPPED",
  });
  assert.equal(mealConflict.status, 409);

  const removeSkip = await apiRequest<unknown>(
    baseUrl,
    `/api/nutrition-plans/${plan.id}/deviations/${skipA.body.data.deviation.id}`,
    { method: "DELETE", token: primary.tokens.accessToken },
  );
  assert.equal(removeSkip.status, 204);

  const wholeMeal = await createDeviation(baseUrl, primary.tokens.accessToken, plan.id, {
    dayNumber: 1,
    mealIndex: 0,
    scope: "MEAL",
    type: "SKIPPED",
  });
  assert.equal(wholeMeal.status, 201);
  assert.ok(wholeMeal.body);
  expectSuccess(wholeMeal.body);
  assert.equal(wholeMeal.body.data.deviation.foodIndex, null);
  await apiRequest<unknown>(
    baseUrl,
    `/api/nutrition-plans/${plan.id}/deviations/${wholeMeal.body.data.deviation.id}`,
    { method: "DELETE", token: primary.tokens.accessToken },
  );

  // REPLACED is FOOD-only and reliable nutrition is written exactly once to MealLog.
  const invalidMealReplacement = await createDeviation(baseUrl, primary.tokens.accessToken, plan.id, {
    dayNumber: 1,
    mealIndex: 0,
    scope: "MEAL",
    type: "REPLACED",
    actualItemName: "Yoğurt",
  });
  assert.equal(invalidMealReplacement.status, 400);

  const replacedBody = {
    dayNumber: 1,
    mealIndex: 0,
    foodIndex: 0,
    scope: "FOOD",
    type: "REPLACED",
    actualItemName: "Yoğurt",
    actualPortion: "150 g",
    actualNutrition: { calories: 120, proteinG: 8, carbsG: 10, fatG: 5 },
  } as const;
  const [replacedA, replacedB] = await Promise.all([
    createDeviation(baseUrl, primary.tokens.accessToken, plan.id, replacedBody),
    createDeviation(baseUrl, primary.tokens.accessToken, plan.id, replacedBody),
  ]);
  assert.equal(replacedA.status, 201);
  assert.equal(replacedB.status, 201);
  assert.ok(replacedA.body && replacedB.body);
  expectSuccess(replacedA.body);
  expectSuccess(replacedB.body);
  assert.equal(replacedA.body.data.deviation.id, replacedB.body.data.deviation.id);
  const replacementLog = await prisma.mealLog.findUnique({ where: { id: replacedA.body.data.deviation.id } });
  assert.ok(replacementLog);
  assert.equal(replacementLog.name, "Yoğurt");
  assert.equal(replacementLog.calories, 120);
  assert.equal(replacementLog.proteinG, 8);
  assert.equal(await prisma.mealLog.count({ where: { id: replacedA.body.data.deviation.id } }), 1);

  // IDOR: another user cannot read or delete the owner's plan/deviation.
  const otherRead = await apiRequest<unknown>(baseUrl, `/api/nutrition-plans/${plan.id}/deviations`, {
    token: other.tokens.accessToken,
  });
  assert.equal(otherRead.status, 404);
  const otherDelete = await apiRequest<unknown>(
    baseUrl,
    `/api/nutrition-plans/${plan.id}/deviations/${replacedA.body.data.deviation.id}`,
    { method: "DELETE", token: other.tokens.accessToken },
  );
  assert.equal(otherDelete.status, 404);
  assert.ok(otherPlan.id);

  // Downgrade preserves READ and DELETE/UNDO; deleting deviation removes only its linked MealLog.
  await setFree(primary.user.id);
  const readAfterDowngrade = await apiRequest<{ deviations: DeviationView[] }>(
    baseUrl,
    `/api/nutrition-plans/${plan.id}/deviations`,
    { token: primary.tokens.accessToken },
  );
  assert.equal(readAfterDowngrade.status, 200);
  const deleteAfterDowngrade = await apiRequest<unknown>(
    baseUrl,
    `/api/nutrition-plans/${plan.id}/deviations/${replacedA.body.data.deviation.id}`,
    { method: "DELETE", token: primary.tokens.accessToken },
  );
  assert.equal(deleteAfterDowngrade.status, 204);
  assert.equal(await prisma.mealLog.count({ where: { id: replacedA.body.data.deviation.id } }), 0);

  // Premium Plus CREATE works.
  await setPaid(primary.user.id, "PREMIUM_PLUS");

  // EXTRA is real intake in MealLog and multiple distinct extras are allowed.
  const extraA = await createDeviation(baseUrl, primary.tokens.accessToken, plan.id, {
    dayNumber: 1,
    mealIndex: 0,
    scope: "MEAL",
    type: "EXTRA",
    actualItemName: "Pasta",
    actualPortion: "1 dilim",
    actualNutrition: { calories: 250, proteinG: 4, carbsG: 35, fatG: 10 },
  });
  const extraB = await createDeviation(baseUrl, primary.tokens.accessToken, plan.id, {
    dayNumber: 1,
    mealIndex: 0,
    scope: "MEAL",
    type: "EXTRA",
    actualItemName: "Ayran",
    actualPortion: "200 ml",
    actualNutrition: { calories: 70, proteinG: 4, carbsG: 6, fatG: 3 },
  });
  assert.equal(extraA.status, 201);
  assert.equal(extraB.status, 201);
  assert.ok(extraA.body && extraB.body);
  expectSuccess(extraA.body);
  expectSuccess(extraB.body);
  const extraLogs = await prisma.mealLog.findMany({
    where: { id: { in: [extraA.body.data.deviation.id, extraB.body.data.deviation.id] } },
  });
  assert.equal(extraLogs.length, 2);
  assert.equal(extraLogs.reduce((sum, item) => sum + (item.calories ?? 0), 0), 320);

  // Invalid/zero portion is rejected; valid portion derives calories from planned food without inventing macros.
  const invalidPortion = await createDeviation(baseUrl, primary.tokens.accessToken, plan.id, {
    dayNumber: 1,
    mealIndex: 1,
    foodIndex: 0,
    scope: "FOOD",
    type: "PORTION_CHANGED",
    actualPortion: "0 g",
  });
  assert.equal(invalidPortion.status, 400);

  const portion = await createDeviation(baseUrl, primary.tokens.accessToken, plan.id, {
    dayNumber: 1,
    mealIndex: 1,
    foodIndex: 0,
    scope: "FOOD",
    type: "PORTION_CHANGED",
    actualPortion: "300 g",
  });
  assert.equal(portion.status, 201);
  assert.ok(portion.body);
  expectSuccess(portion.body);
  const portionLog = await prisma.mealLog.findUnique({ where: { id: portion.body.data.deviation.id } });
  assert.ok(portionLog);
  assert.equal(portionLog.calories, 180);
  assert.equal(portionLog.proteinG, null);

  // Future plan day is blocked on the backend using the caller's local calendar date.
  const futureDay = await createDeviation(baseUrl, primary.tokens.accessToken, plan.id, {
    dayNumber: 2,
    mealIndex: 0,
    foodIndex: 0,
    scope: "FOOD",
    type: "SKIPPED",
  });
  assert.equal(futureDay.status, 400);

  // Empty replacement/extra are rejected by request validation.
  const emptyReplacement = await createDeviation(baseUrl, primary.tokens.accessToken, plan.id, {
    dayNumber: 1,
    mealIndex: 0,
    foodIndex: 1,
    scope: "FOOD",
    type: "REPLACED",
    actualItemName: " ",
  });
  assert.equal(emptyReplacement.status, 400);
  const emptyExtra = await createDeviation(baseUrl, primary.tokens.accessToken, plan.id, {
    dayNumber: 1,
    mealIndex: 0,
    scope: "MEAL",
    type: "EXTRA",
    actualItemName: " ",
  });
  assert.equal(emptyExtra.status, 400);

  // Plan snapshot/calendar remain byte-for-byte unchanged after all Kaçamak mutations.
  const planAfter = await prisma.nutritionPlan.findUniqueOrThrow({ where: { id: plan.id } });
  assert.equal(JSON.stringify(planAfter.dailyPlans), snapshotBefore);
  assert.equal(planAfter.startDate.toISOString().slice(0, 10), localYmd());
});
