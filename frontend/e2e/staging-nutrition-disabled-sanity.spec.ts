import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { NutritionPlanRecord } from "../src/infrastructure/nutrition/nutrition-plan-client";
import { createDashboardSession, loginDashboardSession } from "./dashboard-test-session";

const web = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const api = process.env.E2E_API_BASE_URL || "http://127.0.0.1:4000/api";
for (const target of [web, api]) {
  if (!["staging.diewish.com", "localhost", "127.0.0.1"].includes(new URL(target).hostname))
    throw new Error("Nutrition release check refuses non-staging/non-local hosts.");
}

test("staging nutrition remains disabled; legacy plan, session, Dashboard and Coach remain usable", async ({ page, request }) => {
  test.setTimeout(300_000);
  const existingEmail = process.env.NUTRITION_ACCEPTANCE_EXISTING_EMAIL;
  const existingPassword = process.env.NUTRITION_ACCEPTANCE_EXISTING_PASSWORD;
  if (!!existingEmail !== !!existingPassword) throw new Error("Both synthetic-account inputs are required.");
  if (existingEmail && !/^dashboard\.browser\.[0-9]+\.[0-9a-f]+@example\.com$/.test(existingEmail))
    throw new Error("Reuse is restricted to the generated synthetic test accounts.");
  const reuseExisting = !!existingEmail && !!existingPassword;
  const account = reuseExisting ? await (async () => {
    const response = await request.post(`${api}/auth/login`, {
      data: { email: existingEmail, password: existingPassword },
    });
    expect(response.status()).toBe(200);
    const session = (await response.json()).data;
    await loginDashboardSession(page, existingEmail!, existingPassword!);
    return { email: existingEmail!, password: existingPassword!, token: session.tokens.accessToken };
  })() : await createDashboardSession(page, request);
  const browserNutritionStatuses: number[] = [];
  const refreshStatuses: number[] = [];
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path === "/api/nutrition-plans") browserNutritionStatuses.push(response.status());
    if (path === "/api/auth/refresh-token") refreshStatuses.push(response.status());
  });
  const waitForAuthenticatedShell = async () => {
    try {
      await expect(page.locator("[data-app-shell]")).toBeVisible({ timeout: 20_000 });
    } catch (error) {
      console.log("STAGING_NUTRITION_SESSION_DIAGNOSTIC " + JSON.stringify({
        pathname: new URL(page.url()).pathname, browserNutritionStatuses, refreshStatuses,
      }));
      throw error;
    }
  };
  const headers = { authorization: `Bearer ${account.token}` };
  const read = (path: string) => request.get(`${api}${path}`, { headers });
  for (const path of ["/health", "/health/ready"]) expect((await read(path)).ok(), path).toBe(true);
  const capability = await read("/nutrition-plans/generation-jobs/capabilities");
  expect(capability.ok()).toBe(true);
  expect((await capability.json()).data.resumable).toBe(false);
  for (const path of ["/nutrition-plans/generation-jobs/current", "/nutrition-plans/generation-jobs/rights?kind=NEW_PLAN"]) {
    const response = await read(path);
    expect(response.status(), path).toBe(404);
    expect((await response.json()).error.code).toBe("NUTRITION_JOBS_DISABLED");
  }
  if (!reuseExisting) {
    const start = await request.post(`${api}/nutrition-plans/generation-jobs`, {
      headers, data: { duration: "SEVEN_DAY", requestKey: randomUUID() },
    });
    expect(start.status()).toBe(404);
    expect((await start.json()).error.code).toBe("NUTRITION_JOBS_DISABLED");
  }
  const before = await read("/ai-usage?feature=NUTRITION_PLAN");
  expect(before.ok()).toBe(true);
  const legacy = (await before.json()).data.usage[0];
  expect(legacy.day.limit).toBe(3);
  expect(legacy.month.limit).toBe(15);
  expect(legacy.trial?.limit).toBe(1);
  let plan: NutritionPlanRecord;
  if (reuseExisting) {
    const response = await read("/nutrition-plans");
    expect(response.ok()).toBe(true);
    const plans: NutritionPlanRecord[] = (await response.json()).data.plans;
    const existing = plans.find((row) => row.isActive && row.status === "COMPLETED" && row.duration === "SEVEN_DAY");
    if (!existing) throw new Error("No completed active synthetic 7-day plan is available; no AI request was made.");
    plan = existing;
  } else {
    // Exactly one explicit legacy request on a new synthetic account; no speculative jobs.
    const generationStarted = Date.now();
    const generated = await request.post(`${api}/nutrition-plans/generate`, {
      headers, data: { duration: "SEVEN_DAY" }, timeout: 175_000,
    });
    const generatedBody = await generated.json().catch(() => null);
    if (generated.status() !== 201) {
      const knownCodes = new Set([
        "AI_PROVIDER_UNREACHABLE", "AI_PROVIDER_ERROR", "AI_PROVIDER_MALFORMED",
        "AI_PROVIDER_EMPTY", "AI_PROVIDER_INCOMPLETE", "AI_PROVIDER_BLOCKED", "VERTEX_CREDENTIALS_UNAVAILABLE",
        "NUTRITION_PLAN_INCOMPLETE", "NUTRITION_PLAN_MEAL_STRUCTURE_MISMATCH",
        "NUTRITION_PLAN_ALLERGEN_VALIDATION_FAILED", "NUTRITION_PLAN_TARGET_MISMATCH",
        "NUTRITION_PLAN_REALISM_VALIDATION_FAILED", "NUTRITION_PLAN_GENERATION_TIMEOUT",
        "NUTRITION_PLAN_GENERATION_BUSY", "INTERNAL_SERVER_ERROR",
      ]);
      const code = generatedBody?.error?.code;
      console.log("STAGING_NUTRITION_HTTP_DIAGNOSTIC " + JSON.stringify({
        status: generated.status(), elapsedMs: Date.now() - generationStarted,
        code: knownCodes.has(code) ? code : "UNCLASSIFIED",
        jsonEnvelope: generatedBody?.success === false && !!generatedBody?.error,
      }));
    }
    expect(generated.status()).toBe(201);
    plan = generatedBody.data.plan;
  }
  expect(plan.status).toBe("COMPLETED");
  expect(plan.isActive).toBe(true);
  expect(plan.dailyPlans.cycle).toHaveLength(7);
  const saved = await read(`/nutrition-plans/${plan.id}`);
  expect(saved.ok()).toBe(true);
  expect((await saved.json()).data.plan.id).toBe(plan.id);
  const listed = await read("/nutrition-plans");
  expect(listed.ok()).toBe(true);
  const listedPlans = (await listed.json()).data.plans;
  expect(listedPlans.some((row: { id: string; isActive: boolean }) => row.id === plan.id && row.isActive)).toBe(true);
  const after = await read("/ai-usage?feature=NUTRITION_PLAN");
  expect(after.ok()).toBe(true);
  expect((await after.json()).data.usage[0].trial.remaining).toBe(0);
  for (const path of ["/dashboard", "/ai", "/meals/plan"]) {
    await page.goto(`${web}${path}`);
    // URL matching can still observe the session-restoration splash. Wait for
    // authenticated content before navigating away from a rotating refresh.
    await waitForAuthenticatedShell();
    await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}(?:$|\\?)`));
    await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error/);
  }
  await expect(page.getByRole("button", { name: "Öğünü Değiştir", exact: true })).toHaveCount(0);
  try {
    await expect(page.getByRole("heading", { name: "7 günlük kişisel plan", exact: true })).toBeVisible({ timeout: 20_000 });
  } catch (error) {
    console.log("STAGING_NUTRITION_UI_DIAGNOSTIC " + JSON.stringify({
      pathname: new URL(page.url()).pathname, browserNutritionStatuses, refreshStatuses,
      loading: await page.getByText("Öğün planın yükleniyor…", { exact: true }).count(),
      contentUnavailable: await page.getByText(/Bu planın öğün içeriği görüntülenemiyor/).count(),
      expectedHeadingCount: await page.getByRole("heading", { name: "7 günlük kişisel plan", exact: true }).count(),
    }));
    throw error;
  }
  await page.context().clearCookies();
  await loginDashboardSession(page, account.email, account.password);
  await page.goto(`${web}/meals/plan`);
  await waitForAuthenticatedShell();
  try {
    await expect(page.getByRole("heading", { name: "7 günlük kişisel plan", exact: true })).toBeVisible({ timeout: 20_000 });
  } catch (error) {
    console.log("STAGING_NUTRITION_UI_DIAGNOSTIC " + JSON.stringify({
      pathname: new URL(page.url()).pathname, browserNutritionStatuses, refreshStatuses,
      loading: await page.getByText("Öğün planın yükleniyor…", { exact: true }).count(),
      contentUnavailable: await page.getByText(/Bu planın öğün içeriği görüntülenemiyor/).count(),
      expectedHeadingCount: await page.getByRole("heading", { name: "7 günlük kişisel plan", exact: true }).count(),
    }));
    throw error;
  }
  console.log("STAGING_NUTRITION_MODE " + JSON.stringify({ reusedExistingPlan: reuseExisting, generationRequests: reuseExisting ? 0 : 1 }));
  console.log("STAGING_NUTRITION_DISABLED: legacy 7-day plan, session/relogin, Dashboard, Coach, unchanged Free quotas and disabled job/meal controls PASS");
});
