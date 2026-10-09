import { test, expect } from "@playwright/test";
import { createDashboardSession, DASHBOARD_WEB_BASE_URL } from "./dashboard-test-session";

for (const base of [DASHBOARD_WEB_BASE_URL, process.env.E2E_API_BASE_URL || "http://127.0.0.1:4000/api"]) {
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname)) {
    throw new Error("Session regression fixtures require a disposable local environment.");
  }
}

// Dedicated local backend only. This suite neither uses staging QA credentials
// nor injects cookies/storage. All sessions originate from ordinary UI login.
test("real browser cookies restore across reload/page reopen and logout stays closed", async ({ page, context, request, browser }) => {
  const account = await createDashboardSession(page, request);
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(await page.evaluate(() => localStorage.getItem("diewish.auth.session"))).toBeNull();
  await page.reload();
  await expect(page.getByRole("button", { name: "Ana ekranı düzenle", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
  const reopened = await context.newPage();
  await reopened.goto(`${DASHBOARD_WEB_BASE_URL}/dashboard`);
  await expect(reopened.getByRole("button", { name: "Ana ekranı düzenle", exact: true })).toBeVisible();
  await expect(reopened).toHaveURL(/\/dashboard$/);
  for (const route of ["/ai", "/profile/notifications", "/profile", "/meals/plan"]) {
    await reopened.goto(`${DASHBOARD_WEB_BASE_URL}${route}`);
    await expect(reopened).toHaveURL(`${DASHBOARD_WEB_BASE_URL}${route}`);
    await expect(reopened.locator('main')).toBeVisible();
    await expect(reopened.getByRole("heading", { name: "Giriş Yap", exact: true })).toHaveCount(0);
  }
  // A genuinely new cookie jar must not inherit the existing account.
  const isolated = await browser.newContext();
  const isolatedPage = await isolated.newPage();
  await isolatedPage.goto(`${DASHBOARD_WEB_BASE_URL}/dashboard`);
  await expect(isolatedPage).toHaveURL(/\/login$/);
  await isolated.close();
  await page.close();
  await reopened.goto(`${DASHBOARD_WEB_BASE_URL}/profile`);
  await reopened.getByRole("button", { name: "Çıkış yap", exact: true }).click();
  await expect(reopened).toHaveURL(/\/login$/);
  await reopened.goto(`${DASHBOARD_WEB_BASE_URL}/dashboard`);
  await expect(reopened).toHaveURL(/\/login$/);
  await expect(reopened.getByLabel("Şifre", { exact: true })).toHaveValue("");
  // Test account data stays in this disposable local database.
  expect(account.email.endsWith("@example.com")).toBe(true);
});

test("server-revoked browser session returns to login on reload", async ({ page, request }) => {
  const account = await createDashboardSession(page, request);
  const api = process.env.E2E_API_BASE_URL || "http://127.0.0.1:4000/api";
  const headers = { authorization: `Bearer ${account.token}` };
  const list = await request.get(`${api}/identity/sessions`, { headers });
  expect(list.status()).toBe(200);
  const body = await list.json();
  const sessions = body.data.sessions as Array<{ id: string }>;
  expect(sessions.length).toBeGreaterThan(0);
  // Only sessions of the newly-created disposable LOCAL synthetic account.
  for (const item of sessions) {
    const revoked = await request.delete(`${api}/identity/sessions/${encodeURIComponent(item.id)}`, { headers });
    expect(revoked.status()).toBe(200);
  }
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Şifre", { exact: true })).toHaveValue("");
});
