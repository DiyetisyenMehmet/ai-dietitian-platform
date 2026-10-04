import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  createDashboardSession,
  DASHBOARD_WEB_BASE_URL,
  setDashboardTheme,
} from "./dashboard-test-session";

const preferenceKeys = [
  "mealReminders",
  "waterReminders",
  "activityReminders",
  "sleepReminders",
  "weeklySummary",
  "coachTips",
] as const;

async function expectResponsivePreferences(page: Page, width: number) {
  await page.setViewportSize({ width, height: 915 });
  await page.evaluate(() => document.fonts.ready);

  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewport + 1);

  const cards = page.locator("[data-notification-preference-card]");
  await expect(cards).toHaveCount(preferenceKeys.length);

  for (const key of preferenceKeys) {
    const card = page.locator(`[data-notification-preference-card="${key}"]`);
    const toggle = card.getByRole("switch");
    await expect(card).toBeVisible();
    await expect(toggle).toBeVisible();
    await expect(card.locator("a")).toHaveCount(0);

    const cardBox = await card.boundingBox();
    const toggleBox = await toggle.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(toggleBox).not.toBeNull();
    expect(toggleBox!.height).toBeGreaterThanOrEqual(44);
    expect(toggleBox!.x).toBeGreaterThanOrEqual(cardBox!.x);
    expect(toggleBox!.x + toggleBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);
    expect(cardBox!.height).toBeLessThanOrEqual(width === 320 ? 205 : 180);
  }
}

test("notification preferences A1 is compact, persistent and route-safe", async ({ page, request }) => {
  test.setTimeout(180_000);
  await createDashboardSession(page, request);
  await page.goto(`${DASHBOARD_WEB_BASE_URL}/profile/notifications`);

  await expect(page.getByRole("heading", { name: "Bildirim Tercihleri" })).toBeVisible();
  await expect(page.locator("[data-notification-preferences-screen]")).toBeVisible();

  await expect(
    page.locator('[data-notification-preference-card="mealReminders"]'),
  ).toContainText("Öğün planındaki saatlere göre");
  await expect(
    page.locator('[data-notification-preference-card="waterReminders"]'),
  ).toContainText("Her gün · 10:00");
  await expect(
    page.locator('[data-notification-preference-card="activityReminders"]'),
  ).toContainText("Her gün · 18:00");
  await expect(
    page.locator('[data-notification-preference-card="sleepReminders"]'),
  ).toContainText("Her gün · 22:30");
  await expect(
    page.locator('[data-notification-preference-card="weeklySummary"]'),
  ).toContainText("Pazar · 10:00");
  await expect(
    page.locator('[data-notification-preference-card="coachTips"]'),
  ).toContainText("Özel saat ayarı yok");

  for (const width of [320, 360, 390, 412, 430, 768]) {
    for (const theme of ["light", "dark"] as const) {
      await setDashboardTheme(page, theme);
      await expectResponsivePreferences(page, width);
    }
  }

  const waterSwitch = page
    .locator('[data-notification-preference-card="waterReminders"]')
    .getByRole("switch");
  await expect(waterSwitch).toHaveAttribute("aria-checked", "false");
  await waterSwitch.click();
  await expect(waterSwitch).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(
    page.locator('[data-notification-preference-card="waterReminders"]').getByRole("switch"),
  ).toHaveAttribute("aria-checked", "true");

  await page.goto(`${DASHBOARD_WEB_BASE_URL}/notifications`);
  await page.getByRole("link", { name: "Bildirim tercihlerini aç" }).click();
  await expect(page).toHaveURL(/\/profile\/notifications$/);
});

test("notification preferences A1 stays inside an Android WebView-like viewport", async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const context = await (browser as Browser).newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    userAgent:
      "Mozilla/5.0 (Linux; Android 16; wv) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36 DiewishAndroid/0.1.1",
  });
  const page = await context.newPage();

  try {
    await createDashboardSession(page, request);
    await page.goto(`${DASHBOARD_WEB_BASE_URL}/profile/notifications`);
    await expect(page.locator("[data-notification-preferences-screen]")).toBeVisible();
    await expectResponsivePreferences(page, 390);
  } finally {
    await context.close();
  }
});
