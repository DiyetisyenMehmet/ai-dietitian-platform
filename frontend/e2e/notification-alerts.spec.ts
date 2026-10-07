import { expect, test, type Page } from "@playwright/test";
const base = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3014";
interface AlertTestLog {
  settings: unknown[];
  previews: { category: string; preference: object }[];
  sounds: string[];
  schedules: number;
  cancels: number;
  permissionRequests: number;
  webNotifications: { title: string; options: { silent?: boolean; vibrate?: number[] } }[];
  failPreview: boolean;
}
const categories = ["meals", "water", "activity", "sleep", "weekly", "coach"] as const;
async function session(
  page: Page,
  options: { web?: boolean; legacy?: boolean; noVibration?: boolean; failLoad?: boolean } = {},
) {
  let failSave = false,
    delaySave = 0,
    failLoad = options.failLoad ?? false;
  let preferences: Record<string, unknown> = {
    mealReminders: true,
    waterReminders: true,
    activityReminders: true,
    sleepReminders: true,
    weeklySummary: true,
    coachTips: true,
    bloodTestReminders: false,
    productUpdates: false,
    waterReminderTime: "09:00",
    activityReminderTime: "18:00",
    sleepReminderTime: "22:30",
    weeklySummaryDay: 0,
    weeklySummaryTime: "10:00",
    timezoneOffsetMinutes: 0,
    categoryAlerts: {
      water: { soundPreset: "diewish_drop", vibrationPreset: "double_short" },
      meals: { soundPreset: "system", vibrationPreset: "off" },
    },
  };
  const writes: Record<string, unknown>[] = [],
    forbidden: string[] = [];
  await page.addInitScript(({ web, legacy, noVibration }) => {
    const log = {
      settings: [] as unknown[],
      previews: [] as unknown[],
      sounds: [] as string[],
      schedules: 0,
      cancels: 0,
      permissionRequests: 0,
      webNotifications: [] as unknown[],
      failPreview: false,
    };
    Object.assign(window, { alertTestLog: log });
    if (!web)
      Object.assign(window, {
        DiewishReminders: {
          isAvailable: () => true,
          permissionStatus: () => "granted",
          exactAlarmStatus: () => "granted",
          replaceSchedule: () => log.schedules++,
          replaceWellnessSchedule: () => log.schedules++,
          cancelNutrition: () => log.cancels++,
          cancelWellness: () => log.cancels++,
          cancelAll: () => log.cancels++,
          ...(legacy
            ? {}
            : {
                notificationAlertCapabilities: () =>
                  JSON.stringify({
                    version: 1,
                    customSounds: true,
                    vibration: !noVibration,
                    testNotification: true,
                  }),
                setNotificationAlertPreferences: (json: string) => {
                  log.settings.push(JSON.parse(json));
                  return true;
                },
                previewNotification: (category: string, json: string) => {
                  log.previews.push({ category, preference: JSON.parse(json) });
                  return log.failPreview ? "permission_denied" : "posted";
                },
                previewNotificationSound: (preset: string) => {
                  log.sounds.push(preset);
                  return true;
                },
              }),
        },
      });
    else {
      function BrowserNotification() {}
      Object.assign(BrowserNotification, {
        permission: "granted",
        requestPermission: async () => {
          log.permissionRequests++;
          return "granted";
        },
      });
      Object.assign(BrowserNotification.prototype, { silent: false });
      Object.defineProperty(window, "Notification", {
        configurable: true,
        value: BrowserNotification,
      });
      const registration = {
        showNotification: async (title: string, options: unknown) => {
          if (log.failPreview) throw new Error("Blocked");
          log.webNotifications.push({ title, options });
        },
      };
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: {
          register: async () => registration,
          ready: Promise.resolve(registration),
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        },
      });
    }
  }, options);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname,
      method = route.request().method();
    const ok = (data: unknown) => route.fulfill({ status: 200, json: { success: true, data } });
    const failure = () =>
      route.fulfill({
        status: 503,
        json: { success: false, error: { code: "TEST_FAILURE", message: "Test unavailable" } },
      });
    if (
      method !== "GET" &&
      !path.endsWith("/notifications/preferences") &&
      !path.endsWith("/auth/refresh-token")
    )
      forbidden.push(path);
    if (path.endsWith("/auth/refresh-token"))
      return ok({
        user: {
          id: "alert-test",
          fullName: "Bildirim Test",
          email: "alert@example.invalid",
          role: "USER",
          isActive: true,
          emailVerified: true,
          onboardingCompleted: true,
          createdAt: "2026-01-01T00:00:00Z",
        },
        tokens: { accessToken: "test-alert", tokenType: "Bearer", expiresIn: "15m" },
      });
    if (path.endsWith("/notifications/preferences")) {
      if (method === "PATCH") {
        const patch = route.request().postDataJSON();
        writes.push(patch);
        if (delaySave) await new Promise((resolve) => setTimeout(resolve, delaySave));
        if (failSave) return failure();
        preferences = {
          ...preferences,
          ...patch,
          categoryAlerts: { ...(preferences.categoryAlerts as object), ...patch.categoryAlerts },
        };
      } else if (failLoad) return failure();
      return ok({ preferences });
    }
    if (path.endsWith("/payments/subscription"))
      return ok({ tier: "PREMIUM", status: "ACTIVE", entitlements: {} });
    if (path.endsWith("/nutrition-plans")) return ok({ plans: [] });
    if (path.endsWith("/legal/consents")) return ok({ allMandatoryGranted: false, items: [] });
    return ok({});
  });
  return {
    writes,
    forbidden,
    value: () => preferences,
    failure: (value: boolean) => {
      failSave = value;
    },
    delay: (value: number) => {
      delaySave = value;
    },
    loadFailure: (value: boolean) => {
      failLoad = value;
    },
  };
}
for (const width of [390, 412, 430])
  for (const theme of ["light", "dark"])
    test(`six sound screens fit ${width}px ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width === 412 ? 915 : 844 });
      await page.addInitScript((theme) => localStorage.setItem("theme", theme), theme);
      await session(page);
      for (const category of categories) {
        await page.goto(`${base}/profile/notifications/${category}/sound`);
        await expect(page.locator(`[data-notification-alerts="${category}"]`)).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Test bildirimi gönder", exact: true }),
        ).toBeEnabled();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBeTruthy();
        expect(
          await page
            .getByRole("button", { name: "Test bildirimi gönder", exact: true })
            .evaluate((element) => element.getBoundingClientRect().height),
        ).toBeGreaterThanOrEqual(44);
        await page
          .getByRole("button", { name: "Test bildirimi gönder", exact: true })
          .scrollIntoViewIfNeeded();
        await expect(
          page.getByRole("button", { name: "Test bildirimi gönder", exact: true }),
        ).toBeInViewport();
        await page.screenshot({
          path: info.outputPath(`${category}-${width}-${theme}.png`),
          fullPage: true,
        });
      }
    });
test("category settings persist across refresh without enabling categories or changing their plan", async ({
  page,
}) => {
  const api = await session(page);
  const before = JSON.parse(JSON.stringify(api.value()));
  for (const category of categories) {
    await page.goto(`${base}/profile/notifications/${category}/sound`);
    await page.getByRole("radio", { name: "Diewish · Nazik", exact: true }).check();
    await page.getByRole("radio", { name: "Kısa - Uzun", exact: true }).check();
    await page.getByRole("button", { name: "Ses ve titreşimi kaydet" }).click();
    await expect(page.getByText("✓ Kaydedildi", { exact: true })).toBeVisible();
    expect(api.writes.at(-1)).toEqual({
      categoryAlerts: {
        [category]: { soundPreset: "diewish_gentle", vibrationPreset: "short_long" },
      },
    });
    await page.reload();
    await expect(page.getByRole("radio", { name: "Diewish · Nazik", exact: true })).toBeChecked();
  }
  const oldValues = Object.fromEntries(
    Object.entries(before).filter(([key]) => key !== "categoryAlerts"),
  );
  const newValues = Object.fromEntries(
    Object.entries(api.value()).filter(([key]) => key !== "categoryAlerts"),
  );
  expect(newValues).toEqual(oldValues);
  expect(api.forbidden).toEqual([]);
});
test("failed save restores the last stored choices and does not apply the draft on device", async ({
  page,
}) => {
  const api = await session(page);
  api.failure(true);
  await page.goto(`${base}/profile/notifications/water/sound`);
  await page.getByRole("radio", { name: "Diewish · Nazik", exact: true }).check();
  await page.getByRole("radio", { name: "Uzun", exact: true }).check();
  const count = await page.evaluate(
    () => (window as unknown as { alertTestLog: AlertTestLog }).alertTestLog.settings.length,
  );
  await page.getByRole("button", { name: "Ses ve titreşimi kaydet" }).click();
  await expect(page.getByText(/Son kayıtlı ses ve titreşim ayarların geri yüklendi/)).toBeVisible();
  await expect(page.getByRole("radio", { name: "Diewish · Damla", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Çift kısa", exact: true })).toBeChecked();
  expect(
    await page.evaluate(
      () => (window as unknown as { alertTestLog: AlertTestLog }).alertTestLog.settings.length,
    ),
  ).toBe(count);
  api.failure(false);
  await page.getByRole("radio", { name: "Sessiz", exact: true }).check();
  await page.getByRole("button", { name: "Ses ve titreşimi kaydet" }).click();
  await expect(page.getByText("✓ Kaydedildi", { exact: true })).toBeVisible();
});
test("test and audio previews never save preferences, schedule reminders or call the remote test endpoint", async ({
  page,
}) => {
  const api = await session(page);
  for (const category of categories) {
    await page.goto(`${base}/profile/notifications/${category}/sound`);
    await page.getByRole("radio", { name: "Diewish · Nazik", exact: true }).check();
    await page.getByRole("radio", { name: "Kısa", exact: true }).check();
    await page.getByRole("button", { name: "Diewish · Nazik sesini dinle" }).click();
    await page.getByRole("button", { name: "Test bildirimi gönder", exact: true }).click();
    await expect(page.getByText(/Test bildirimi bu cihazda gösterildi/)).toBeVisible();
  }
  expect(api.writes).toEqual([]);
  expect(api.forbidden).toEqual([]);
  const log = await page.evaluate(
    () => (window as unknown as { alertTestLog: AlertTestLog }).alertTestLog,
  );
  expect(log.schedules).toBe(0);
  expect(log.cancels).toBe(0);
  expect(log.previews.at(-1)).toEqual({
    category: "coach",
    preference: { soundPreset: "diewish_gentle", vibrationPreset: "short" },
  });
});
test("a failed test notification leaves saved and unsaved preferences intact", async ({ page }) => {
  const api = await session(page);
  await page.goto(`${base}/profile/notifications/coach/sound`);
  await page.getByRole("radio", { name: "Diewish · Nazik", exact: true }).check();
  await page.evaluate(() => {
    (window as unknown as { alertTestLog: AlertTestLog }).alertTestLog.failPreview = true;
  });
  await page.getByRole("button", { name: "Test bildirimi gönder", exact: true }).click();
  await expect(page.getByText(/Bildirim izni veya cihazın bildirim kanalı kapalı/)).toBeVisible();
  await expect(page.getByRole("radio", { name: "Diewish · Nazik", exact: true })).toBeChecked();
  expect(api.writes).toEqual([]);
  await page.getByRole("button", { name: "Ses ve titreşimi kaydet" }).click();
  await expect(page.getByText("✓ Kaydedildi", { exact: true })).toBeVisible();
});
test("double click while saving produces one preference patch", async ({ page }) => {
  const api = await session(page);
  api.delay(500);
  await page.goto(`${base}/profile/notifications/activity/sound`);
  await page.getByRole("radio", { name: "Sessiz", exact: true }).check();
  await page
    .getByRole("button", { name: "Ses ve titreşimi kaydet" })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(page.getByText("✓ Kaydedildi", { exact: true })).toBeVisible();
  expect(api.writes).toHaveLength(1);
});
test("web uses only real browser notification options and preserves another device's custom settings", async ({
  page,
}) => {
  const api = await session(page, { web: true });
  await page.goto(`${base}/profile/notifications/water/sound`);
  await expect(page.getByRole("radio", { name: "Diewish · Damla", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Diewish · Nazik", exact: true })).toBeDisabled();
  await expect(page.getByRole("radio", { name: "Çift kısa", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Test bildirimi gönder", exact: true }).click();
  await expect(
    page.getByText(/Özel ses ve titreşim desenleri bu tarayıcıda uygulanmaz/),
  ).toBeVisible();
  expect(api.writes).toEqual([]);
  expect(api.forbidden).toEqual([]);
  await page.getByRole("radio", { name: "Sessiz", exact: true }).check();
  await page.getByRole("button", { name: "Test bildirimi gönder", exact: true }).click();
  const log = await page.evaluate(
    () => (window as unknown as { alertTestLog: AlertTestLog }).alertTestLog,
  );
  expect(log.webNotifications.at(-1)!.options.silent).toBe(true);
  expect(log.webNotifications.at(-1)!.options).not.toHaveProperty("vibrate");
  expect(log.permissionRequests).toBe(0);
});
test("old native bridge and missing vibration hardware cannot advertise unsupported controls", async ({
  page,
}) => {
  await session(page, { legacy: true });
  await page.goto(`${base}/profile/notifications/water/sound`);
  await expect(page.getByRole("radio", { name: "Diewish · Nazik", exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Test bildirimi gönder", exact: true }),
  ).toBeDisabled();
});
test("device without vibration still supports sound previews", async ({ page }) => {
  await session(page, { noVibration: true });
  await page.goto(`${base}/profile/notifications/activity/sound`);
  await expect(page.getByRole("radio", { name: "Kısa", exact: true })).toBeDisabled();
  await expect(page.getByRole("radio", { name: "Diewish · Nazik", exact: true })).toBeEnabled();
});
test("load error offers retry without invented defaults", async ({ page }) => {
  const api = await session(page, { failLoad: true });
  await page.goto(`${base}/profile/notifications/water/sound`);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tekrar dene" })).toBeVisible();
  api.loadFailure(false);
  await page.getByRole("button", { name: "Tekrar dene" }).click();
  await expect(page.getByRole("radio", { name: "Diewish · Damla", exact: true })).toBeChecked();
});
