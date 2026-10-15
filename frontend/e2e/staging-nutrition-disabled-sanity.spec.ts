import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createDashboardSession, loginDashboardSession } from "./dashboard-test-session";

const web = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const api = process.env.E2E_API_BASE_URL || "http://127.0.0.1:4000/api";
for (const target of [web, api]) {
  if (!["staging.diewish.com", "localhost", "127.0.0.1"].includes(new URL(target).hostname))
    throw new Error("Nutrition release check refuses non-staging/non-local hosts.");
}

test("staging nutrition remains disabled; legacy plan, session, Dashboard and Coach remain usable", async ({ page, request }) => {
  test.setTimeout(300_000);
  const account = await createDashboardSession(page, request);
  const browserNutritionStatuses: number[] = [];
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/api/nutrition-plans")
      browserNutritionStatuses.push(response.status());
  });
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
  const start = await request.post(`${api}/nutrition-plans/generation-jobs`, {
    headers, data: { duration: "SEVEN_DAY", requestKey: randomUUID() },
  });
  expect(start.status()).toBe(404);
  expect((await start.json()).error.code).toBe("NUTRITION_JOBS_DISABLED");
  const before = await read("/ai-usage?feature=NUTRITION_PLAN");
  expect(before.ok()).toBe(true);
  const legacy = (await before.json()).data.usage[0];
  expect(legacy.day.limit).toBe(3);
  expect(legacy.month.limit).toBe(15);
  expect(legacy.trial?.limit).toBe(1);
  // Exactly one explicit legacy request on a new synthetic account; no speculative jobs.
  const generated = await request.post(`${api}/nutrition-plans/generate`, {
    headers, data: { duration: "SEVEN_DAY" }, timeout: 175_000,
  });
  expect(generated.status()).toBe(201);
  const plan = (await generated.json()).data.plan;
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
    await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}(?:$|\\?)`));
    await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error/);
  }
  await expect(page.getByRole("button", { name: "Öğünü Değiştir", exact: true })).toHaveCount(0);
  try {
    await expect(page.getByRole("heading", { name: "7 günlük kişisel plan", exact: true })).toBeVisible({ timeout: 20_000 });
  } catch (error) {
    console.log("STAGING_NUTRITION_UI_DIAGNOSTIC " + JSON.stringify({
      pathname: new URL(page.url()).pathname, browserNutritionStatuses,
      loading: await page.getByText("Öğün planın yükleniyor…", { exact: true }).count(),
      contentUnavailable: await page.getByText(/Bu planın öğün içeriği görüntülenemiyor/).count(),
      expectedHeadingCount: await page.getByRole("heading", { name: "7 günlük kişisel plan", exact: true }).count(),
    }));
    throw error;
  }
  await page.context().clearCookies();
  await loginDashboardSession(page, account.email, account.password);
  await page.goto(`${web}/meals/plan`);
  try {
    await expect(page.getByRole("heading", { name: "7 günlük kişisel plan", exact: true })).toBeVisible({ timeout: 20_000 });
  } catch (error) {
    console.log("STAGING_NUTRITION_UI_DIAGNOSTIC " + JSON.stringify({
      pathname: new URL(page.url()).pathname, browserNutritionStatuses,
      loading: await page.getByText("Öğün planın yükleniyor…", { exact: true }).count(),
      contentUnavailable: await page.getByText(/Bu planın öğün içeriği görüntülenemiyor/).count(),
      expectedHeadingCount: await page.getByRole("heading", { name: "7 günlük kişisel plan", exact: true }).count(),
    }));
    throw error;
  }
  console.log("STAGING_NUTRITION_DISABLED: legacy 7-day plan, session/relogin, Dashboard, Coach, unchanged Free quotas and disabled job/meal controls PASS");
});
