import { expect, test, type BrowserContext } from "@playwright/test";
const base = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3014";
const categories = ["meals", "water", "activity", "sleep", "weekly", "coach"] as const;
const labels = [
  "Öğün hatırlatmaları",
  "Su hatırlatmaları",
  "Aktivite hatırlatmaları",
  "Uyku hazırlığı",
  "Haftalık özet",
  "Diewish Koç bildirimleri",
];
function initial() {
  return {
    mealReminders: true,
    waterReminders: true,
    activityReminders: true,
    sleepReminders: true,
    weeklySummary: true,
    coachTips: true,
    bloodTestReminders: false,
    productUpdates: false,
    waterReminderTime: "08:15",
    activityReminderTime: "18:35",
    sleepReminderTime: "22:45",
    weeklySummaryDay: 4,
    weeklySummaryTime: "11:25",
    timezoneOffsetMinutes: 0,
    waterReminderSchedule: {
      version: 1,
      mode: "same",
      dailyTimes: ["08:15", "13:20", "19:30"],
      days: Array.from({ length: 7 }, (_, day) => ({
        day,
        enabled: true,
        times: ["08:15", "13:20", "19:30"],
      })),
    },
    categoryAlerts: Object.fromEntries(
      categories.map((category) => [
        category,
        { soundPreset: "diewish_drop", vibrationPreset: "double_short" },
      ]),
    ),
  };
}
interface Store {
  value: Record<string, unknown>;
  writes: Record<string, unknown>[];
  forbidden: string[];
  expired?: boolean;
}
async function session(
  context: BrowserContext,
  store: Store,
  options: { native: boolean; permission?: string },
) {
  await context.addInitScript(({ native, permission }) => {
    const state = { permission, requests: 0, settings: 0, deletes: 0, cancels: 0 };
    Object.assign(window, { phase5Device: state });
    if (native)
      Object.assign(window, {
        DiewishReminders: {
          isAvailable: () => true,
          permissionStatus: () => state.permission,
          requestPermission: () => state.requests++,
          openNotificationSettings: () => state.settings++,
          exactAlarmStatus: () => "granted",
          pushToken: () => "",
          ensurePushToken: () => undefined,
          appVersion: () => "phase5",
          replaceWellnessSchedule: (raw: string) => JSON.parse(raw).length,
          cancelWellness: () => undefined,
          cancelNutrition: () => undefined,
          cancelAll: () => state.cancels++,
          clearNotificationInbox: () => undefined,
          clearPendingNotificationPath: () => undefined,
          deletePushToken: () => state.deletes++,
          showTestNotification: () => false,
          notificationAlertCapabilities: () =>
            JSON.stringify({
              version: 1,
              customSounds: true,
              vibration: true,
              testNotification: true,
            }),
          setNotificationAlertPreferences: () => true,
          previewNotification: () =>
            state.permission === "granted" ? "posted" : "permission_denied",
        },
      });
  }, options);
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname,
      method = route.request().method();
    const ok = (data: unknown) => route.fulfill({ status: 200, json: { success: true, data } });
    if (
      store.expired &&
      (path.endsWith("/auth/refresh-token") || path.endsWith("/notifications/preferences"))
    )
      return route.fulfill({
        status: 401,
        json: { success: false, error: { code: "UNAUTHORIZED", message: "Test session expired" } },
      });
    if (path.endsWith("/auth/refresh-token"))
      return ok({
        user: {
          id: "phase5-account",
          fullName: "Bildirim Test",
          email: "phase5@example.invalid",
          role: "USER",
          isActive: true,
          emailVerified: true,
          onboardingCompleted: true,
          createdAt: "2026-01-01T00:00:00Z",
        },
        tokens: { accessToken: "phase5", tokenType: "Bearer", expiresIn: "15m" },
      });
    if (path.endsWith("/notifications/preferences")) {
      if (method === "PATCH") {
        const patch = route.request().postDataJSON();
        store.writes.push(patch);
        store.value = {
          ...store.value,
          ...patch,
          categoryAlerts: { ...(store.value.categoryAlerts as object), ...patch.categoryAlerts },
        };
      }
      return ok({ preferences: store.value });
    }
    if (method !== "GET") store.forbidden.push(path);
    if (path.endsWith("/payments/subscription"))
      return ok({ tier: "PREMIUM", status: "ACTIVE", entitlements: {} });
    if (path.endsWith("/nutrition-plans")) return ok({ plans: [] });
    if (path.endsWith("/legal/consents")) return ok({ allMandatoryGranted: false, items: [] });
    if (path.endsWith("/identity/firebase-config")) return ok({ configured: false, config: null });
    return ok({});
  });
}
for (const width of [390, 412, 430])
  for (const theme of ["light", "dark"])
    test(`device permission lifecycle stays truthful ${width}px ${theme}`, async ({
      context,
      page,
    }) => {
      const store: Store = { value: initial(), writes: [], forbidden: [] };
      await session(context, store, { native: true, permission: "default" });
      await page.setViewportSize({ width, height: width === 412 ? 915 : 844 });
      await page.goto(base + "/profile/notifications/water");
      await page.evaluate(
        (theme) => document.documentElement.classList.toggle("dark", theme === "dark"),
        theme,
      );
      const notice = page.locator("[data-notification-device-notice]");
      await expect(notice).toContainText("önce izin");
      await notice.getByRole("button", { name: "Bu cihazda bildirim izni ver" }).click();
      await expect(notice).toContainText("önce izin");
      expect(await page.evaluate(() => (window as any).phase5Device.requests)).toBe(1);
      await page.evaluate(() => {
        (window as any).phase5Device.permission = "denied";
        window.dispatchEvent(new Event("diewish:notification-state"));
      });
      await expect(notice).toContainText("izin açılana kadar");
      await notice.getByRole("button", { name: "Cihaz bildirim ayarlarını aç" }).click();
      expect(await page.evaluate(() => (window as any).phase5Device.settings)).toBe(1);
      await page.evaluate(() => {
        (window as any).phase5Device.permission = "granted";
        window.dispatchEvent(new Event("focus"));
      });
      await expect(notice).toHaveCount(0);
      await page.evaluate(() => {
        (window as any).phase5Device.permission = "unavailable";
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await expect(notice).toContainText("teslim etkinleşmiş sayılmaz");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(store.writes).toEqual([]);
      expect(store.forbidden).toEqual([]);
    });
test("all categories rehydrate after refresh and a fresh browser session without synchronizing device denial", async ({
  browser,
}) => {
  const store: Store = { value: initial(), writes: [], forbidden: [] };
  const first = await browser.newContext({ timezoneId: "UTC" });
  await session(first, store, { native: true, permission: "denied" });
  const page = await first.newPage();
  await page.goto(base + "/profile/notifications");
  await expect(page.locator("[data-notification-preferences]")).toBeVisible();
  for (const label of labels) {
    await page.getByRole("switch", { name: label, exact: true }).click();
    await expect(page.getByRole("switch", { name: label, exact: true })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  }
  await page.reload();
  for (const label of labels)
    await expect(page.getByRole("switch", { name: label, exact: true })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  await first.close();
  const second = await browser.newContext({ timezoneId: "UTC" });
  await session(second, store, { native: true, permission: "granted" });
  const fresh = await second.newPage();
  await fresh.goto(base + "/profile/notifications");
  for (const label of labels)
    await expect(fresh.getByRole("switch", { name: label, exact: true })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  for (const category of categories) {
    await fresh.goto(`${base}/profile/notifications/${category}/sound`);
    await expect(fresh.locator(`[data-notification-alerts="${category}"]`)).toBeVisible();
    await expect(fresh.getByRole("radio", { name: "Diewish · Damla", exact: true })).toBeChecked();
    await expect(fresh.getByRole("radio", { name: "Çift kısa", exact: true })).toBeChecked();
  }
  for (const patch of store.writes)
    for (const field of ["permission", "pushToken", "nativeChannel", "repeatDays", "hapticSupport"])
      expect(field in patch).toBe(false);
  expect(store.forbidden).toEqual([]);
  await second.close();
});
test("real Chromium notification API reports device permission truthfully without account changes", async ({
  context,
  page,
}) => {
  const store: Store = { value: initial(), writes: [], forbidden: [] };
  await session(context, store, { native: false });
  await context.grantPermissions(["notifications"], { origin: base });
  await page.goto(base + "/profile/notifications/activity");
  await expect(page.locator('[data-notification-detail="activity"]')).toBeVisible();
  const reported = await page.evaluate(() => Notification.permission);
  if (reported !== "granted") {
    // Some headless engines deny OS notifications even after a permission override.
    await expect(page.locator("[data-notification-device-notice]")).toContainText(
      "bildirim izni kapalı",
    );
    expect(store.writes).toEqual([]);
    return;
  }
  expect(reported).toBe("granted");
  await expect(page.locator("[data-notification-device-notice]")).toHaveCount(0);
  await context.grantPermissions([], { origin: base });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect(await page.evaluate(() => Notification.permission)).toBe("denied");
  await expect(page.locator("[data-notification-device-notice]")).toContainText(
    "site ayarlarından",
  );
  await context.clearPermissions();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect(await page.evaluate(() => Notification.permission)).toBe("default");
  await expect(page.locator("[data-notification-device-notice]")).toContainText("önce izin");
  expect(store.writes).toEqual([]);
});
test("overview test uses only device preview and failure preserves account preferences", async ({
  context,
  page,
}) => {
  const store: Store = { value: initial(), writes: [], forbidden: [] };
  await session(context, store, { native: true, permission: "granted" });
  await page.goto(base + "/profile/notifications");
  await expect(page.locator("[data-notification-preferences]")).toBeVisible();
  await page.evaluate(() => {
    (window as any).phase5Device.permission = "denied";
  });
  await page.getByRole("button", { name: "Test bildirimi gönder", exact: true }).click();
  await expect(
    page.getByText(
      "Bildirim izni veya cihazın bildirim kanalı kapalı. Cihaz ayarlarını kontrol et.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(store.forbidden).toEqual([]);
  expect(store.writes).toEqual([]);
  expect(store.value.waterReminders).toBe(true);
});
test("profile logout releases the device and clears local queues with HttpOnly cookie sessions", async ({
  context,
  page,
}) => {
  const store: Store = { value: initial(), writes: [], forbidden: [] };
  await session(context, store, { native: true, permission: "granted" });
  await page.goto(base + "/profile");
  await page.getByText("Çıkış yap", { exact: true }).waitFor();
  await page.evaluate(() => {
    (window as any).DiewishReminders.pushToken = () => "phase5-device-token-1234567890";
  });
  await page.getByText("Çıkış yap", { exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(store.forbidden).toContain("/api/notifications/devices/unregister");
  expect(store.forbidden).toContain("/api/auth/logout");
  expect(await page.evaluate(() => (window as any).phase5Device.deletes)).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as any).phase5Device.cancels)).toBeGreaterThan(0);
  expect(store.writes).toEqual([]);
});

test("expired session clears the device even if an older cancel method fails", async ({
  context,
  page,
}) => {
  const store: Store = { value: initial(), writes: [], forbidden: [] };
  await session(context, store, { native: true, permission: "granted" });
  await page.goto(base + "/profile/notifications");
  await expect(page.locator("[data-notification-preferences]")).toBeVisible();
  await page.evaluate(() => {
    (window as any).DiewishReminders.cancelAll = () => {
      throw new Error("Older bridge failed");
    };
  });
  store.expired = true;
  await page
    .getByRole("button", { name: "Aktivite hatırlatmaları detayları", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login/);
  expect(await page.evaluate(() => (window as any).phase5Device.deletes)).toBeGreaterThan(0);
});
