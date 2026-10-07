import { expect, test, type Page } from "@playwright/test";

const base = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const categories = [
  ["mealReminders", "Öğün hatırlatmaları"],
  ["waterReminders", "Su hatırlatmaları"],
  ["activityReminders", "Aktivite hatırlatmaları"],
  ["sleepReminders", "Uyku hazırlığı"],
  ["weeklySummary", "Haftalık özet"],
  ["coachTips", "Diewish Koç bildirimleri"],
] as const;

async function session(
  page: Page,
  options: {
    failLoad?: boolean;
    delayLoad?: number;
    permission?: string;
    webPermission?: string;
    unsupported?: boolean;
    allOff?: boolean;
  } = {},
) {
  let preferences: Record<string, unknown> = {
    mealReminders: true,
    waterReminders: true,
    activityReminders: false,
    sleepReminders: true,
    weeklySummary: true,
    coachTips: false,
    bloodTestReminders: false,
    productUpdates: false,
    waterReminderTime: "13:55",
    activityReminderTime: "18:25",
    sleepReminderTime: "23:10",
    weeklySummaryDay: 3,
    weeklySummaryTime: "11:40",
    timezoneOffsetMinutes: 0,
  };
  if (options.allOff) for (const [key] of categories) preferences[key] = false;
  let failLoad = options.failLoad ?? false,
    failSave = false,
    delaySave = 0;
  const writes: Record<string, unknown>[] = [];
  if (options.permission)
    await page.addInitScript((permission) => {
      const state = { permission, requests: 0, schedules: [] as unknown[], cancels: 0 };
      Object.assign(window, {
        notificationTestState: state,
        DiewishReminders: {
          isAvailable: () => true,
          permissionStatus: () => state.permission,
          requestPermission: () => {
            state.requests += 1;
          },
          exactAlarmStatus: () => "required",
          replaceWellnessSchedule: (json: string) => {
            state.schedules.push(JSON.parse(json));
            return 1;
          },
          cancelWellness: () => {
            state.cancels += 1;
          },
          showTestNotification: () => true,
        },
      });
    }, options.permission);
  if (options.webPermission)
    await page.addInitScript((permission) => {
      Object.defineProperty(Notification, "permission", {
        get: () => permission,
        configurable: true,
      });
    }, options.webPermission);
  if (options.unsupported)
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, "Notification");
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
          id: "notification-test",
          fullName: "Bildirim Test",
          email: "notification@example.com",
          role: "USER",
          isActive: true,
          emailVerified: true,
          onboardingCompleted: true,
          createdAt: "2026-01-01T00:00:00Z",
        },
        tokens: { accessToken: "notification-test", tokenType: "Bearer", expiresIn: "15m" },
      });
    if (path.endsWith("/legal/consents")) return ok({ allMandatoryGranted: false, items: [] });
    if (path.endsWith("/notifications/preferences")) {
      if (route.request().method() === "PATCH") {
        const patch = route.request().postDataJSON();
        writes.push(patch);
        if (delaySave) await new Promise((resolve) => setTimeout(resolve, delaySave));
        if (failSave) return failed();
        preferences = { ...preferences, ...patch };
      } else {
        if (options.delayLoad)
          await new Promise((resolve) => setTimeout(resolve, options.delayLoad));
        if (failLoad) return failed();
      }
      return ok({ preferences });
    }
    if (path.endsWith("/identity/firebase-config")) return ok({ configured: false, config: null });
    return failed();
  });
  await page.goto(`${base}/profile/notifications`);
  return {
    writes,
    failLoad: (value: boolean) => {
      failLoad = value;
    },
    failSave: (value: boolean) => {
      failSave = value;
    },
    delaySave: (value: number) => {
      delaySave = value;
    },
  };
}

const card = (page: Page, key: string) => page.locator(`[data-notification-category="${key}"]`);
async function ready(page: Page) {
  await expect(page.locator("[data-notification-category]")).toHaveCount(6);
}
async function fit(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const dialog = page.getByRole("dialog");
  if (await dialog.count()) {
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(await page.evaluate(() => innerHeight));
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  }
}

for (const width of [390, 412, 430])
  for (const theme of ["light", "dark"]) {
    test(`main and all category entries fit ${width}px ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 915 });
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
      await session(page);
      await ready(page);
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      const expected = [true, true, false, true, true, false];
      for (const [index, [key, label]] of categories.entries()) {
        await expect(card(page, key).getByRole("switch")).toHaveAttribute(
          "aria-checked",
          String(expected[index]),
        );
        await card(page, key)
          .getByRole("button", { name: `${label} detayları` })
          .click();
        await expect(page.getByRole("heading", { name: label, level: 1 })).toBeVisible();
        await expect(
          page.locator(
            key === "waterReminders" ? "[data-water-reminders]" : "[data-notification-detail]",
          ),
        ).toBeVisible();
        if (key === "waterReminders")
          await expect(page.getByLabel("Her gün 1. saat")).toHaveValue("13:55");
        await fit(page);
        await page.getByRole("button", { name: "Geri", exact: true }).click();
        await ready(page);
      }
      await expect(card(page, "waterReminders")).toContainText("Her gün · 13:55");
      await expect(card(page, "weeklySummary")).toContainText("Çarşamba · 11:40");
      await fit(page);
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: `${test.info().outputDir}/main-${width}-${theme}.png`,
        fullPage: true,
        animations: "disabled",
      });
    });
  }

test("all six toggles save independently, reload and stay on existing API", async ({ page }) => {
  const s = await session(page);
  await ready(page);
  for (const [key] of categories) {
    const toggle = card(page, key).getByRole("switch");
    const wasEnabled = (await toggle.getAttribute("aria-checked")) === "true";
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", String(!wasEnabled));
    await expect(toggle).toBeEnabled();
  }
  expect(s.writes).toEqual(
    categories.map(([key], index) => ({ [key]: [false, false, true, false, false, true][index] })),
  );
  await page.reload();
  await ready(page);
  for (const [index, [key]] of categories.entries())
    await expect(card(page, key).getByRole("switch")).toHaveAttribute(
      "aria-checked",
      String([false, false, true, false, false, true][index]),
    );
});

test("failed toggle preserves saved value; pending save blocks duplicate and other writes", async ({
  page,
}) => {
  const s = await session(page);
  await ready(page);
  s.failSave(true);
  const toggle = card(page, "waterReminders").getByRole("switch");
  await toggle.click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Kayıtlı ayarın korundu");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(toggle).toBeEnabled();
  s.failSave(false);
  s.delaySave(500);
  await toggle.evaluate((element: HTMLButtonElement) => {
    element.click();
    element.click();
  });
  await expect(card(page, "activityReminders").getByRole("switch")).toBeDisabled();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(toggle).toBeEnabled();
  expect(s.writes).toEqual([{ waterReminders: false }, { waterReminders: false }]);
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});

test("existing time/day editing updates summaries only after success and survives reload", async ({
  page,
}) => {
  const s = await session(page);
  await ready(page);
  await card(page, "weeklySummary")
    .getByRole("button", { name: "Haftalık özet detayları" })
    .click();
  const detail = page.locator('[data-notification-detail="weekly"]');
  await detail.getByLabel("Özet saati").fill("12:15");
  await detail.getByRole("button", { name: "Cumartesi", exact: true }).click();
  s.failSave(true);
  await detail.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(detail.getByRole("alert")).toBeVisible();
  await expect(detail).toContainText("Çarşamba · 11:40");
  s.failSave(false);
  await detail.getByLabel("Özet saati").fill("12:15");
  await detail.getByRole("button", { name: "Cumartesi", exact: true }).click();
  await detail.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(detail).toContainText("Cumartesi · 12:15");
  await expect(detail.getByRole("button", { name: "Kaydet", exact: true })).toBeDisabled();
  expect(s.writes).toEqual([
    {
      weeklySummary: true,
      weeklySummaryTime: "12:15",
      weeklySummaryDay: 6,
      timezoneOffsetMinutes: 0,
    },
    {
      weeklySummary: true,
      weeklySummaryTime: "12:15",
      weeklySummaryDay: 6,
      timezoneOffsetMinutes: 0,
    },
  ]);
  await page.getByRole("button", { name: "Geri", exact: true }).click();
  await page.reload();
  await ready(page);
  await expect(card(page, "weeklySummary")).toContainText("Cumartesi · 12:15");
});

test("loading then error offers recovery rather than editable defaults", async ({ page }) => {
  const s = await session(page, { failLoad: true, delayLoad: 700 });
  await expect(page.getByText("Bildirim tercihleri yükleniyor…", { exact: true })).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Bildirim tercihleri yüklenemedi",
  );
  await expect(page.getByRole("switch")).toHaveCount(0);
  s.failLoad(false);
  await page.getByRole("button", { name: "Tekrar dene" }).click();
  await ready(page);
});

for (const permission of ["default", "denied", "granted"])
  test(`Android permission presentation: ${permission}`, async ({ page }) => {
    await session(page, { permission });
    await ready(page);
    if (permission === "granted") {
      await expect(page.getByText(/Alarmlar ve hatırlatıcılar erişimi gerekli/)).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Tam zamanlı hatırlatıcı izni ver" }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByText(
          permission === "denied"
            ? /Android bildirim izni kapalı/
            : "Android bildirim izni bekleniyor.",
        ),
      ).toBeVisible();
      await page
        .getByRole("button", {
          name: permission === "denied" ? "Bildirim iznini kontrol et" : "Bildirim izni ver",
          exact: true,
        })
        .click();
      expect(
        await page.evaluate(
          () =>
            (window as unknown as { notificationTestState: { requests: number } })
              .notificationTestState.requests,
        ),
      ).toBe(1);
    }
  });

test("browser denied and unsupported states explain permission without blocking preferences", async ({
  page,
}) => {
  await session(page, { webPermission: "denied" });
  await ready(page);
  await expect(page.getByText(/Tarayıcı bildirim izni kapalı/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tarayıcı bildirimlerini etkinleştir" }),
  ).toBeDisabled();
  await page.unroute("**/api/**");
  await session(page, { unsupported: true });
  await ready(page);
  await expect(
    page.getByText("Bu cihazda bildirim desteği doğrulanamadı."),
  ).toBeVisible();
  await expect(card(page, "waterReminders").getByRole("switch")).toBeEnabled();
});

test("320px view and off categories retain configured program", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await session(page);
  await ready(page);
  await expect(card(page, "activityReminders")).toContainText("Her gün · 18:25");
  await card(page, "activityReminders")
    .getByRole("button", { name: "Aktivite hatırlatmaları detayları" })
    .click();
  await expect(page.locator("[data-notification-detail]")).toContainText("Hatırlatmalar kapalı");
  await fit(page);
});

test("all categories off still show saved program and editable entries", async ({ page }) => {
  await session(page, { allOff: true });
  await ready(page);
  for (const [key] of categories)
    await expect(card(page, key).getByRole("switch")).toHaveAttribute("aria-checked", "false");
  await expect(card(page, "waterReminders")).toContainText("Her gün · 13:55");
  await expect(card(page, "weeklySummary")).toContainText("Çarşamba · 11:40");
  await card(page, "waterReminders")
    .getByRole("button", { name: "Su hatırlatmaları detayları" })
    .click();
  await expect(page.locator("[data-water-reminders]")).toContainText("Hatırlatmalar kapalı");
});
