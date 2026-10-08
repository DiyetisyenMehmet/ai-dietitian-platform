import { expect, test, type Page } from "@playwright/test";
import {
  createDashboardSession,
  loginDashboardSession,
  setDashboardTheme,
} from "./dashboard-test-session";

// Real API and real browser only. Never run this synthetic-account probe on production.
const web = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const api = process.env.E2E_API_BASE_URL || "http://127.0.0.1:4000/api";
for (const target of [web, api]) {
  if (!["staging.diewish.com", "localhost", "127.0.0.1"].includes(new URL(target).hostname))
    throw new Error("Notification runtime sanity refuses non-staging/non-local hosts.");
}
const categories = [
  ["meals", "mealReminders", "Öğün hatırlatmaları"],
  ["water", "waterReminders", "Su hatırlatmaları"],
  ["activity", "activityReminders", "Aktivite hatırlatmaları"],
  ["sleep", "sleepReminders", "Uyku hazırlığı"],
  ["weekly", "weeklySummary", "Haftalık özet"],
  ["coach", "coachTips", "Diewish Koç bildirimleri"],
] as const;
const saved = (page: Page) => page.getByText("✓ Kaydedildi", { exact: true });
const save = (page: Page) => page.getByRole("button", { name: "Kaydet", exact: true });
const sheet = (page: Page) => page.locator("[data-water-day-sheet]");
const operation = (page: Page) => page.locator("[data-water-operation]");
const day = (page: Page, number: number) => page.locator(`[data-water-day="${number}"]`);
async function fit(page: Page, selector?: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  if (selector) {
    const modal = page.locator(selector);
    await expect(modal).toBeVisible();
    await modal.evaluate(async (node) => {
      await Promise.all(
        node.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
      );
    });
    const box = (await modal.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(await modal.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  }
}

test("deployed notification preferences: real persistence, water editor, Web capabilities and regression", async ({
  page,
  request,
}, info) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const account = await createDashboardSession(page, request);
  const headers = { authorization: `Bearer ${account.token}` };
  const read = async (path: string) => {
    const response = await request.get(`${api}${path}`, { headers });
    expect(response.ok(), path).toBe(true);
    return (await response.json()).data;
  };
  const patch = async (data: unknown) => {
    const response = await request.patch(`${api}/notifications/preferences`, { headers, data });
    expect(response.ok()).toBe(true);
    return (await response.json()).data.preferences;
  };
  await patch(Object.fromEntries(categories.map(([, key]) => [key, false])));
  try {
    await page.goto(`${web}/profile/notifications`);
    await expect(page.locator("[data-notification-preferences]")).toBeVisible();
    for (const [slug, key, label] of categories) {
      const toggle = page.getByRole("switch", { name: label, exact: true });
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      // FREE meals must preserve the entitlement gate; the remaining five save normally.
      if (slug === "meals") continue;
      await toggle.click();
      await expect
        .poll(async () => (await read("/notifications/preferences")).preferences[key])
        .toBe(true);
      await page.reload();
      await expect(page.getByRole("switch", { name: label, exact: true })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await page.getByRole("switch", { name: label, exact: true }).click();
      await expect
        .poll(async () => (await read("/notifications/preferences")).preferences[key])
        .toBe(false);
    }

    await page.goto(`${web}/profile/notifications/water`);
    await expect(page.locator("[data-water-reminders]")).toBeVisible();
    await page.getByRole("button", { name: "Her gün aynı", exact: true }).click();
    await page.getByLabel("Her gün 1. saat").fill("08:15");
    await page.getByLabel("Her gün yeni saat").fill("13:20");
    await page.getByRole("button", { name: "Saat ekle", exact: true }).click();
    await save(page).click();
    await expect(saved(page)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Her gün 1. saat")).toHaveValue("08:15");
    await expect(page.getByLabel("Her gün 2. saat")).toHaveValue("13:20");
    await page.getByRole("button", { name: "Günlere göre özelleştir", exact: true }).click();
    await page.getByRole("button", { name: "Pazartesi hızlı düzenle", exact: true }).click();
    await sheet(page).getByRole("button", { name: "13:20 saatini sil", exact: true }).click();
    await sheet(page).getByLabel("Pazartesi yeni saat").fill("16:45");
    await sheet(page).getByRole("button", { name: "Saat ekle", exact: true }).click();
    await fit(page, "[data-water-day-sheet]");
    await sheet(page).getByRole("button", { name: "Uygula", exact: true }).click();
    await day(page, 2).getByRole("switch").click();
    await expect(day(page, 2)).toContainText("Kapalı");
    await day(page, 2).getByRole("switch").click();
    for (const label of ["Diğer günlere kopyala", "Hafta içine uygula", "Hafta sonuna uygula"]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await fit(page, "[data-water-operation]");
      await operation(page).getByRole("button", { name: "Kopyala", exact: true }).click();
    }
    await save(page).click();
    await expect(saved(page)).toBeVisible();
    await page.reload();
    await expect(day(page, 1)).toContainText("16:45");
    await expect(day(page, 0)).toContainText("16:45");
    await day(page, 1).getByRole("button", { name: "Pazartesi planını düzenle" }).click();
    await sheet(page)
      .getByRole("button", { name: "Bu günün saatlerini temizle", exact: true })
      .click();
    await operation(page).getByRole("button", { name: "İptal", exact: true }).click();
    await expect(sheet(page).getByLabel("Pazartesi 1. saat")).toHaveValue("08:15");
    await sheet(page)
      .getByRole("button", { name: "Bu günün saatlerini temizle", exact: true })
      .click();
    await operation(page).getByRole("button", { name: "Temizle", exact: true }).click();
    await expect(day(page, 1)).toContainText("Saat eklenmedi");
    await page.getByRole("button", { name: "Tüm saatleri temizle", exact: true }).click();
    await operation(page).getByRole("button", { name: "Temizle", exact: true }).click();
    await save(page).click();
    await expect(saved(page)).toBeVisible();
    expect(
      (await read("/notifications/preferences")).preferences.waterReminderSchedule.days.every(
        (entry: { times: string[] }) => entry.times.length === 0,
      ),
    ).toBe(true);
    // Refill a real custom plan for responsive sheets and relogin persistence.
    await day(page, 1).getByRole("button", { name: "Pazartesi planını düzenle" }).click();
    await sheet(page).getByLabel("Pazartesi yeni saat").fill("09:25");
    await sheet(page).getByRole("button", { name: "Saat ekle", exact: true }).click();
    await sheet(page).getByRole("button", { name: "Uygula", exact: true }).click();
    await save(page).click();
    await expect(saved(page)).toBeVisible();

    for (const [slug, , label] of categories.filter(([slug]) => slug !== "water")) {
      await page.goto(`${web}/profile/notifications/${slug}`);
      await expect(page.locator(`[data-notification-detail="${slug}"]`)).toBeVisible();
      await expect(page.getByRole("heading", { name: label, level: 1 })).toBeVisible();
      if (slug === "meals") {
        await expect(page.locator("[data-meal-gate]")).toBeVisible();
        await expect(page.getByRole("switch", { name: label, exact: true })).toBeDisabled();
      }
      if (["activity", "sleep", "weekly"].includes(slug)) {
        await page.locator('input[type="time"]').fill(slug === "sleep" ? "22:45" : "18:35");
        if (slug === "weekly")
          await page.getByRole("button", { name: "Pazar", exact: true }).click();
        await save(page).click();
        await expect(saved(page)).toBeVisible();
      }
      if (slug === "coach") {
        await page.getByRole("switch", { name: label, exact: true }).click();
        await save(page).click();
        await expect(saved(page)).toBeVisible();
      }
      await fit(page);
    }
    // Common logical presets can be persisted independently of actual Web capabilities.
    await patch({
      categoryAlerts: Object.fromEntries(
        categories.map(([slug]) => [
          slug,
          { soundPreset: "diewish_gentle", vibrationPreset: "double_short" },
        ]),
      ),
    });
    for (const [slug] of categories) {
      await page.goto(`${web}/profile/notifications/${slug}/sound`);
      await expect(page.locator(`[data-notification-alerts="${slug}"]`)).toBeVisible();
      await expect(page.getByRole("radio", { name: "Diewish · Nazik", exact: true })).toBeChecked();
      await expect(
        page.getByRole("radio", { name: "Diewish · Nazik", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("radio", { name: "Diewish · Damla", exact: true }),
      ).toBeDisabled();
      await expect(page.getByRole("radio", { name: "Çift kısa", exact: true })).toBeDisabled();
      await page.getByRole("radio", { name: "Sessiz", exact: true }).check();
      await page.getByRole("button", { name: "Ses ve titreşimi kaydet" }).click();
      await expect(saved(page)).toBeVisible();
      await page.reload();
      await expect(page.getByRole("radio", { name: "Sessiz", exact: true })).toBeChecked();
      await expect(page.getByRole("radio", { name: "Çift kısa", exact: true })).toBeChecked();
    }
    const beforeTest = await read("/notifications/preferences");
    const inboxBefore = await read("/notifications");
    const scheduledBefore = await read("/notifications/scheduled");
    const forbidden: string[] = [];
    page.on("request", (req) => {
      const path = new URL(req.url()).pathname;
      if (req.method() !== "GET" && (path.includes("/notifications/") || path.includes("/usage")))
        forbidden.push(path);
    });
    const testButton = page.getByRole("button", { name: "Test bildirimi gönder", exact: true });
    if (await testButton.isEnabled()) {
      await testButton.click();
      await expect(page.locator("[data-alert-preview]")).toContainText(
        /bildirim izni verilmedi|tarayıcıya iletildi|bağlantısı hazır değil/,
      );
    } else {
      await expect(
        page.getByText("Test bildirimi bu ortamda veya uygulama sürümünde kullanılamıyor.", {
          exact: true,
        }),
      ).toBeVisible();
    }
    expect(forbidden).toEqual([]);
    expect(await read("/notifications/preferences")).toEqual(beforeTest);
    expect(await read("/notifications")).toEqual(inboxBefore);
    expect(await read("/notifications/scheduled")).toEqual(scheduledBefore);

    for (const width of [390, 412, 430])
      for (const theme of ["light", "dark"] as const) {
        await page.setViewportSize({
          width,
          height: width === 412 ? 915 : width === 430 ? 932 : 844,
        });
        await page.goto(`${web}/dashboard`);
        await setDashboardTheme(page, theme);
        await fit(page);
        for (const [slug] of categories) {
          await page.goto(`${web}/profile/notifications/${slug}`);
          await expect(
            page.locator(
              slug === "water" ? "[data-water-reminders]" : `[data-notification-detail="${slug}"]`,
            ),
          ).toBeVisible();
          await fit(page);
          if (slug === "water") {
            await day(page, 1).getByRole("button", { name: "Pazartesi planını düzenle" }).click();
            await fit(page, "[data-water-day-sheet]");
            await page.screenshot({
              path: info.outputPath(`water-sheet-${width}-${theme}.png`),
              animations: "disabled",
            });
            await sheet(page).getByRole("button", { name: "Uygula", exact: true }).click();
          }
          await page.goto(`${web}/profile/notifications/${slug}/sound`);
          await expect(page.locator(`[data-notification-alerts="${slug}"]`)).toBeVisible();
          await fit(page);
          await page.screenshot({
            path: info.outputPath(`${slug}-sound-${width}-${theme}.png`),
            fullPage: true,
            animations: "disabled",
          });
        }
        await page.goto(`${web}/profile/notifications`);
        await expect(page.locator("[data-notification-preferences]")).toBeVisible();
        await fit(page);
        await page.screenshot({
          path: info.outputPath(`main-${width}-${theme}.png`),
          fullPage: true,
          animations: "disabled",
        });
      }
    await page.goto(`${web}/profile`);
    await page.getByText("Çıkış yap", { exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    await loginDashboardSession(page, account.email);
    await page.goto(`${web}/profile/notifications/water`);
    await expect(day(page, 1)).toContainText("09:25");
    await page.goto(`${web}/profile/notifications/activity`);
    await expect(page.locator('input[type="time"]')).toHaveValue("18:35");
    await page.goto(`${web}/profile/notifications/coach/sound`);
    await expect(page.getByRole("radio", { name: "Sessiz", exact: true })).toBeChecked();
    for (const path of ["/dashboard", "/profile", "/ai", "/meals/plan"]) {
      await page.goto(web + path);
      await expect(page.locator("main")).toBeVisible();
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator("main")).not.toContainText(
        /Application error|Internal Server Error/,
      );
      if (path === "/dashboard") {
        await expect(page.locator("[data-quick-action-slot]")).toHaveCount(4);
        await expect(page.getByRole("button", { name: "Ana ekranı düzenle" })).toBeEnabled();
      }
    }
    console.log(
      "STAGING_NOTIFICATION_SANITY: real account API, refresh/relogin, six categories, water operations, Web capability guards, no test queue writes, six responsive/theme combinations passed.",
    );
  } finally {
    // Cleanup also runs if a runtime assertion fails.
    await patch(Object.fromEntries(categories.map(([, key]) => [key, false])));
  }
});
