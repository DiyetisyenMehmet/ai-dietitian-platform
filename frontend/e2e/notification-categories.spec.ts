import { expect, test, type Page } from "@playwright/test";
const base = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const categories = ["meals", "activity", "sleep", "weekly", "coach"] as const;
const titles = {
  meals: "Öğün hatırlatmaları",
  activity: "Aktivite hatırlatmaları",
  sleep: "Uyku hazırlığı",
  weekly: "Haftalık özet",
  coach: "Diewish Koç bildirimleri",
};
function fixturePlan(offset = 1) {
  const start = new Date();
  start.setDate(start.getDate() + offset);
  const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  return {
    id: "active-plan",
    isActive: true,
    status: "COMPLETED",
    duration: "SEVEN_DAY",
    startDate: date,
    createdAt: date + "T00:00:00Z",
    updatedAt: date + "T00:00:00Z",
    version: 3,
    deletedAt: null,
    bmr: 1500,
    tdee: 1900,
    dailyCalories: 1900,
    proteinGrams: 110,
    carbsGrams: 200,
    fatGrams: 60,
    waterMl: 2000,
    mealsPerDay: 3,
    recommendations: [],
    summary: null,
    mealTiming: {
      mealsPerDay: 3,
      slots: [
        { name: "Kahvaltı", time: "08:30", calorieShare: 30 },
        { name: "Öğle", time: "12:45", calorieShare: 40 },
        { name: "Akşam", time: "19:15", calorieShare: 30 },
      ],
    },
    explanations: { calories: "", macros: "", water: "", mealTiming: "", overall: "" },
    dailyPlans: {
      durationDays: 7,
      cycleLengthDays: 7,
      calendar: Array.from({ length: 7 }, (_, i) => ({ dayNumber: i + 1, cycleIndex: i })),
      cycle: Array.from({ length: 7 }, (_, i) => ({
        dayLabel: `${i + 1}. gün`,
        totalCalories: 1900,
        totalProteinGrams: 110,
        totalCarbsGrams: 200,
        totalFatGrams: 60,
        meals: [
          { name: "Kahvaltı", time: "08:30" },
          { name: "Öğle", time: "12:45" },
          { name: "Akşam", time: "19:15" },
        ].map((m) => ({
          ...m,
          foods: [],
          calories: 600,
          proteinGrams: 35,
          carbsGrams: 65,
          fatGrams: 20,
          explanation: "",
        })),
      })),
    },
  };
}
async function session(
  page: Page,
  category: (typeof categories)[number] | "main",
  options: {
    native?: boolean;
    mealEnabled?: boolean;
    tier?: string;
    noPlan?: boolean;
    expired?: boolean;
    failContext?: boolean;
    failLoad?: boolean;
    loadDelay?: number;
  } = {},
) {
  const waterPlan = {
    version: 1,
    mode: "same",
    dailyTimes: ["09:00", "14:00"],
    days: Array.from({ length: 7 }, (_, day) => ({
      day,
      enabled: true,
      times: ["09:00", "14:00"],
    })),
  };
  let preferences: Record<string, unknown> = {
    mealReminders: options.mealEnabled ?? false,
    waterReminders: true,
    activityReminders: false,
    sleepReminders: true,
    weeklySummary: true,
    coachTips: false,
    bloodTestReminders: false,
    productUpdates: false,
    waterReminderTime: "09:00",
    waterReminderSchedule: waterPlan,
    activityReminderTime: "18:25",
    sleepReminderTime: "23:10",
    weeklySummaryDay: 3,
    weeklySummaryTime: "11:40",
    timezoneOffsetMinutes: 0,
  };
  let tier = options.tier ?? "PREMIUM",
    plans = options.noPlan ? [] : [fixturePlan(options.expired ? -20 : 1)],
    failSave = false,
    delaySave = 0,
    failLoad = options.failLoad ?? false,
    failContext = options.failContext ?? false;
  const writes: Record<string, unknown>[] = [],
    otherWrites: string[] = [];
  if (options.native !== false)
    await page.addInitScript(() => {
      const log = {
        wellness: [] as unknown[],
        meals: [] as { id: string; at: number }[][],
        nutritionCancels: 0,
        allCancels: 0,
        permissionRequests: 0,
      };
      Object.assign(window, {
        categoryNotificationLog: log,
        DiewishReminders: {
          isAvailable: () => true,
          permissionStatus: () => "granted",
          requestPermission: () => log.permissionRequests++,
          exactAlarmStatus: () => "granted",
          replaceWellnessSchedule: (json: string) => {
            log.wellness.push(JSON.parse(json));
            return JSON.parse(json).length;
          },
          cancelWellness: () => undefined,
          showTestNotification: () => true,
          replaceSchedule: (json: string) => {
            log.meals.push(JSON.parse(json));
            return JSON.parse(json).length;
          },
          cancelNutrition: () => log.nutritionCancels++,
          cancelAll: () => log.allCancels++,
        },
      });
    });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname,
      method = route.request().method();
    const ok = (data: unknown) => route.fulfill({ status: 200, json: { success: true, data } }),
      failed = () =>
        route.fulfill({
          status: 503,
          json: { success: false, error: { code: "TEST_UNAVAILABLE", message: "Unavailable" } },
        });
    if (
      method !== "GET" &&
      !path.endsWith("/notifications/preferences") &&
      !path.endsWith("/auth/refresh-token")
    )
      otherWrites.push(path);
    if (path.endsWith("/auth/refresh-token"))
      return ok({
        user: {
          id: "category-test",
          fullName: "Kategori Test",
          email: "category@example.invalid",
          role: "USER",
          isActive: true,
          emailVerified: true,
          onboardingCompleted: true,
          createdAt: "2026-01-01T00:00:00Z",
        },
        tokens: { accessToken: "category-test", tokenType: "Bearer", expiresIn: "15m" },
      });
    if (path.endsWith("/legal/consents")) return ok({ allMandatoryGranted: false, items: [] });
    if (path.endsWith("/notifications/preferences")) {
      if (method === "PATCH") {
        const patch = route.request().postDataJSON();
        writes.push(patch);
        if (delaySave) await new Promise((r) => setTimeout(r, delaySave));
        if (failSave) return failed();
        preferences = { ...preferences, ...patch };
      } else {
        if (options.loadDelay) await new Promise((r) => setTimeout(r, options.loadDelay));
        if (failLoad) return failed();
      }
      return ok({ preferences });
    }
    if (path.endsWith("/nutrition-plans")) return failContext ? failed() : ok({ plans });
    if (path.endsWith("/subscription"))
      return failContext
        ? failed()
        : ok({
            tier,
            status: tier === "FREE" ? "NONE" : "ACTIVE",
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            entitlements: [],
          });
    if (path.endsWith("/subscription/plans")) return ok({ plans: [] });
    if (path.endsWith("/payments")) return ok({ payments: [] });
    if (path.endsWith("/identity/firebase-config")) return ok({ configured: false, config: null });
    if (path.endsWith("/deviations")) return ok({ deviations: [] });
    return failed();
  });
  await page.goto(`${base}/profile/notifications${category === "main" ? "" : "/" + category}`);
  return {
    writes,
    otherWrites,
    preferences: () => preferences,
    waterPlan,
    failSave: (v: boolean) => {
      failSave = v;
    },
    delaySave: (v: number) => {
      delaySave = v;
    },
    failLoad: (v: boolean) => {
      failLoad = v;
    },
    failContext: (v: boolean) => {
      failContext = v;
    },
    tier: (v: string) => {
      tier = v;
    },
    plans: (v: typeof plans) => {
      plans = v;
    },
  };
}
const ready = (p: Page) => expect(p.locator("[data-notification-detail]")).toBeVisible();
const save = (p: Page) => p.getByRole("button", { name: "Kaydet", exact: true });
const log = (p: Page) =>
  p.evaluate(
    () =>
      (
        window as unknown as {
          categoryNotificationLog: {
            wellness: { type: string; id: string; at: number }[][];
            meals: { id: string; at: number }[][];
            nutritionCancels: number;
            allCancels: number;
            permissionRequests: number;
          };
        }
      ).categoryNotificationLog,
  );
async function fit(p: Page) {
  expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const width = p.viewportSize()!.width;
  for (const b of await p.locator("main input, main button").evaluateAll((nodes) =>
    nodes.map((n) => {
      const b = n.getBoundingClientRect();
      return { x: b.x, right: b.right };
    }),
  )) {
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.right).toBeLessThanOrEqual(width);
  }
}
for (const width of [390, 412, 430])
  for (const theme of ["light", "dark"])
    test(`all category details fit ${width}px ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 915 });
      await page.addInitScript((v) => localStorage.setItem("theme", v), theme);
      await session(page, "meals");
      for (const category of categories) {
        if (category !== "meals") await page.goto(`${base}/profile/notifications/${category}`);
        await ready(page);
        await expect(page.getByRole("heading", { name: titles[category], level: 1 })).toBeVisible();
        if (category === "meals") await expect(page.locator("[data-meal-preview]")).toBeVisible();
        await expect(page.locator("html")).toHaveClass(new RegExp(theme));
        await fit(page);
        await page.screenshot({
          path: `${test.info().outputDir}/${category}-${width}-${theme}.png`,
          fullPage: true,
        });
        await expect(page.getByRole("button", { name: "Saat ekle", exact: true })).toHaveCount(0);
      }
    });
for (const category of ["activity", "sleep"] as const)
  test(`${category} daily time and master save atomically, restore after failure and survive reload`, async ({
    page,
  }) => {
    const s = await session(page, category);
    await ready(page);
    const label = category === "activity" ? "Hareket hatırlatma saati" : "Uykuya hazırlık saati",
      field = category === "activity" ? "activityReminderTime" : "sleepReminderTime",
      initial = category === "activity" ? "18:25" : "23:10";
    await page.getByLabel(label).fill("16:45");
    await page.getByRole("switch", { name: titles[category] }).click();
    const before = await log(page);
    s.failSave(true);
    await save(page).click();
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "Son kayıtlı ayarların geri yüklendi",
    );
    await expect(page.getByLabel(label)).toHaveValue(initial);
    expect((await log(page)).wellness).toEqual(before.wellness);
    s.failSave(false);
    s.delaySave(350);
    await page.getByLabel(label).fill("16:45");
    await page.getByRole("switch", { name: titles[category] }).click();
    await save(page).evaluate((n) => {
      (n as HTMLButtonElement).click();
      (n as HTMLButtonElement).click();
    });
    await expect(page.getByLabel(label)).toBeDisabled();
    await expect(page.getByText("✓ Kaydedildi", { exact: true })).toBeVisible();
    expect(s.writes).toHaveLength(2);
    expect(Object.keys(s.writes[1]).sort()).toEqual(
      [
        category === "activity" ? "activityReminders" : "sleepReminders",
        field,
        "timezoneOffsetMinutes",
      ].sort(),
    );
    expect(s.preferences().waterReminderSchedule).toEqual(s.waterPlan);
    const rows = (await log(page)).wellness.at(-1)!;
    expect(rows.length).toBeLessThanOrEqual(116);
    expect(rows.every((row) => ["water", "activity", "sleep"].includes(row.type))).toBe(true);
    await page.reload();
    await ready(page);
    await expect(page.getByLabel(label)).toHaveValue("16:45");
    expect(s.otherWrites).toEqual([]);
  });
test("weekly keeps one server day/time and never schedules a local weekly alarm", async ({
  page,
}) => {
  const s = await session(page, "weekly");
  await ready(page);
  await page.getByRole("button", { name: "Pazar", exact: true }).click();
  await page.getByLabel("Özet saati").fill("10:30");
  await save(page).click();
  await expect(page.getByText("✓ Kaydedildi", { exact: true })).toBeVisible();
  expect(s.writes).toEqual([
    {
      weeklySummary: true,
      weeklySummaryTime: "10:30",
      timezoneOffsetMinutes: 0,
      weeklySummaryDay: 0,
    },
  ]);
  expect((await log(page)).wellness).toEqual([]);
  expect((await log(page)).meals).toEqual([]);
  expect(s.otherWrites).toEqual([]);
  await page.reload();
  await ready(page);
  await expect(page.getByRole("button", { name: "Pazar", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByLabel("Özet saati")).toHaveValue("10:30");
});
test("coach is event-driven, persists its opt-in and creates no repeated local schedule", async ({
  page,
}) => {
  const s = await session(page, "coach");
  await ready(page);
  await expect(page.locator('input[type="time"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Koç ekranını aç" })).toHaveAttribute("href", "/ai");
  await page.getByRole("switch").click();
  await save(page).click();
  await expect(page.getByText("✓ Kaydedildi", { exact: true })).toBeVisible();
  expect(s.writes).toEqual([{ coachTips: true }]);
  expect((await log(page)).wellness).toEqual([]);
  expect((await log(page)).meals).toEqual([]);
  expect(s.otherWrites).toEqual([]);
  await page.reload();
  await ready(page);
  await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "true");
});
test("coach failure restores the saved opt-out without changing other categories", async ({
  page,
}) => {
  const s = await session(page, "coach");
  await ready(page);
  s.failSave(true);
  await page.getByRole("switch").click();
  await save(page).click();
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  expect(s.preferences().weeklySummary).toBe(true);
});
test("meal premium opt-in uses the existing calendar and scheduler without plan writes", async ({
  page,
}) => {
  const s = await session(page, "meals");
  await ready(page);
  await expect(page.locator("[data-meal-preview]")).toContainText("Kahvaltı");
  await expect(page.locator("[data-meal-preview]")).toContainText("08:30");
  await expect(page.getByRole("switch")).toBeEnabled();
  await expect(page.locator('input[type="time"]')).toHaveCount(0);
  await page.getByRole("switch").click();
  await save(page).click();
  await expect(page.getByText("✓ Kaydedildi", { exact: true })).toBeVisible();
  expect(s.writes).toEqual([{ mealReminders: true }]);
  const native = await log(page);
  expect(native.meals.at(-1)).toHaveLength(21);
  expect(native.meals.at(-1)!.every((row) => row.id.startsWith("active-plan:"))).toBe(true);
  expect(native.allCancels).toBe(0);
  expect(native.wellness).toEqual([]);
  expect(s.otherWrites).toEqual([]);
  await page.reload();
  await ready(page);
  await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "true");
});
for (const variant of ["free", "no-plan", "expired"] as const)
  test(`meal ${variant} gate preserves plan-based rules`, async ({ page }) => {
    const s = await session(page, "meals", {
      tier: variant === "free" ? "FREE" : "PREMIUM",
      noPlan: variant === "no-plan",
      expired: variant === "expired",
    });
    await ready(page);
    await expect(page.locator("[data-meal-gate]")).toBeVisible();
    await expect(page.getByRole("switch")).toBeDisabled();
    await expect(save(page)).toBeDisabled();
    expect(s.writes).toEqual([]);
    expect((await log(page)).meals).toEqual([]);
    await expect(page.getByRole("link", { name: "Öğün planını aç" })).toHaveAttribute(
      "href",
      "/meals/plan",
    );
  });
test("meal save rechecks an entitlement that changed after the preview", async ({ page }) => {
  const s = await session(page, "meals");
  await ready(page);
  await expect(page.getByRole("switch")).toBeEnabled();
  await page.getByRole("switch").click();
  s.tier("FREE");
  await save(page).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Premium");
  await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  expect(s.writes).toEqual([]);
  expect((await log(page)).meals).toEqual([]);
});
test("failed meal opt-out preserves native alarms, successful opt-out cancels only meals", async ({
  page,
}) => {
  const s = await session(page, "meals", { mealEnabled: true });
  await ready(page);
  await page.getByRole("switch").click();
  s.failSave(true);
  const before = await log(page);
  await save(page).click();
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  expect((await log(page)).nutritionCancels).toBe(before.nutritionCancels);
  s.failSave(false);
  await page.getByRole("switch").click();
  await save(page).click();
  await expect(page.getByText("✓ Kaydedildi", { exact: true })).toBeVisible();
  const after = await log(page);
  expect(after.nutritionCancels).toBe(before.nutritionCancels + 1);
  expect(after.allCancels).toBe(0);
  expect(after.wellness).toEqual(before.wellness);
});
test("meal context failure permits opt-out and exposes a working retry", async ({ page }) => {
  const s = await session(page, "meals", { failContext: true, mealEnabled: true });
  await ready(page);
  await expect(page.locator("main").getByRole("alert")).toContainText("abonelik");
  await expect(page.getByRole("switch")).toBeEnabled();
  await page.getByRole("switch").click();
  await save(page).click();
  await expect(page.getByText("✓ Kaydedildi", { exact: true })).toBeVisible();
  s.failContext(false);
  await page.getByRole("button", { name: "Planı tekrar kontrol et", exact: true }).click();
  await expect(page.locator("[data-meal-preview]")).toBeVisible();
  await expect(page.getByRole("switch")).toBeEnabled();
});
test("overview meal opt-in respects subscription, and enabled meal opt-out preserves wellness", async ({
  page,
}) => {
  const s = await session(page, "main", { tier: "FREE" });
  const card = page.locator('[data-notification-category="mealReminders"]');
  await expect(card).toBeVisible();
  await card.getByRole("switch").click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Premium");
  expect(s.writes).toEqual([]);
  await expect(card.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  s.tier("PREMIUM");
  await card.getByRole("switch").click();
  await expect(card.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  const before = await log(page);
  expect(before.meals.at(-1)).toHaveLength(21);
  await card.getByRole("switch").click();
  await expect(card.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  const after = await log(page);
  expect(after.nutritionCancels).toBe(before.nutritionCancels + 1);
  expect(after.allCancels).toBe(0);
  expect(after.wellness.at(-1)!.filter((row) => row.type === "water")).toEqual(
    before.wellness.at(-1)!.filter((row) => row.type === "water"),
  );
});
test("preferences load error retries without editable synthetic defaults", async ({ page }) => {
  const s = await session(page, "sleep", { failLoad: true, loadDelay: 500, native: false });
  await expect(page.getByText("Bildirim tercihlerin yükleniyor…", { exact: true })).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(0);
  s.failLoad(false);
  await page.getByRole("button", { name: "Tekrar dene", exact: true }).click();
  await ready(page);
  await expect(page.getByLabel("Uykuya hazırlık saati")).toHaveValue("23:10");
});
for (const category of ["activity", "weekly", "coach", "meals"] as const)
  test(`${category} saves through the common account API without a native bridge`, async ({
    page,
  }) => {
    const s = await session(page, category, { native: false });
    await ready(page);
    await expect(page.getByRole("switch")).toBeEnabled();
    await page.getByRole("switch").click();
    await save(page).click();
    await expect(page.getByText("✓ Kaydedildi", { exact: true })).toBeVisible();
    expect(s.writes).toHaveLength(1);
    expect(await page.evaluate(() => "DiewishReminders" in window)).toBe(false);
    expect(s.preferences().waterReminderSchedule).toEqual(s.waterPlan);
  });

test("the existing meal-plan toggle keeps alarms on failed saves and never clears wellness", async ({
  page,
}) => {
  const s = await session(page, "meals", { mealEnabled: true });
  await ready(page);
  await page.getByRole("link", { name: "Öğün planını aç", exact: true }).click();
  const reminders = page.locator("[data-nutrition-reminders]");
  await expect(reminders.getByRole("button", { name: "Kapat", exact: true })).toBeVisible();
  await expect.poll(async () => (await log(page)).meals.length).toBeGreaterThan(0);
  const before = await log(page);
  s.failSave(true);
  s.delaySave(350);
  await reminders.getByRole("button", { name: "Kapat", exact: true }).evaluate((n) => {
    (n as HTMLButtonElement).click();
    (n as HTMLButtonElement).click();
  });
  await expect(reminders.getByRole("button")).toBeDisabled();
  await expect(reminders.getByRole("button", { name: "Kapat", exact: true })).toBeEnabled();
  expect(s.writes).toHaveLength(1);
  expect((await log(page)).nutritionCancels).toBe(before.nutritionCancels);
  s.failSave(false);
  await reminders.getByRole("button", { name: "Kapat", exact: true }).click();
  await expect(reminders.getByRole("button", { name: "Aç", exact: true })).toBeEnabled();
  expect((await log(page)).nutritionCancels).toBeGreaterThan(before.nutritionCancels);
  expect((await log(page)).allCancels).toBe(0);
  expect(s.otherWrites).toEqual([]);
});

test("meal-plan reminders observe permission revocation and restoration without account writes", async ({
  page,
}) => {
  const s = await session(page, "meals", { mealEnabled: true });
  await ready(page);
  await page.getByRole("link", { name: "Öğün planını aç", exact: true }).click();
  const reminders = page.locator("[data-nutrition-reminders]");
  await expect(reminders).toContainText("bu cihazda yerel bildirimler açık");
  await expect.poll(async () => (await log(page)).meals.length).toBeGreaterThan(0);
  const before = await log(page);
  await page.evaluate(() => {
    window.DiewishReminders!.permissionStatus = () => "denied";
    window.dispatchEvent(new Event("diewish:notification-state"));
  });
  await expect(reminders).toContainText("bildirim izni bekleniyor");
  await expect
    .poll(async () => (await log(page)).nutritionCancels)
    .toBeGreaterThan(before.nutritionCancels);
  const denied = await log(page);
  await page.evaluate(() => {
    window.DiewishReminders!.permissionStatus = () => "granted";
    window.dispatchEvent(new Event("focus"));
  });
  await expect(reminders).toContainText("bu cihazda yerel bildirimler açık");
  await expect
    .poll(async () => (await log(page)).meals.length)
    .toBeGreaterThan(denied.meals.length);
  expect((await log(page)).allCancels).toBe(0);
  expect((await log(page)).wellness).toEqual(before.wellness);
  expect(s.writes).toEqual([]);
  expect(s.otherWrites).toEqual([]);
});
