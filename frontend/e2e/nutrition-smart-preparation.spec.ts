import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const base = process.env.E2E_WEB_BASE_URL ?? "http://127.0.0.1:3000";
const fixtures = JSON.parse(
  readFileSync(process.env.NUTRITION_TEST_FIXTURE_FILE ?? "/tmp/nutrition-fixtures.json", "utf8"),
);
async function login(page: Page, name: string) {
  await page.goto(`${base}/login`);
  await page.getByLabel("E-posta").fill(fixtures[name].email);
  await page.getByLabel("Şifre", { exact: true }).fill(fixtures[name].password);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`${base}/meals/plan`);
  await expect(page.getByRole("button", { name: "Yeni plan oluştur" })).toHaveCount(3);
}
for (const [name, days, index] of [
  ["premium7", 7, 0],
  ["premium14", 14, 1],
  ["premium30", 30, 2],
  ["plus30", 30, 2],
] as const) {
  test(`${name}: persistent ${days}-day preparation survives reload`, async ({ page }) => {
    await login(page, name);
    const accepted = page.waitForResponse(
      (r) =>
        r.url().endsWith("/nutrition-plans/generation-jobs") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Yeni plan oluştur" }).nth(index).click();
    expect((await accepted).status()).toBe(202);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: `${days} günlük kişisel plan`, exact: true }),
    ).toBeVisible({ timeout: 45000 });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: `${days} günlük kişisel plan`, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}
test("pause confirmation, keep preparing, pause, then resume retained data", async ({ page }) => {
  await login(page, "resume14");
  await page.getByRole("button", { name: "Yeni plan oluştur" }).nth(1).click();
  await page.getByRole("button", { name: "İptal Et", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Hazırlamaya Devam Et" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "İptal Et", exact: true }).click();
  await page.getByRole("button", { name: "Evet, İptal Et" }).click();
  await expect(page.getByText("Plan oluşturma iptal edildi", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Plan oluşturma iptal edildi", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Yeni plan oluştur" }).nth(1).click();
  await expect(
    page.getByRole("heading", { name: "14 günlük kişisel plan", exact: true }),
  ).toBeVisible({ timeout: 45000 });
});
test("FREE 14/30 reject clearly; selected meal consumes only its day right", async ({ page }) => {
  await login(page, "meal7");
  for (const index of [1, 2]) {
    await page.getByRole("button", { name: "Yeni plan oluştur" }).nth(index).click();
    await expect(page.getByText(/Ücretsiz planda 7 günlük/).first()).toBeVisible();
  }
  await page.getByRole("button", { name: "Yeni plan oluştur" }).first().click();
  await expect(
    page.getByRole("heading", { name: "7 günlük kişisel plan", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  const openDay = page
    .locator("details[open]")
    .filter({ has: page.getByRole("button", { name: "Öğünü Değiştir" }).first() })
    .first();
  await expect(page.getByText("Kalan: 1/1").first()).toBeVisible();
  await page.getByRole("button", { name: "Öğünü Değiştir" }).first().click();
  await expect(page.getByText("Kalan: 0/1").first()).toBeVisible({ timeout: 30000 });
  await expect(openDay.getByRole("button", { name: "Öğünü Değiştir" }).first()).toBeDisabled();
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test("fresh Android-sized browser session recovers the same job without another generation request", async ({
  page,
  context,
  browser,
}) => {
  await login(page, "reopen14");
  let started = 0;
  const countStart = (request: import("@playwright/test").Request) => {
    if (request.method() === "POST" && request.url().endsWith("/nutrition-plans/generation-jobs"))
      started++;
  };
  page.on("request", countStart);
  const accepted = page.waitForResponse(
    (r) => r.url().endsWith("/nutrition-plans/generation-jobs") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Yeni plan oluştur" }).nth(1).click();
  expect((await accepted).status()).toBe(202);
  const saved = await context.storageState();
  await context.close();
  const reopened = await browser.newContext({
    storageState: saved,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  });
  try {
    const next = await reopened.newPage();
    next.on("request", countStart);
    await next.goto(`${base}/meals/plan`);
    await expect(
      next.getByRole("heading", { name: "14 günlük kişisel plan", exact: true }),
    ).toBeVisible({ timeout: 45000 });
    expect(started).toBe(1);
  } finally {
    await reopened.close();
  }
});
test("temporary network loss retains preparation and restores the active plan once", async ({
  page,
  context,
}) => {
  await login(page, "offline14");
  let started = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/nutrition-plans/generation-jobs"))
      started++;
  });
  const accepted = page.waitForResponse(
    (r) => r.url().endsWith("/nutrition-plans/generation-jobs") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Yeni plan oluştur" }).nth(1).click();
  expect((await accepted).status()).toBe(202);
  await context.setOffline(true);
  await expect(page.getByText(/Bağlantı kurulamadı. Sunucudaki hazırlık korunuyor/)).toBeVisible({
    timeout: 15000,
  });
  await context.setOffline(false);
  await expect(
    page.getByRole("heading", { name: "14 günlük kişisel plan", exact: true }),
  ).toBeVisible({ timeout: 45000 });
  expect(started).toBe(1);
});
