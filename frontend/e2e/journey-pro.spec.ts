import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_DASHBOARD_CARD_PREFERENCES } from "../src/domain/account/dashboard-card-preferences";
import type { NutritionPlanRecord } from "../src/infrastructure/nutrition/nutrition-plan-client";

type Log = Record<string, unknown>;
const today = "2026-10-23";
const meal = (name: string, time: string, food: string) => ({
  name,
  time,
  foods: [{ name: food, portion: "1 kase", calories: 190 }],
  calories: 190,
  proteinGrams: 8,
  carbsGrams: 22,
  fatGrams: 5,
  explanation: "",
});
function activePlan(startDate: string | undefined = today): NutritionPlanRecord {
  return {
    id: "synthetic-plan",
    startDate,
    duration: "SEVEN_DAY",
    isActive: true,
    status: "COMPLETED",
    createdAt: `${today}T07:00:00Z`,
    updatedAt: `${today}T07:00:00Z`,
    dailyCalories: 2100,
    proteinGrams: 80,
    carbsGrams: 240,
    fatGrams: 70,
    dailyPlans: {
      durationDays: 2,
      cycleLengthDays: 2,
      calendar: [
        { dayNumber: 1, cycleIndex: 1 },
        { dayNumber: 2, cycleIndex: 0 },
      ],
      cycle: [
        { dayLabel: "2", meals: [meal("Kahvaltı", "09:25", "İkinci gün yulafı")] },
        {
          dayLabel: "1",
          meals: [
            meal("Kahvaltı", "08:25", "Yulaf"),
            meal("Öğle yemeği", "13:25", "Mercimek çorbası"),
            meal("Akşam yemeği", "19:25", "Sebzeli bulgur"),
          ],
        },
      ],
    },
  } as NutritionPlanRecord;
}
function log(id: string, mealType: string): Log {
  return {
    id,
    userId: "synthetic-a",
    mealType,
    name: null,
    calories: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    sodiumMg: null,
    sugarG: null,
    loggedAt: `${today}T07:00:00Z`,
    createdAt: `${today}T07:00:00Z`,
  };
}
async function fixture(
  page: Page,
  options: {
    plan?: NutritionPlanRecord | null;
    complete?: boolean;
    unknown?: boolean;
    due?: boolean;
    delayPlan?: boolean;
  } = {},
) {
  await page.clock.install({ time: new Date(`${today}T14:00:00+03:00`) });
  const state = {
    owner: "synthetic-a",
    plan: options.plan === undefined ? activePlan() : options.plan,
    meals: options.complete
      ? [log("b", "BREAKFAST"), log("l", "LUNCH"), log("d", "DINNER")]
      : [log("b", "BREAKFAST")],
    posts: [] as Log[],
    deletes: [] as string[],
    fail: false,
    hold: false,
    water: options.complete ? 2100 : 750,
    waterPosts: 0,
    delayPlan: Boolean(options.delayPlan),
  };
  let releasePlan!: () => void;
  const planGate = new Promise<void>((resolve) => {
    releasePlan = resolve;
  });
  let releaseWrite!: () => void;
  let writeGate = Promise.resolve();
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:3029") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const path = url.pathname.slice(4),
      method = route.request().method();
    const ok = (data: unknown) => route.fulfill({ json: { success: true, data } });
    const fail = () =>
      route.fulfill({
        status: 503,
        json: { success: false, error: { code: "QA_UNAVAILABLE", message: "Synthetic failure" } },
      });
    if (["/auth/refresh-token", "/auth/login"].includes(path))
      return ok({
        user: {
          id: state.owner,
          fullName: "Yolculuk Testi",
          email: "journey@example.com",
          role: "USER",
          isActive: true,
          emailVerified: true,
          onboardingCompleted: true,
          createdAt: `${today}T00:00:00Z`,
        },
        tokens: { accessToken: "synthetic-test-token", tokenType: "Bearer", expiresIn: "1h" },
      });
    if (path === "/auth/logout") return ok({});
    if (path === "/legal/consents")
      return ok({ items: [], allMandatoryGranted: true, missingMandatory: [] });
    if (path === "/legal/documents") return ok({ documents: [] });
    if (path === "/account/dashboard-cards")
      return ok({ preferences: DEFAULT_DASHBOARD_CARD_PREFERENCES });
    if (path === "/onboarding")
      return ok({
        profile: {
          fullName: "Yolculuk Testi",
          age: 36,
          gender: "PREFER_NOT_TO_SAY",
          heightCm: 175,
          currentWeightKg: 70,
          targetWeightKg: 65,
          activityLevel: "MODERATE",
          dietaryPreference: "OMNIVORE",
          healthConditions: [],
          allergies: [],
          dailyWaterGoalMl: 2100,
          usualWakeTime: "07:00",
          usualSleepTime: "23:00",
          workScheduleType: "REGULAR",
        },
      });
    if (path === "/nutrition-plans") {
      const snapshot = state.plan;
      if (state.delayPlan) {
        await planGate;
      }
      return ok({ plans: snapshot ? [snapshot] : [] });
    }
    if (path.endsWith("/capabilities")) return ok({ resumable: false });
    if (path === "/tracking/meals" && method === "POST") {
      const input = route.request().postDataJSON();
      state.posts.push(input);
      if (state.hold) await writeGate;
      if (state.fail) return fail();
      const saved = log(`saved-${state.posts.length}`, input.mealType);
      state.meals.push(saved);
      return ok({ log: saved });
    }
    if (path.startsWith("/tracking/meals/") && method === "DELETE") {
      state.deletes.push(path);
      state.meals = state.meals.filter((item) => !path.endsWith(`/${item.id}`));
      return route.fulfill({ status: 204 });
    }
    if (path === "/tracking/meals") return options.unknown ? fail() : ok({ logs: state.meals });
    if (path === "/tracking/water" && method === "POST") {
      state.waterPosts++;
      state.water += 250;
      return ok({ log: { id: "water-post", amountMl: 250, loggedAt: `${today}T11:00:00Z` } });
    }
    if (path === "/tracking/water")
      return options.unknown
        ? fail()
        : ok({ logs: [{ id: "water", amountMl: state.water, loggedAt: `${today}T07:00:00Z` }] });
    if (path === "/tracking/weight/check-in")
      return ok({
        checkIn: {
          active: true,
          required: Boolean(options.due),
          lastLoggedAt: null,
          nextDueAt: options.due ? `${today}T00:00:00Z` : "2026-10-28T00:00:00Z",
          overdueDays: 0,
          intervalDays: 7,
        },
      });
    if (path === "/tracking/weight") return ok({ logs: [] });
    if (path === "/activity") return ok({ activities: [] });
    if (path === "/sleep/daily-assessment")
      return ok({ assessment: { entries: 0, totalDurationMinutes: 0 } });
    if (path === "/blood-tests/analyses") return ok({ analyses: [] });
    if (path === "/notifications") return ok({ notifications: [], unreadCount: 0 });
    return route.fulfill({
      status: 503,
      json: {
        success: false,
        error: { code: "QA_NOT_USED", message: "Synthetic test: unconfigured API" },
      },
    });
  });
  return {
    state,
    releasePlan() {
      state.delayPlan = false;
      releasePlan();
    },
    holdWrite() {
      state.hold = true;
      writeGate = new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
    },
    releaseWrite() {
      state.hold = false;
      releaseWrite();
    },
  };
}
const section = (page: Page) => page.locator("[data-daily-journey-section]");
async function open(page: Page) {
  await page.goto("/dashboard");
  await expect(section(page)).toBeVisible({ timeout: 60000 });
}
for (const width of [390, 412, 430])
  for (const theme of ["light", "dark"] as const) {
    test(`${width}px ${theme}: actual React dashboard, real plan and responsive controls`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 932 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
      await fixture(page);
      await open(page);
      const card = section(page);
      await expect(card.locator("[data-journey-plan-meal]")).toContainText("Mercimek çorbası");
      await expect(card.locator("time")).toHaveText("13:25");
      await expect(card).toContainText("1/4 adım");
      await expect(card).toContainText("%25");
      await expect(card.locator("[data-journey-next]")).toContainText("Öğle yemeği");
      await expect(card.getByRole("link", { name: "Farklı yedim", exact: true })).toHaveAttribute(
        "href",
        "/meals/add?slot=lunch",
      );
      await expect(card).not.toContainText("Kayıt zamanı geçti");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      for (const control of await card.locator("a,button").all()) {
        if (await control.isVisible())
          expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await expect(page.locator("[data-dashboard-metrics]")).toBeVisible();
      const toggle = card.locator("[data-journey-details-toggle]");
      await toggle.focus();
      await toggle.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await toggle.press("Space");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await page.evaluate(() => document.fonts.ready);
      await card.screenshot({
        path: info.outputPath(`journey-pro-${width}-${theme}.png`),
        animations: "disabled",
      });
      await page.screenshot({
        path: info.outputPath(`dashboard-pro-${width}-${theme}.png`),
        fullPage: true,
        animations: "disabled",
      });
    });
  }
test("double click, failed save, retry and persisted undo never invent macros", async ({
  page,
}) => {
  const f = await fixture(page);
  await open(page);
  const card = section(page);
  const eat = card.getByRole("button", { name: "Yedim", exact: true });
  await expect(eat).toBeVisible();
  f.state.fail = true;
  f.holdWrite();
  await eat.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect.poll(() => f.state.posts.length).toBe(1);
  await expect(card.getByRole("button", { name: "Kaydediliyor…" }).first()).toBeDisabled();
  f.releaseWrite();
  await expect(card).toContainText("İşlem tamamlanamadı");
  await expect(card).toContainText("1/4 adım");
  f.state.fail = false;
  await eat.click();
  await expect(card).toContainText("Öğün kaydedildi. Kalori ve besin değerleri eklenmedi.");
  await expect(card).toContainText("2/4 adım");
  expect(f.state.posts).toEqual([{ mealType: "LUNCH" }, { mealType: "LUNCH" }]);
  await card.getByRole("button", { name: "Son öğün işaretini geri al" }).click();
  await expect(card).toContainText("Öğün işareti geri alındı.");
  await expect(card).toContainText("1/4 adım");
  expect(f.state.deletes).toEqual(["/tracking/meals/saved-2"]);
  await card.getByRole("button", { name: "+250 ml su ekle" }).click();
  await expect(card).toContainText("1000 / 2100 ml");
  expect(f.state.waterPosts).toBe(1);
});
for (const mode of [
  "no-plan",
  "missing-date",
  "old-date",
  "unknown",
  "complete",
  "due",
  "ambiguous",
] as const) {
  test(`${mode}: safe actual dashboard state`, async ({ page }, info) => {
    const p = activePlan();
    if (mode === "missing-date") delete p.startDate;
    if (mode === "old-date") p.startDate = "2025-10-23";
    if (mode === "ambiguous") p.dailyPlans.cycle[1].meals[1].name = "Öğle özel öğünü";
    await fixture(page, {
      plan: mode === "no-plan" ? null : p,
      unknown: mode === "unknown",
      complete: mode === "complete",
      due: mode === "due",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    const card = section(page);
    if (["no-plan", "missing-date", "old-date"].includes(mode)) {
      await expect(card.locator("[data-journey-plan-fallback]")).toContainText("Bugüne eşleşen");
      await expect(card.locator("time")).toHaveCount(0);
    }
    if (mode === "unknown") {
      await expect(card).toContainText("Öğün kayıtları doğrulanamadı");
      await expect(card.getByRole("button", { name: "Yedim", exact: true })).toHaveCount(0);
    }
    if (mode === "complete") {
      await expect(card).toContainText("Bugünün yolculuğunu tamamladın");
      await expect(card).toContainText("%100");
    }
    if (mode === "due")
      await expect(card.locator("[data-journey-next]")).toContainText("Kilo ölçümü");
    if (mode === "ambiguous") {
      await expect(card).toContainText("tek bir kayıt türüyle eşleşmiyor");
      await expect(card.getByRole("button", { name: "Yedim", exact: true })).toHaveCount(0);
    }
    await card.screenshot({ path: info.outputPath(`journey-${mode}.png`), animations: "disabled" });
  });
}
test("unready plan stays hidden; local midnight selects the next calendar day", async ({
  page,
}) => {
  const f = await fixture(page, { delayPlan: true });
  await open(page);
  const card = section(page);
  await expect(card).toContainText("Beslenme planın doğrulanıyor");
  await expect(card.locator("time")).toHaveCount(0);
  f.releasePlan();
  await expect(card).toContainText("Mercimek çorbası");
  await page.clock.fastForward(10 * 60 * 60 * 1000 + 1000);
  await expect(card).toContainText("İkinci gün yulafı");
  await expect(card).not.toContainText("Mercimek çorbası");
});
test("account switch clears the previous menu before a delayed new plan response", async ({
  page,
}) => {
  const f = await fixture(page);
  await open(page);
  await expect(section(page)).toContainText("Mercimek çorbası");
  await page.locator('a[href="/profile"]').last().click();
  await page.getByText("Çıkış yap", { exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  f.state.owner = "synthetic-b";
  f.state.plan = null;
  f.state.meals = [];
  f.state.delayPlan = true;
  await page.getByLabel("E-posta").fill("journey-b@example.com");
  await page.getByLabel("Şifre", { exact: true }).fill("SyntheticPass123");
  await page.getByRole("button", { name: "Giriş Yap", exact: true }).click();
  await expect(section(page)).toBeVisible();
  await expect(section(page)).not.toContainText("Mercimek çorbası");
  await expect(section(page).locator("time")).toHaveCount(0);
  f.releasePlan();
  await expect(section(page)).toContainText("Bugüne eşleşen");
});
