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
    delaySession?: boolean;
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
    mealReads: 0,
    waterReads: 0,
    deletes: [] as string[],
    fail: false,
    hold: false,
    water: options.complete ? 2100 : 750,
    waterPosts: 0,
    delayPlan: Boolean(options.delayPlan),
    delaySession: Boolean(options.delaySession),
    sessionRequests: 0,
  };
  let releaseSession!: () => void;
  const sessionGate = new Promise<void>((resolve) => {
    releaseSession = resolve;
  });
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
    if (["/auth/refresh-token", "/auth/login"].includes(path)) {
      state.sessionRequests++;
      if (state.delaySession) await sessionGate;
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
    }
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
      const saved = {
        ...log(`saved-${state.posts.length}`, input.mealType),
        ...input,
        loggedAt: input.loggedAt ?? `${today}T11:00:00Z`,
      };
      state.meals.push(saved);
      return ok({ log: saved });
    }
    if (path.startsWith("/tracking/meals/") && method === "DELETE") {
      state.deletes.push(path);
      state.meals = state.meals.filter((item) => !path.endsWith(`/${item.id}`));
      return route.fulfill({ status: 204 });
    }
    if (path === "/tracking/meals") {
      state.mealReads++;
      return options.unknown ? fail() : ok({ logs: state.meals });
    }
    if (path === "/tracking/water" && method === "POST") {
      state.waterPosts++;
      state.water += 250;
      return ok({ log: { id: "water-post", amountMl: 250, loggedAt: `${today}T11:00:00Z` } });
    }
    if (path === "/tracking/water") {
      state.waterReads++;
      return options.unknown
        ? fail()
        : ok({ logs: [{ id: "water", amountMl: state.water, loggedAt: `${today}T07:00:00Z` }] });
    }
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
    releaseSession() {
      state.delaySession = false;
      releaseSession();
    },
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
      await expect(card.locator("time")).toHaveText("Planlanan 13:25");
      await expect(card).toContainText("1/4 adım");
      await expect(card).toContainText("%25");
      await expect(card.locator("[data-journey-next]")).toContainText("Öğle yemeği");
      const focus = card.locator("[data-journey-focus-card]");
      await expect(focus).toHaveCount(1);
      await expect(focus.locator("[data-journey-plan-meal]")).toContainText("Mercimek çorbası");
      await expect(focus.getByRole("button", { name: "Yedim", exact: true })).toBeVisible();
      await expect(focus.getByRole("link", { name: "Farklı yedim", exact: true })).toBeVisible();
      await expect(focus.getByRole("img", { name: "Öğün planı simgesi" })).toBeVisible();
      await expect(focus.locator("img")).toHaveCount(0);
      expect((await focus.boundingBox())!.height).toBeGreaterThanOrEqual(180);
      const actions = focus.locator("[data-journey-meal-actions]");
      const eatBox = (await actions
        .getByRole("button", { name: "Yedim", exact: true })
        .boundingBox())!;
      const differentBox = (await actions
        .getByRole("link", { name: "Farklı yedim", exact: true })
        .boundingBox())!;
      expect(eatBox.width).toBeGreaterThanOrEqual(120);
      expect(Math.abs(eatBox.width - differentBox.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(eatBox.y - differentBox.y)).toBeLessThanOrEqual(1);
      await expect(card.locator("[data-journey-details-panel]")).not.toBeVisible();
      await card.screenshot({ path: info.outputPath(`journey-compact-${width}-${theme}.png`) });
      await card.locator("[data-journey-details-toggle]").click();
      await expect(
        card.locator("[data-daily-journey-steps] > [data-journey-timeline-step]"),
      ).toHaveCount(3);
      await expect(
        card.locator('[data-journey-timeline-step][data-step-state="completed"]').first(),
      ).toContainText("Kahvaltı");
      await expect(card.getByRole("link", { name: "Farklı yedim", exact: true })).toHaveAttribute(
        "href",
        `/meals/add?slot=lunch&day=${today}&returnTo=/dashboard`,
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
      await expect(page.locator("[data-dashboard-metrics] > div > *")).toHaveCount(4);
      await expect(page.getByRole("navigation", { name: "Ana gezinme" })).toBeVisible();
      const toggle = card.locator("[data-journey-details-toggle]");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await toggle.focus();
      await toggle.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await toggle.press("Space");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await toggle.blur();
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
      const outer = card.locator("[data-journey-outer-toggle]");
      await outer.focus();
      await outer.press("Enter");
      await expect(card.locator("[data-journey-body]")).not.toBeVisible();
      await expect(card.locator("[data-journey-plan-meal]")).not.toBeVisible();
      await expect(card.locator("[data-journey-tracking-steps]")).not.toBeVisible();
      await expect(page.locator("[data-dashboard-metrics]")).toBeVisible();
      await card.screenshot({
        path: info.outputPath(`journey-outer-closed-${width}-${theme}.png`),
      });
      await page.reload();
      await expect(section(page).locator("[data-journey-outer-toggle]")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await section(page).locator("[data-journey-outer-toggle]").click();
      await expect(section(page).locator("[data-journey-details-toggle]")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    });
  }
for (const width of [390, 412, 430])
  for (const theme of ["light", "dark"] as const) {
    test(`${width}px ${theme}: no plan keeps a truthful timeline without fake meal actions`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 932 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
      await fixture(page, { plan: null });
      await open(page);
      const card = section(page);
      await expect(card.locator("[data-journey-plan-fallback]")).toContainText("Bugüne eşleşen");
      await expect(card.locator("time")).toHaveCount(0);
      await expect(card.getByRole("button", { name: "Yedim", exact: true })).toHaveCount(0);
      await expect(card.locator("[data-journey-details-panel]")).not.toBeVisible();
      await card.locator("[data-journey-details-toggle]").click();
      await expect(card.locator("[data-journey-timeline-step]")).toHaveCount(4);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await card.screenshot({
        path: info.outputPath(`journey-no-plan-${width}-${theme}.png`),
        animations: "disabled",
      });
    });
    test(`${width}px ${theme}: session loading hides prior menu and opens current journey safely`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 932 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
      const f = await fixture(page, { delaySession: true });
      await page.goto("/dashboard");
      await expect.poll(() => f.state.sessionRequests).toBeGreaterThan(0);
      await expect(section(page)).toHaveCount(0);
      await expect(page.getByText("Mercimek çorbası", { exact: true })).toHaveCount(0);
      await page.screenshot({
        path: info.outputPath(`journey-session-loading-${width}-${theme}.png`),
        fullPage: true,
        animations: "disabled",
      });
      f.releaseSession();
      await expect(section(page).locator("[data-journey-plan-meal]")).toContainText(
        "Mercimek çorbası",
      );
      await expect(section(page).locator("[data-journey-details-toggle]")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
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
  await expect(card).toContainText(
    "Öğün adımı işaretlendi; besin kaydı henüz oluşturulmadı. Kalori ve besin değerleri eklenmedi.",
  );
  await expect(card).toContainText("2/4 adım");
  expect(f.state.posts).toEqual([{ mealType: "LUNCH" }, { mealType: "LUNCH" }]);
  await card.getByRole("button", { name: "Son öğün işaretini geri al" }).click();
  await expect(card).toContainText("Öğün işareti geri alındı.");
  await expect(card).toContainText("1/4 adım");
  expect(f.state.deletes).toEqual(["/tracking/meals/saved-2"]);
  await card.locator("[data-journey-details-toggle]").click();
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
      await expect(card).toHaveAttribute("data-journey-status", "all-done");
      await expect(card.locator("[data-journey-outer-toggle]")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await expect(card.locator("[data-journey-body]")).not.toBeVisible();
      await card.locator("[data-journey-outer-toggle]").click();
      await card.locator("[data-journey-details-toggle]").click();
      await expect(card).toContainText("Günlük kayıt adımlarını tamamladın");
      await expect(card).toContainText("%100");
    }
    if (mode === "due")
      await expect(card.locator("[data-journey-next]")).toContainText("Kilo ölçümü");
    if (mode === "ambiguous") {
      await expect(card.locator("[data-journey-plan-meal]")).toContainText("Sebzeli bulgur");
      await card.locator("[data-journey-details-toggle]").click();
      await expect(card.locator("[data-journey-unmatched-plan]")).toContainText("Öğle özel öğünü");
      await expect(
        card.locator("[data-journey-unmatched-plan] [data-journey-timeline-step]"),
      ).toHaveAttribute("data-step-state", "pending");
      await expect(
        card
          .locator("[data-journey-unmatched-plan]")
          .getByRole("button", { name: "Yedim", exact: true }),
      ).toHaveCount(0);
    }
    await card.screenshot({ path: info.outputPath(`journey-${mode}.png`), animations: "disabled" });
  });
}
test("unready plan stays hidden; local midnight selects the next calendar day", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 932 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const f = await fixture(page, { delayPlan: true });
  await open(page);
  const card = section(page);
  await expect(card).toContainText("Beslenme planın doğrulanıyor");
  await expect(card.locator("time")).toHaveCount(0);
  f.releasePlan();
  await expect(card).toContainText("Mercimek çorbası");
  await page.clock.fastForward((9 * 60 + 59) * 60 * 1000);
  await expect(card).toContainText("Mercimek çorbası");
  await card.screenshot({
    path: info.outputPath("journey-before-midnight.png"),
    animations: "disabled",
  });
  await card.locator("[data-journey-details-toggle]").click();
  await card.locator("[data-journey-outer-toggle]").click();
  await expect(card.locator("[data-journey-body]")).not.toBeVisible();
  const reads = { meals: f.state.mealReads, water: f.state.waterReads };
  await page.clock.fastForward(61 * 1000);
  await expect(card).toContainText("İkinci gün yulafı");
  await expect(card.locator("[data-journey-outer-toggle]")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(card.locator("[data-journey-details-toggle]")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(f.state.mealReads).toBeGreaterThan(reads.meals);
  expect(f.state.waterReads).toBeGreaterThan(reads.water);
  expect(f.state.posts).toHaveLength(0);
  expect(f.state.waterPosts).toBe(0);
  await expect(card).not.toContainText("Mercimek çorbası");
  await expect(card).not.toContainText("Sebzeli bulgur");
  await card.screenshot({
    path: info.outputPath("journey-after-midnight.png"),
    animations: "disabled",
  });
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

for (const width of [390, 412, 430])
  for (const theme of ["light", "dark"] as const) {
    test(`${width}px ${theme}: completed day compacts once, manual reopen survives reload and undo`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 932 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
      await fixture(page, { complete: true });
      await open(page);
      const card = section(page),
        outer = card.locator("[data-journey-outer-toggle]");
      await expect(card).toHaveAttribute("data-journey-status", "all-done");
      await expect(outer).toHaveAttribute("aria-expanded", "false");
      await expect(card.locator("[data-journey-body]")).not.toBeVisible();
      expect((await card.boundingBox())!.height).toBeLessThan(140);
      await card.screenshot({ path: info.outputPath(`journey-completed-${width}-${theme}.png`) });
      await outer.click();
      await card.locator("[data-journey-details-toggle]").click();
      await expect(card.locator("[data-journey-progress-area]")).toBeVisible();
      await expect(card).toContainText("besin kaydı yok");
      await expect(
        card.getByRole("link", { name: "Kahvaltı için besin kaydı ekle", exact: true }),
      ).toBeVisible();
      await expect(
        card.getByRole("link", { name: "Kahvaltı için besin kaydı ekle", exact: true }),
      ).toHaveAttribute("href", `/meals/add?slot=breakfast&day=${today}&returnTo=/dashboard`);
      await expect(card).toContainText("Kalori ve besin hedeflerin ayrı");
      await page.reload();
      await expect(outer).toHaveAttribute("aria-expanded", "true");
      await expect(card.locator("[data-journey-details-toggle]")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await page.goto("/meals");
      await expect(
        page.getByText("Öğün adımları işaretlendi; besin kaydı henüz oluşturulmadı.", {
          exact: false,
        }),
      ).toBeVisible();
      await page.getByRole("checkbox", { name: "Öğle Yemeği öğününü yedim", exact: true }).click();
      await page.goto("/dashboard");
      await expect(outer).toHaveAttribute("aria-expanded", "true");
      await expect(card).toContainText("3/4 adım");
      await expect(card.locator("[data-journey-plan-meal]")).toContainText("Mercimek çorbası");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });
  }

test("different meal context cancels to Journey without a write; confirmed food keeps actual time and totals", async ({
  page,
}) => {
  const f = await fixture(page);
  await open(page);
  await section(page).getByRole("link", { name: "Farklı yedim", exact: true }).click();
  await expect(page.locator("[data-meal-entry-context]")).toContainText(`Öğle Yemeği · ${today}`);
  await expect(page.getByRole("combobox", { name: "Saat", exact: true })).toHaveValue("14");
  await page.getByRole("button", { name: "İptal", exact: true }).click();
  await expect(section(page)).toBeVisible();
  expect(f.state.posts).toHaveLength(0);
  await expect(section(page)).toContainText("1/4 adım");
  await section(page).getByRole("link", { name: "Farklı yedim", exact: true }).click();
  await page.getByLabel("Besin Adı", { exact: true }).fill("Sentetik besin");
  await page.getByLabel("Miktar", { exact: true }).fill("1 porsiyon");
  await page.getByLabel("Kalori (kcal)", { exact: true }).fill("100");
  await page.getByLabel("Protein (g)", { exact: true }).fill("5");
  await page.getByLabel("Karbonhidrat (g)", { exact: true }).fill("10");
  await page.getByLabel("Yağ (g)", { exact: true }).fill("2");
  await page.getByRole("combobox", { name: "Saat", exact: true }).selectOption("13");
  await page.getByRole("combobox", { name: "Dakika", exact: true }).selectOption("10");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(section(page)).toBeVisible();
  expect(f.state.posts).toHaveLength(1);
  expect(f.state.posts[0]).toMatchObject({
    name: "Sentetik besin",
    calories: 100,
    loggedAt: `${today}T10:10:00.000Z`,
  });
  await page.goto("/meals");
  await expect(page.getByText("100 kcal", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Kaydedilen 13:10", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Planlanan 13:25", { exact: false }).first()).toBeVisible();
});

test("five fixed planned steps: snack before dinner, water reaches goal, auto fold only once, undo preserves denominator", async ({
  page,
}) => {
  const plan = activePlan();
  plan.dailyPlans.cycle[1].meals.splice(2, 0, meal("Ara öğün", "18:00", "Sentetik ara öğün"));
  plan.dailyPlans.cycle[1].meals[3].time = "21:55";
  const f = await fixture(page, { plan });
  f.state.meals.push(log("l", "LUNCH"));
  f.state.water = 1850;
  await open(page);
  const card = section(page);
  await expect(card).toContainText("2/5 adım");
  await expect(card.locator("[data-journey-plan-meal]")).toContainText("Sentetik ara öğün");
  await card.getByRole("button", { name: "Yedim", exact: true }).click();
  await expect(card).toContainText("3/5 adım");
  await expect(card.locator("[data-journey-plan-meal]")).toContainText("Sebzeli bulgur");
  await card.getByRole("button", { name: "Yedim", exact: true }).click();
  await expect(card).toContainText("4/5 adım");
  await card.locator("[data-journey-details-toggle]").click();
  await card.getByRole("button", { name: "+250 ml su ekle", exact: true }).click();
  await expect(card.locator("[data-journey-outer-toggle]")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await card.locator("[data-journey-outer-toggle]").click();
  await card.getByRole("button", { name: "Son öğün işaretini geri al", exact: true }).click();
  await expect(card).toContainText("4/5 adım");
  await expect(card.locator("[data-journey-outer-toggle]")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.reload();
  await expect(card).toContainText("4/5 adım");
  await expect(card.locator("[data-journey-outer-toggle]")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

test("repeated snacks remain unconfirmed while trackable goals advance, fold and survive undo", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 932 });
  const plan = activePlan();
  plan.dailyPlans.cycle[1].meals.splice(
    1,
    0,
    meal("Ara öğün", "10:00", "Birinci sentetik ara öğün"),
  );
  plan.dailyPlans.cycle[1].meals.splice(
    3,
    0,
    meal("Ara öğün", "16:00", "İkinci sentetik ara öğün"),
  );
  const f = await fixture(page, { plan });
  f.state.meals.push(log("one-snack", "SNACK"));
  f.state.water = 1850;
  await open(page);
  const card = section(page),
    outer = card.locator("[data-journey-outer-toggle]");
  await expect(card).toContainText("1/4 takip");
  await expect(card.locator("[data-journey-plan-meal]")).toContainText("Mercimek çorbası");
  await card.getByRole("button", { name: "Yedim", exact: true }).click();
  await expect(card).toContainText("2/4 takip");
  await expect(card.locator("[data-journey-plan-meal]")).toContainText("Sebzeli bulgur");
  await card.getByRole("button", { name: "Yedim", exact: true }).click();
  await expect(card).toContainText("3/4 takip");
  await expect(card.locator("[data-journey-plan-meal]")).toHaveCount(0);
  await expect(card).not.toContainText("Bugünkü planın öğün adımları kaydedildi");
  await card.locator("[data-journey-details-toggle]").click();
  const unmatched = card.locator("[data-journey-unmatched-plan]");
  await expect(
    unmatched.locator('[data-journey-timeline-step][data-step-state="pending"]'),
  ).toHaveCount(2);
  await expect(unmatched.locator('[data-step-state="completed"]')).toHaveCount(0);
  await expect(unmatched.getByRole("button", { name: "Yedim", exact: true })).toHaveCount(0);
  for (const link of await unmatched.getByRole("link").all())
    await expect(link).toHaveAttribute("href", "/meals/plan");
  await card.getByRole("button", { name: "+250 ml su ekle", exact: true }).click();
  await expect(card).toHaveAttribute("data-journey-status", "all-done");
  await expect(outer).toHaveAttribute("aria-expanded", "false");
  await expect(card.locator("[data-journey-card-heading]")).toContainText("Takip tamamlandı");
  await outer.click();
  await expect(card).toContainText(
    "Eşleştirilemeyen plan öğünleri bu ilerlemeye dahil değil ve tamamlanmış sayılmadı",
  );
  await expect(unmatched.locator('[data-step-state="pending"]')).toHaveCount(2);
  expect(f.state.posts).toEqual([{ mealType: "LUNCH" }, { mealType: "DINNER" }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await card.screenshot({ path: info.outputPath("journey-repeated-snacks-tracking-only.png") });
  await page.reload();
  await expect(outer).toHaveAttribute("aria-expanded", "true");
  await expect(card.locator("[data-journey-details-toggle]")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(unmatched.locator('[data-step-state="pending"]')).toHaveCount(2);
  await page.goto("/meals");
  await page.getByRole("checkbox", { name: "Akşam Yemeği öğününü yedim", exact: true }).click();
  await page.goto("/dashboard");
  await expect(card).toContainText("3/4 takip");
  await expect(card.locator("[data-journey-plan-meal]")).toContainText("Sebzeli bulgur");
  await expect(unmatched.locator('[data-step-state="pending"]')).toHaveCount(2);
});

test("only unmatchable planned snacks: water completion is scoped and never confirms either snack", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 932 });
  const plan = activePlan();
  plan.dailyPlans.cycle[1].meals = [
    meal("Ara öğün", "10:00", "Birinci ara öğün"),
    meal("Ara öğün", "16:00", "İkinci ara öğün"),
  ];
  const f = await fixture(page, { plan, complete: true });
  f.state.meals.push(log("snack-log", "SNACK"));
  await open(page);
  const card = section(page),
    outer = card.locator("[data-journey-outer-toggle]");
  await expect(card).toHaveAttribute("data-journey-status", "all-done");
  await expect(outer).toHaveAttribute("aria-expanded", "false");
  await expect(card.locator("[data-journey-card-heading]")).toContainText("Takip tamamlandı");
  await outer.click();
  await card.locator("[data-journey-details-toggle]").click();
  await expect(card.getByRole("progressbar")).toHaveAttribute(
    "aria-valuetext",
    "1/1 takip hedefi tamamlandı",
  );
  await expect(
    card.locator('[data-journey-unmatched-plan] [data-step-state="pending"]'),
  ).toHaveCount(2);
  await expect(
    card.locator('[data-journey-unmatched-plan] [data-step-state="completed"]'),
  ).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Yedim", exact: true })).toHaveCount(0);
  expect(f.state.posts).toHaveLength(0);
  expect(f.state.waterPosts).toBe(0);
  await card.screenshot({ path: info.outputPath("journey-only-unmapped-water-tracking.png") });
});
