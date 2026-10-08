import { expect, test, type Page } from "@playwright/test";
const base = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const customPlan = () => ({
  version: 1,
  mode: "custom",
  dailyTimes: ["13:55"],
  days: [
    { day: 0, enabled: false, times: ["11:00"] },
    { day: 1, enabled: true, times: ["09:00", "14:00", "18:00", "21:00"] },
    { day: 2, enabled: true, times: ["09:00", "14:00", "18:00"] },
    { day: 3, enabled: true, times: ["10:00", "15:00", "20:00"] },
    { day: 4, enabled: true, times: ["09:00", "14:00", "18:00", "21:00"] },
    { day: 5, enabled: true, times: ["09:00", "14:00", "18:00"] },
    { day: 6, enabled: true, times: ["10:00", "16:00"] },
  ],
});
async function session(
  page: Page,
  options: {
    custom?: boolean;
    failLoad?: boolean;
    loadDelay?: number;
    native?: boolean;
    omitSavedPlan?: boolean;
    databaseKeyOrder?: boolean;
  } = {},
) {
  let preferences: Record<string, unknown> = {
    mealReminders: true,
    waterReminders: true,
    activityReminders: true,
    sleepReminders: true,
    weeklySummary: true,
    coachTips: true,
    bloodTestReminders: false,
    productUpdates: false,
    waterReminderTime: "13:55",
    waterReminderSchedule: options.custom ? customPlan() : null,
    activityReminderTime: "18:25",
    sleepReminderTime: "23:10",
    weeklySummaryDay: 3,
    weeklySummaryTime: "11:40",
    timezoneOffsetMinutes: 0,
  };
  let failLoad = options.failLoad ?? false,
    failSave = false,
    saveDelay = 0;
  const writes: Record<string, unknown>[] = [];
  if (options.native !== false)
    await page.addInitScript(() => {
      Object.assign(window, {
        waterScheduleLog: [] as unknown[],
        DiewishReminders: {
          isAvailable: () => true,
          permissionStatus: () => "granted",
          requestPermission: () => undefined,
          exactAlarmStatus: () => "required",
          showTestNotification: () => true,
          replaceWellnessSchedule: (json: string) => {
            (window as unknown as { waterScheduleLog: unknown[] }).waterScheduleLog.push(
              JSON.parse(json),
            );
            return JSON.parse(json).length;
          },
          cancelWellness: () => undefined,
        },
      });
    });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const ok = (data: unknown) => route.fulfill({ status: 200, json: { success: true, data } });
    const failed = () =>
      route.fulfill({
        status: 503,
        json: { success: false, error: { code: "TEST_UNAVAILABLE", message: "Unavailable" } },
      });
    if (path.endsWith("/auth/refresh-token"))
      return ok({
        user: {
          id: "water-test",
          fullName: "Su Test",
          email: "water@example.com",
          role: "USER",
          isActive: true,
          emailVerified: true,
          onboardingCompleted: true,
          createdAt: "2026-01-01T00:00:00Z",
        },
        tokens: { accessToken: "water-test", tokenType: "Bearer", expiresIn: "15m" },
      });
    if (path.endsWith("/legal/consents")) return ok({ allMandatoryGranted: false, items: [] });
    if (path.endsWith("/notifications/preferences")) {
      if (route.request().method() === "PATCH") {
        const patch = route.request().postDataJSON();
        writes.push(patch);
        if (saveDelay) await new Promise((resolve) => setTimeout(resolve, saveDelay));
        if (failSave) return failed();
        preferences = {
          ...preferences,
          ...patch,
          ...(options.omitSavedPlan ? { waterReminderSchedule: null } : {}),
        };
        if (options.databaseKeyOrder && preferences.waterReminderSchedule) {
          const stored = preferences.waterReminderSchedule as ReturnType<typeof customPlan>;
          preferences.waterReminderSchedule = {
            days: stored.days.map((day) => ({
              times: day.times,
              day: day.day,
              enabled: day.enabled,
            })),
            mode: stored.mode,
            version: stored.version,
            dailyTimes: stored.dailyTimes,
          };
        }
      } else {
        if (options.loadDelay)
          await new Promise((resolve) => setTimeout(resolve, options.loadDelay));
        if (failLoad) return failed();
      }
      return ok({ preferences });
    }
    return failed();
  });
  await page.goto(`${base}/profile/notifications/water`);
  return {
    writes,
    failSave: (v: boolean) => {
      failSave = v;
    },
    failLoad: (v: boolean) => {
      failLoad = v;
    },
    delaySave: (v: number) => {
      saveDelay = v;
    },
    preferences: () => preferences,
  };
}
const ready = (page: Page) => expect(page.locator("[data-water-reminders]")).toBeVisible();
const day = (page: Page, number: number) => page.locator(`[data-water-day="${number}"]`);
const sheet = (page: Page) => page.locator("[data-water-day-sheet]");
const operation = (page: Page) => page.locator("[data-water-operation]");
const save = (page: Page) => page.getByRole("button", { name: "Kaydet", exact: true });
test("JSONB key order preserves successful water saves and refresh without a false rollback", async ({
  page,
}) => {
  const s = await session(page, { databaseKeyOrder: true });
  await ready(page);
  await page.getByLabel("Her gün 1. saat").fill("08:15");
  await page.getByRole("button", { name: "Saat ekle", exact: true }).click();
  await page.getByLabel("Her gün 2. saat").fill("13:20");
  await save(page).click();
  await expect(page.getByText("✓ Kaydedildi", { exact: true })).toBeVisible();
  await expect(page.getByText(/Plan kaydedilemedi/)).toHaveCount(0);
  expect(
    (s.preferences().waterReminderSchedule as ReturnType<typeof customPlan>).dailyTimes,
  ).toEqual(["08:15", "13:20"]);
  await page.reload();
  await ready(page);
  await expect(page.getByLabel("Her gün 1. saat")).toHaveValue("08:15");
  await expect(page.getByLabel("Her gün 2. saat")).toHaveValue("13:20");
  await expect(save(page)).toBeDisabled();
});
async function fit(page: Page, selector?: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (selector) {
    const element = page.locator(selector);
    await element.evaluate(async (node) => {
      await Promise.all(
        node.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
      );
    });
    const bounds = await element.boundingBox();
    const viewport = page.viewportSize()!;
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(await element.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  }
}
for (const width of [390, 412, 430])
  for (const theme of ["light", "dark"])
    test(`water full page, week and sheet fit ${width}px ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 915 });
      await page.addInitScript((v) => localStorage.setItem("theme", v), theme);
      await session(page, { custom: true });
      await ready(page);
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      await expect(page.locator("[data-water-day]")).toHaveCount(7);
      await fit(page);
      await page.screenshot({
        path: `${test.info().outputDir}/week-${width}-${theme}.png`,
        fullPage: true,
      });
      await day(page, 1).getByRole("button", { name: "Pazartesi planını düzenle" }).click();
      await expect(sheet(page).getByRole("heading", { name: "Pazartesi planı" })).toBeVisible();
      await fit(page, "[data-water-day-sheet]");
      await page.screenshot({ path: `${test.info().outputDir}/sheet-${width}-${theme}.png` });
      await sheet(page).getByRole("button", { name: "Diğer günlere kopyala" }).click();
      await fit(page, "[data-water-operation]");
      await operation(page).getByRole("button", { name: "İptal", exact: true }).click();
      await sheet(page).getByRole("button", { name: "Uygula", exact: true }).click();
      await page.getByRole("button", { name: "Her gün aynı", exact: true }).click();
      await fit(page);
    });

test("legacy single time expands safely, caps at eight and persists the daily plan", async ({
  page,
}) => {
  const s = await session(page);
  await ready(page);
  await expect(page.getByLabel("Her gün 1. saat")).toHaveValue("13:55");
  await page.getByLabel("Her gün yeni saat").fill("13:55");
  await page.getByRole("button", { name: "Saat ekle", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Bu saat zaten ekli");
  for (const time of ["08:00", "09:00", "11:00", "14:00", "16:00", "18:00", "21:00"]) {
    await page.getByLabel("Her gün yeni saat").fill(time);
    await page.getByRole("button", { name: "Saat ekle", exact: true }).click();
  }
  await expect(page.getByRole("button", { name: "Saat ekle", exact: true })).toHaveCount(0);
  await expect(page.getByText("Bu gün için en fazla 8 hatırlatma ekleyebilirsin.")).toBeVisible();
  await save(page).click();
  await expect(page.getByText("✓ Kaydedildi", { exact: true })).toBeVisible();
  expect(s.writes).toHaveLength(1);
  const plan = s.writes[0].waterReminderSchedule as ReturnType<typeof customPlan>;
  expect(plan.dailyTimes).toEqual([
    "08:00",
    "09:00",
    "11:00",
    "13:55",
    "14:00",
    "16:00",
    "18:00",
    "21:00",
  ]);
  expect(plan.days.every((day) => day.times.length === 8)).toBe(true);
  expect(Object.keys(s.writes[0]).sort()).toEqual([
    "timezoneOffsetMinutes",
    "waterReminderSchedule",
    "waterReminderTime",
    "waterReminders",
  ]);
  expect(s.preferences().activityReminderTime).toBe("18:25");
  expect(s.preferences().weeklySummaryTime).toBe("11:40");
  expect(
    await page.evaluate(() => {
      const rows = (
        window as unknown as { waterScheduleLog: { type: string }[][] }
      ).waterScheduleLog.at(-1)!;
      return rows.length;
    }),
  ).toBeLessThanOrEqual(116);
  await page.reload();
  await ready(page);
  await expect(page.locator('[data-water-times] input[type="time"]')).toHaveCount(8);
  await fit(page);
  await page.getByRole("button", { name: "Günlere göre özelleştir", exact: true }).click();
  await day(page, 1).getByRole("button", { name: "Pazartesi planını düzenle" }).click();
  await expect(sheet(page).locator('input[type="time"]')).toHaveCount(8);
  await fit(page, "[data-water-day-sheet]");
  await sheet(page).getByRole("button", { name: "Uygula", exact: true }).scrollIntoViewIfNeeded();
  await expect(sheet(page).getByRole("button", { name: "Uygula", exact: true })).toBeInViewport();
  await page.screenshot({ path: `${test.info().outputDir}/sheet-eight-times.png` });
  await sheet(page).getByRole("button", { name: "Uygula", exact: true }).click();
  await expect(page.getByText("7 gün · Haftada 56 hatırlatma", { exact: true })).toBeVisible();
});

test("quick day editing adds/removes hours and preserves hours while the day is closed", async ({
  page,
}) => {
  const s = await session(page, { custom: true });
  await ready(page);
  await page.getByRole("button", { name: "Pazartesi hızlı düzenle", exact: true }).click();
  await sheet(page).getByRole("button", { name: "09:00 saatini sil", exact: true }).click();
  await sheet(page).getByLabel("Pazartesi yeni saat").fill("12:15");
  await sheet(page).getByRole("button", { name: "Saat ekle", exact: true }).click();
  await sheet(page).getByRole("button", { name: "Bu günü kapat", exact: true }).click();
  await sheet(page).getByRole("button", { name: "Uygula", exact: true }).click();
  await expect(day(page, 1)).toContainText("Kapalı");
  expect(s.writes).toHaveLength(0);
  await save(page).click();
  await expect(save(page)).toBeDisabled();
  await page.reload();
  await ready(page);
  await day(page, 1).getByRole("button", { name: "Pazartesi planını düzenle" }).click();
  await expect(sheet(page).getByRole("switch", { name: "Bu gün açık" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await expect(sheet(page).getByLabel("Pazartesi 1. saat")).toHaveValue("12:15");
  await sheet(page).getByRole("switch", { name: "Bu gün açık" }).click();
  await sheet(page).getByRole("button", { name: "Uygula", exact: true }).click();
  await expect(day(page, 1)).toContainText("12:15");
});

test("copy modifies only chosen days and preserves closed/unselected days", async ({ page }) => {
  const s = await session(page, { custom: true });
  await ready(page);
  await page.getByRole("button", { name: "Diğer günlere kopyala", exact: true }).click();
  for (const name of ["Çarşamba", "Perşembe", "Cuma", "Cumartesi"])
    await operation(page).getByRole("checkbox", { name, exact: true }).uncheck();
  await expect(
    operation(page).getByRole("checkbox", { name: "Pazar (Kapalı)", exact: true }),
  ).toBeDisabled();
  await operation(page).getByRole("button", { name: "Kopyala", exact: true }).click();
  await expect(day(page, 2)).toContainText("21:00");
  await expect(day(page, 3)).toContainText("15:00");
  await expect(day(page, 0)).toContainText("Kapalı");
  await save(page).click();
  await expect(save(page)).toBeDisabled();
  const plan = s.preferences().waterReminderSchedule as ReturnType<typeof customPlan>;
  expect(plan.days.find((d) => d.day === 2)?.times).toEqual(["09:00", "14:00", "18:00", "21:00"]);
  expect(plan.days.find((d) => d.day === 0)).toEqual({ day: 0, enabled: false, times: ["11:00"] });
});

test("weekday/weekend actions require confirmation and opening closed days is explicit", async ({
  page,
}) => {
  await session(page, { custom: true });
  await ready(page);
  await page.getByRole("button", { name: "Hafta sonuna uygula", exact: true }).click();
  await operation(page).getByRole("button", { name: "İptal", exact: true }).click();
  await expect(day(page, 6)).toContainText("16:00");
  await expect(save(page)).toBeDisabled();
  await page.getByRole("button", { name: "Hafta sonuna uygula", exact: true }).click();
  await operation(page)
    .getByRole("checkbox", { name: "Seçilen kapalı günleri de aç", exact: true })
    .check();
  await operation(page).getByRole("checkbox", { name: "Pazar (Kapalı)", exact: true }).check();
  await operation(page).getByRole("button", { name: "Kopyala", exact: true }).click();
  await expect(day(page, 0).getByRole("switch")).toHaveAttribute("aria-checked", "true");
  await expect(day(page, 0)).toContainText("21:00");
  await expect(day(page, 6)).toContainText("21:00");
  await page.getByRole("button", { name: "Hafta içine uygula", exact: true }).click();
  await operation(page).getByRole("button", { name: "Kopyala", exact: true }).click();
  for (const number of [2, 3, 4, 5]) await expect(day(page, number)).toContainText("21:00");
});

test("controlled clear keeps flags, cancellation keeps hours, and empty plans schedule no water", async ({
  page,
}) => {
  const s = await session(page, { custom: true });
  await ready(page);
  await day(page, 1).getByRole("button", { name: "Pazartesi planını düzenle" }).click();
  await sheet(page)
    .getByRole("button", { name: "Bu günün saatlerini temizle", exact: true })
    .click();
  await operation(page).getByRole("button", { name: "İptal", exact: true }).click();
  await expect(sheet(page).getByLabel("Pazartesi 1. saat")).toHaveValue("09:00");
  await sheet(page)
    .getByRole("button", { name: "Bu günün saatlerini temizle", exact: true })
    .click();
  await operation(page).getByRole("button", { name: "Temizle", exact: true }).click();
  await expect(day(page, 1)).toContainText("Saat eklenmedi");
  await expect(day(page, 1).getByRole("switch")).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Tüm saatleri temizle", exact: true }).click();
  await operation(page).getByRole("button", { name: "Temizle", exact: true }).click();
  await expect(day(page, 0).getByRole("switch")).toHaveAttribute("aria-checked", "false");
  await save(page).click();
  await expect(page.getByText("✓ Kaydedildi", { exact: true })).toBeVisible();
  const plan = s.preferences().waterReminderSchedule as ReturnType<typeof customPlan>;
  expect(plan.days.every((d) => d.times.length === 0)).toBe(true);
  expect(
    await page.evaluate(() => {
      const rows = (
        window as unknown as { waterScheduleLog: { type: string }[][] }
      ).waterScheduleLog.at(-1)!;
      return rows.filter((r) => r.type === "water").length;
    }),
  ).toBe(0);
  await page.reload();
  await ready(page);
  await expect(page.getByText("Program boş · Saat ekle", { exact: true })).toBeVisible();
});

test("failed save restores the old mode, hours and master switch, then retry blocks duplicates", async ({
  page,
}) => {
  const s = await session(page);
  await ready(page);
  await page.getByRole("button", { name: "Günlere göre özelleştir", exact: true }).click();
  await page.getByRole("switch", { name: "Su hatırlatmaları", exact: true }).click();
  s.failSave(true);
  await save(page).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Son kayıtlı ayarların geri yüklendi",
  );
  await expect(page.getByRole("button", { name: "Her gün aynı", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByLabel("Her gün 1. saat")).toHaveValue("13:55");
  await expect(
    page.getByRole("switch", { name: "Su hatırlatmaları", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  s.failSave(false);
  s.delaySave(500);
  await page.getByRole("switch", { name: "Su hatırlatmaları", exact: true }).click();
  await save(page).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.getByRole("button", { name: "Her gün aynı", exact: true })).toBeDisabled();
  await expect(page.getByText("✓ Kaydedildi", { exact: true })).toBeVisible();
  expect(s.writes).toHaveLength(2);
  await expect(
    page.getByRole("switch", { name: "Su hatırlatmaları", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
});

test("water loading/error can recover without inventing saved hours", async ({ page }) => {
  const s = await session(page, { failLoad: true, loadDelay: 700 });
  await expect(page.getByText("Su hatırlatmaları yükleniyor…", { exact: true })).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Su hatırlatmaları yüklenemedi",
  );
  await expect(page.getByRole("switch")).toHaveCount(0);
  s.failLoad(false);
  await page.getByRole("button", { name: "Tekrar dene", exact: true }).click();
  await ready(page);
  await expect(page.getByLabel("Her gün 1. saat")).toHaveValue("13:55");
});

test("the weekly editor saves through the common API without an Android bridge", async ({
  page,
}) => {
  const s = await session(page, { native: false, custom: true });
  await ready(page);
  await day(page, 2).getByRole("switch").click();
  await save(page).click();
  await expect(page.getByText("✓ Kaydedildi", { exact: true })).toBeVisible();
  await page.reload();
  await ready(page);
  await expect(day(page, 2).getByRole("switch")).toHaveAttribute("aria-checked", "false");
  expect(s.preferences().activityReminderTime).toBe("18:25");
  expect(await page.evaluate(() => "DiewishReminders" in window)).toBe(false);
});

test("a backend that omits the saved plan cannot produce false success", async ({ page }) => {
  await session(page, { native: false, omitSavedPlan: true });
  await ready(page);
  await page.getByLabel("Her gün yeni saat").fill("16:00");
  await page.getByRole("button", { name: "Saat ekle", exact: true }).click();
  await save(page).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Son kayıtlı ayarların geri yüklendi",
  );
  await expect(page.getByText("✓ Kaydedildi", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Her gün 1. saat")).toHaveValue("13:55");
  await expect(page.getByLabel("Her gün 2. saat")).toHaveCount(0);
});
