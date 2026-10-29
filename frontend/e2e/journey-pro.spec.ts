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
    version: 1,
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
const syntheticNutrients = { energyKcal: 100, proteinG: 5, carbohydratesG: 10, fatG: 2, saturatedFatG: 0, sugarsG: 1, fiberG: 2, sodiumMg: 20, saltG: 0.05, micronutrients: { iron: 2 } };
const syntheticPersonalization = { nutrients: syntheticNutrients, grams: 100, metrics: null, profileContextUsed: false, activePlanUsed: false, dietaryCompatibility: "UNKNOWN", allergenDataComplete: false, allergenSafety: null, warnings: [], attentionFlags: [], windowHours: 24 };
const syntheticPhoto = { isFood: true, confidence: 90, reason: "Synthetic", dishName: "Sentetik taranan yemek", estimatedPortion: "1 porsiyon", estimatedGrams: 100, ingredients: [], totals: syntheticNutrients, disclaimer: "Yalnız sentetik test verisi" };
const syntheticProduct = { externalId: "synthetic-product", provider: "DIEWISH", name: "Synthetic product", displayNameTr: "Sentetik barkod ürünü", brand: "Sentetik", barcode: "8690000000001", imageUrl: null, quantity: "100 g", serving: null, nutrientsPer100g: syntheticNutrients, ingredients: ["Sentetik"], allergens: [], additives: [], labels: [], vegan: null, vegetarian: null, glutenFree: null, nutriScore: null, novaGroup: null,
  provenance: { provider: "DIEWISH", externalId: "synthetic-product", retrievedAt: `${today}T00:00:00Z`, dataBasis: "PER_100_G" } };
async function fixture(
  page: Page,
  options: {
    plan?: NutritionPlanRecord | null;
    complete?: boolean;
    unknown?: boolean;
    due?: boolean;
    delayPlan?: boolean;
    delaySession?: boolean;
    now?: string;
    waterMl?: number;
    waterGoalMl?: number;
    noMealRecords?: boolean;
    planReadError?: boolean;
    decisionStatus?: number;
  } = {},
) {
  await page.clock.install({ time: new Date(options.now ?? `${today}T14:00:00+03:00`) });
  const state = {
    owner: "synthetic-a",
    plan: options.plan === undefined ? activePlan() : options.plan,
    meals: options.noMealRecords
      ? []
      : options.complete
        ? [log("b", "BREAKFAST"), log("l", "LUNCH"), log("d", "DINNER")]
        : [log("b", "BREAKFAST")],
    posts: [] as Log[],
    decisions: new Map<string, { id: string | null; state: "PENDING" | "EATEN" | "SKIPPED"; revision: number }>(),
    decisionWrites: [] as Array<{ path: string; method: string; revision: number; desired: string }>,
    decisionReads: 0,
    decisionStatus: options.decisionStatus ?? 0,
    conflict: false,
    mutationStatus: 0,
    abortDecisionRead: false,
    loseDecisionResponse: false,
    photoScans: 0,
    barcodeReads: 0,
    mealReads: 0,
    waterReads: 0,
    deletes: [] as string[],
    fail: false,
    hold: false,
    water: options.waterMl ?? (options.complete ? 2100 : 750),
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
  const decisionKey = (id: string, day: number, index: number, date: string) => `${state.owner}:${id}:${day}:${index}:${date}`;
  function decision(id: string, day: number, index: number, date: string) {
    const key = decisionKey(id, day, index, date);
    if (!state.decisions.has(key)) {
      const map = state.plan?.dailyPlans.calendar.find(d => d.dayNumber === day);
      const name = state.plan?.dailyPlans.cycle[map?.cycleIndex ?? -1]?.meals[index]?.name;
      // Explicit synthetic v2 server seed, independent of legacy MealLog rows.
      const eaten = !options.noMealRecords && day === 1 && date === today &&
        (name === "Kahvaltı" || Boolean(options.complete && ["Öğle yemeği", "Akşam yemeği"].includes(name ?? "")));
      state.decisions.set(key, { id: eaten ? `seed:${key}` : null, state: eaten ? "EATEN" : "PENDING", revision: eaten ? 1 : 0 });
    }
    return state.decisions.get(key)!;
  }
  function rowsFor(day: number, date: string) {
    const p = state.plan;
    const map = p?.dailyPlans.calendar.find(d => d.dayNumber === day);
    if (!p?.startDate || !map) return [];
    const base = new Date(`${p.startDate.slice(0, 10)}T12:00:00Z`);
    base.setUTCDate(base.getUTCDate() + day - 1 + (map.dateOffsetDays ?? 0));
    let previous = -1, rollover = 0;
    return p.dailyPlans.cycle[map.cycleIndex].meals.map((m, mealIndex) => {
      const [h, min] = m.time.split(":").map(Number), minutes = h * 60 + min;
      if (previous >= 0 && minutes <= previous) rollover++;
      previous = minutes;
      const scheduled = new Date(base); scheduled.setUTCDate(scheduled.getUTCDate() + rollover);
      return { mealIndex, localDate: scheduled.toISOString().slice(0, 10), scheduledTime: m.time };
    }).filter(m => m.localDate === date).map(m => ({ ...m, ...decision(p.id, day, m.mealIndex, date), active: decision(p.id, day, m.mealIndex, date).state === "EATEN" }));
  }
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
          subscriptionTier: "FREE",
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
          dailyWaterGoalMl: options.waterGoalMl ?? 2100,
          usualWakeTime: "07:00",
          usualSleepTime: "23:00",
          workScheduleType: "REGULAR",
        },
      });
    if (path === "/nutrition-plans") {
      if (options.planReadError) return fail();
      const snapshot = state.plan;
      if (state.delayPlan) {
        await planGate;
      }
      return ok({ plans: snapshot ? [snapshot] : [] });
    }
    if (path.endsWith("/capabilities")) return ok({ resumable: false });
    if (path === "/tracking/meal-check-ins" && method === "GET") {
      state.decisionReads++;
      if (state.abortDecisionRead) return route.abort();
      if (options.unknown || state.decisionStatus) return route.fulfill({ status: state.decisionStatus || 503, json: { success: false, error: { code: "QA_DECISION_UNAVAILABLE", message: "Synthetic decision failure" } } });
      const id = url.searchParams.get("planId"), dayNumber = Number(url.searchParams.get("dayNumber")), localDate = url.searchParams.get("localDate")!;
      if (id !== state.plan?.id) return route.fulfill({ status: 404, json: { success: false, error: { code: "NOT_FOUND", message: "No plan" } } });
      const checkIns = rowsFor(dayNumber, localDate), eaten = checkIns.filter(r => r.state === "EATEN").length, skipped = checkIns.filter(r => r.state === "SKIPPED").length;
      return ok({ day: { contractVersion: 2, source: "PLAN_CHECK_INS_ONLY", legacyMealLogsExcluded: true, unplannedSupported: false,
        planId: id, planVersion: state.plan.version, dayNumber, localDate, planDate: localDate, checkIns, total: checkIns.length, completed: eaten, eaten, skipped,
        decided: eaten + skipped, pending: checkIns.length - eaten - skipped, allDone: checkIns.length > 0 && eaten === checkIns.length, allDecided: checkIns.length > 0 && eaten + skipped === checkIns.length } });
    }
    const target = path.match(/^\/tracking\/meal-check-ins\/([^/]+)\/(\d+)\/(\d+)(\/skip)?$/);
    if (target && ["PUT", "DELETE"].includes(method)) {
      const id = decodeURIComponent(target[1]), dayNumber = Number(target[2]), mealIndex = Number(target[3]), localDate = url.searchParams.get("localDate")!;
      const ifMatch = route.request().headers()["if-match"];
      expect(ifMatch).toMatch(/^"\d+"$/);
      const revision = Number(ifMatch?.replaceAll('"', ''));
      const desired = method === "DELETE" ? "PENDING" : target[4] ? "SKIPPED" : "EATEN";
      state.decisionWrites.push({ path, method, revision, desired });
      expect(route.request().postData()).toBeNull();
      if (state.hold) await writeGate;
      if (state.fail) return fail();
      if (state.mutationStatus) return route.fulfill({ status: state.mutationStatus, json: { success: false, error: { code: "QA_ERROR", message: "Synthetic mutation failure" } } });
      if (id !== state.plan?.id || !rowsFor(dayNumber, localDate).some(r => r.mealIndex === mealIndex)) return route.fulfill({ status: 404, json: { success: false, error: { code: "NOT_FOUND", message: "Invalid plan meal" } } });
      const current = decision(id, dayNumber, mealIndex, localDate);
      if (state.conflict || (current.revision !== revision && !(current.revision === revision + 1 && current.state === desired))) {
        state.conflict = false;
        return route.fulfill({ status: 409, json: { success: false, error: { code: "MEAL_CHECK_IN_REVISION_CONFLICT", message: "Changed on another device" } } });
      }
      if (current.revision === revision) {
        current.id ??= `saved:${decisionKey(id, dayNumber, mealIndex, localDate)}`;
        current.state = desired; current.revision++;
      }
      if (state.loseDecisionResponse) { state.loseDecisionResponse = false; return route.abort(); }
      return ok({ checkIn: { ...current, active: current.state === "EATEN", contractVersion: 2, planId: id, planVersion: state.plan.version, dayNumber, mealIndex, localDate } });
    }
    if (path === "/food-scan/analyze") { state.photoScans++; return ok({ analysis: syntheticPhoto, scan: null }); }
    if (path.startsWith("/nutrition/barcode/")) { state.barcodeReads++; return ok({ found: true, food: syntheticProduct, scan: null }); }
    if (["/nutrition/personalize", "/nutrition/personalize-nutrients"].includes(path)) return ok({ personalization: syntheticPersonalization });
    if (path === "/nutrition/history") return ok({ scans: [] });
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
    decide(index: number, desired: "PENDING" | "EATEN" | "SKIPPED", dayNumber = 1, localDate = today) {
      if (!state.plan) throw new Error("No fixture plan");
      const current = decision(state.plan.id, dayNumber, index, localDate);
      current.id ??= `external:${index}:${localDate}`; current.state = desired; current.revision++;
    },
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
      await expect(card.locator("[data-journey-plan-meal] time")).toContainText("Planlanan 13:25");
      await expect(card).toContainText("1/4 adım");
      await expect(card).toContainText("%25");
      await expect(card.locator("[data-journey-next]")).toContainText("Öğle yemeği");
      const focus = card.locator("[data-journey-focus-card]");
      await expect(focus).toHaveCount(1);
      await expect(focus.locator("[data-journey-plan-meal]")).toContainText("Mercimek çorbası");
      await expect(focus.getByRole("button", { name: "Yedim", exact: true })).toBeVisible();
      await expect(focus.getByRole("button", { name: "Farklı yedim", exact: true })).toBeVisible();
      await expect(focus.getByRole("img", { name: "Öğün planı simgesi" })).toBeVisible();
      await expect(focus.locator("img")).toHaveCount(0);
      expect((await focus.boundingBox())!.height).toBeGreaterThanOrEqual(180);
      const actions = focus.locator("[data-journey-meal-actions]");
      const eatBox = (await actions
        .getByRole("button", { name: "Yedim", exact: true })
        .boundingBox())!;
      const differentBox = (await actions
        .getByRole("button", { name: "Yemedim", exact: true })
        .boundingBox())!;
      expect(eatBox.width).toBeGreaterThanOrEqual(120);
      expect(Math.abs(eatBox.width - differentBox.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(eatBox.y - differentBox.y)).toBeLessThanOrEqual(1);
      await expect(card.locator("[data-journey-details-panel]")).not.toBeVisible();
      await card.screenshot({ path: info.outputPath(`journey-compact-${width}-${theme}.png`) });
      await card.locator("[data-journey-details-toggle]").click();
      await expect(
        card.locator("[data-daily-journey-steps] > [data-journey-timeline-step]"),
      ).toHaveCount(2);
      await expect(
        card.locator('[data-journey-timeline-step][data-step-state="completed"]').first(),
      ).toContainText("Kahvaltı");
      await expect(card.getByRole("button", { name: "Farklı yedim", exact: true })).toBeEnabled();
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
      await expect(card.getByRole("progressbar")).toBeVisible();
      await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
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
      await expect(card.locator("[data-journey-plan-fallback]")).toContainText(
        "Etkin bir beslenme planın yok",
      );
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
  await expect(eat).toBeEnabled();
  f.state.fail = true;
  f.holdWrite();
  await eat.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect.poll(() => f.state.decisionWrites.length).toBe(1);
  await expect(eat).toBeDisabled();
  f.releaseWrite();
  await expect(card).toContainText("İşlem doğrulanamadı");
  await expect(card).toContainText("1/4 adım");
  f.state.fail = false;
  await eat.click();
  await expect(card).toContainText(
    "Yedim kaydedildi. Besin veya kalori eklenmedi.",
  );
  await expect(card).toContainText("2/4 adım");
  expect(f.state.posts).toHaveLength(0);
  expect(f.state.decisionWrites.map(w => w.revision)).toEqual([0, 0]);
  await card.getByRole("button", { name: "Son öğün kararını geri al" }).click();
  await expect(card).toContainText("Karar geri alındı; besin kayıtları korunuyor.");
  await expect(card).toContainText("1/4 adım");
  expect(f.state.deletes).toHaveLength(0);
  expect(f.state.decisionWrites.at(-1)).toMatchObject({ method: "DELETE", revision: 1 });
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
      await expect(card.locator("[data-journey-plan-fallback]")).toHaveAttribute(
        "data-plan-status",
        mode === "no-plan" ? "none" : mode === "missing-date" ? "unavailable" : "expired",
      );
      await expect(card.locator("time")).toHaveCount(0);
    }
    if (mode === "unknown") {
      await expect(card).toContainText("Öğün takibi şu anda kullanılamıyor");
      await expect(card.getByRole("button", { name: "Yedim", exact: true })).toBeDisabled();
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
      await expect(card).toContainText("Öğün kararlarını ve günlük kayıt adımlarını tamamladın");
      await expect(card).toContainText("%100");
    }
    if (mode === "due")
      await expect(card.locator("[data-journey-next]")).toContainText("Öğle yemeği");
    if (mode === "ambiguous") {
      await expect(card.locator("[data-journey-plan-meal]")).toContainText("Mercimek çorbası");
      await expect(card.getByRole("button", { name: "Yedim", exact: true })).toBeEnabled();
      await card.getByRole("button", { name: "Yemedim", exact: true }).click();
      await expect(card).toContainText("2/4 adım");
      await expect(card.locator("[data-journey-unmatched-plan]")).toHaveCount(0);
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
  await expect(card.locator("[data-journey-plan-meal]")).toContainText("Sebzeli bulgur");
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
  await expect(section(page)).toContainText("Etkin bir beslenme planın yok");
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
      await card.locator("[data-journey-completed] > summary").click();
      await expect(card).toContainText("Besin kaydı ayrı tutulur");
      await expect(card.locator("[data-journey-completed]").getByRole("button", { name: "Kararı düzenle" }).first()).toBeVisible();
      await expect(card).toContainText("kalori ve besin hedeflerin ayrı");
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
      // Legacy slot undo is not evidence for an exact plan decision.
      await expect(card).toContainText("4/4 adım");
      await card.locator("[data-journey-completed] > summary").click();
      await card.locator("[data-journey-completed] [data-journey-timeline-step]").filter({ hasText: "Mercimek çorbası" }).getByRole("button", { name: "Kararı düzenle" }).click();
      await card.getByRole("button", { name: "Kararı geri al", exact: true }).click();
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
  await section(page).getByRole("button", { name: "Farklı yedim", exact: true }).click();
  await expect(page.locator("[data-meal-entry-context]")).toContainText(`Öğle Yemeği · ${today}`);
  await expect(page.getByRole("combobox", { name: "Saat", exact: true })).toHaveValue("14");
  await page.getByRole("button", { name: "İptal", exact: true }).click();
  await expect(section(page)).toBeVisible();
  expect(f.state.posts).toHaveLength(0);
  await expect(section(page)).toContainText("1/4 adım");
  await section(page).getByRole("button", { name: "Farklı yedim", exact: true }).click();
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
  await expect(section(page)).toContainText("1/4 adım");
  expect(f.state.decisionWrites).toHaveLength(0);
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
  f.decide(1, "EATEN");
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
  await card.getByRole("button", { name: "Son öğün kararını geri al", exact: true }).click();
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

test("repeated snacks have independent v2 decisions, fixed denominator, reload and safe undo", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 932 });
  const plan = activePlan();
  plan.dailyPlans.cycle[1].meals.splice(1, 0, meal("Ara öğün", "10:00", "Birinci sentetik ara öğün"));
  plan.dailyPlans.cycle[1].meals.splice(3, 0, meal("Ara öğün", "16:00", "İkinci sentetik ara öğün"));
  const f = await fixture(page, { plan });
  f.state.meals.push(log("legacy-snack", "SNACK"));
  f.state.water = 1850;
  await open(page);
  const card = section(page), outer = card.locator("[data-journey-outer-toggle]");
  await expect(card).toContainText("1/6 adım");
  await card.getByRole("button", { name: "Yedim", exact: true }).click();
  await expect(card).toContainText("2/6 adım");
  await expect(card.locator("[data-journey-plan-meal]")).toContainText("İkinci sentetik ara öğün");
  await card.getByRole("button", { name: "Yemedim", exact: true }).click();
  await expect(card).toContainText("3/6 adım");
  await page.clock.fastForward(6 * 60 * 60 * 1000);
  await expect(card.locator("[data-journey-plan-meal]")).toContainText("Sebzeli bulgur");
  await card.getByRole("button", { name: "Yedim", exact: true }).click();
  await expect(card).toContainText("4/6 adım");
  await card.locator("[data-journey-details-toggle]").click();
  await card.getByRole("button", { name: "+250 ml su ekle", exact: true }).click();
  await expect(card).toContainText("5/6 adım");
  await expect(outer).toHaveAttribute("aria-expanded", "true");
  const earlier = card.locator("[data-daily-journey-steps] [data-journey-timeline-step]").filter({ hasText: "Birinci sentetik ara öğün" });
  await earlier.getByRole("button", { name: "Karar ver", exact: true }).click();
  await card.getByRole("button", { name: "Yedim", exact: true }).click();
  await expect(card).toContainText("6/6 adım");
  await expect(outer).toHaveAttribute("aria-expanded", "false");
  expect(f.state.posts).toHaveLength(0);
  expect(f.state.decisionWrites.map(w => w.desired)).toEqual(["EATEN", "SKIPPED", "EATEN", "EATEN"]);
  await outer.click();
  await card.locator("[data-journey-completed] > summary").click();
  const completed = card.locator("[data-journey-completed]");
  await expect(completed.locator("[data-journey-timeline-step]").filter({ hasText: "Birinci sentetik ara öğün" })).toContainText("Yedim");
  await expect(completed.locator("[data-journey-timeline-step]").filter({ hasText: "İkinci sentetik ara öğün" })).toContainText("Yemedim");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await card.screenshot({ path: info.outputPath("journey-independent-snacks-v2.png") });
  await page.reload();
  await expect(card).toContainText("6/6 adım");
  await expect(outer).toHaveAttribute("aria-expanded", "true");
  await card.locator("[data-journey-completed] > summary").click();
  await card.locator("[data-journey-completed] [data-journey-timeline-step]").filter({ hasText: "İkinci sentetik ara öğün" }).getByRole("button", { name: "Kararı düzenle" }).click();
  await card.getByRole("button", { name: "Kararı geri al", exact: true }).click();
  await expect(card).toContainText("5/6 adım");
  expect(f.state.decisionWrites.at(-1)?.path).toMatch(/\/1\/3$/);
  await page.reload();
  await expect(card).toContainText("5/6 adım");
});

test("only planned snacks: legacy food and water never confirm either exact snack", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 932 });
  const plan = activePlan();
  plan.dailyPlans.cycle[1].meals = [meal("Ara öğün", "10:00", "Birinci ara öğün"), meal("Ara öğün", "16:00", "İkinci ara öğün")];
  const f = await fixture(page, { plan, complete: true });
  f.state.meals.push(log("legacy-snack-log", "SNACK"));
  await open(page);
  const card = section(page);
  await expect(card).not.toHaveAttribute("data-journey-status", "all-done");
  await expect(card.locator("[data-journey-card-heading]")).toContainText("1/3 adım");
  await card.locator("[data-journey-details-toggle]").click();
  await expect(card.locator("[data-daily-journey-steps] [data-journey-timeline-step]")).toHaveCount(2);
  await expect(card.locator('[data-daily-journey-steps] [data-step-state="completed"]')).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Yedim", exact: true })).toBeEnabled();
  expect(f.state.posts).toHaveLength(0);
  expect(f.state.decisionWrites).toHaveLength(0);
  expect(f.state.waterPosts).toBe(0);
  await card.screenshot({ path: info.outputPath("journey-snacks-water-independent.png") });
});

function fullCalendarPlan(days: 7 | 14 | 30, startDate = today) {
  const p = activePlan(startDate);
  p.duration = days === 7 ? "SEVEN_DAY" : days === 14 ? "FOURTEEN_DAY" : "THIRTY_DAY";
  p.dailyPlans.durationDays = days;
  p.dailyPlans.calendar = Array.from({ length: days }, (_, i) => ({
    dayNumber: i + 1,
    cycleIndex: i,
  }));
  p.dailyPlans.cycle = Array.from({ length: days }, (_, i) => ({
    dayLabel: String(i + 1),
    meals: [
      meal("Kahvaltı", "08:00", `Gün ${i + 1} yulafı`),
      meal("Öğle yemeği", "13:00", `Gün ${i + 1} mercimeği`),
      meal("Akşam yemeği", "19:00", `Gün ${i + 1} sebzesi`),
    ],
  })) as NutritionPlanRecord["dailyPlans"]["cycle"];
  return p;
}
test("11-A: 19:00 shows the upcoming 19:25 dinner instead of unconfirmed lunch or weight", async ({
  page,
}) => {
  const p = fullCalendarPlan(7);
  p.dailyPlans.cycle[0].meals[2].time = "19:25";
  await fixture(page, { plan: p, now: `${today}T19:00:00+03:00`, noMealRecords: true, due: true });
  await open(page);
  const focus = section(page).locator("[data-journey-plan-meal]");
  await expect(focus).toContainText("Gün 1 sebzesi");
  await expect(focus).toContainText("Yaklaşıyor");
  await expect(focus.locator("time")).toContainText("19:25");
  await section(page).locator("[data-journey-details-toggle]").click();
  await expect(section(page).locator("[data-daily-journey-steps]")).toContainText(
    "Gün 1 mercimeği",
  );
  await expect(
    section(page).locator('[data-daily-journey-steps] [data-step-state="completed"]'),
  ).toHaveCount(0);
});
for (const days of [7, 14, 30] as const) {
  test(`11-A: ${days}-day current dinner takes priority over weighing and earlier unconfirmed meals`, async ({
    page,
  }) => {
    const p = fullCalendarPlan(days);
    const f = await fixture(page, {
      plan: p,
      now: `${today}T19:00:00+03:00`,
      noMealRecords: true,
      due: true,
    });
    await open(page);
    const card = section(page),
      focus = card.locator("[data-journey-plan-meal]");
    await expect(focus).toContainText("Gün 1 sebzesi");
    await expect(focus).toContainText("1 kase");
    await expect(focus).toContainText("Şimdi");
    await expect(focus.locator("time")).toContainText("23 Ekim · Planlanan 19:00");
    await card.locator("[data-journey-details-toggle]").click();
    const rows = card.locator("[data-daily-journey-steps]");
    await expect(rows).toContainText("Gün 1 yulafı");
    await expect(rows).toContainText("Daha önceki öğün");
    await expect(rows.locator('[data-step-state="completed"]')).toHaveCount(0);
    await expect(card.locator("[data-journey-tracking-steps]")).toContainText("Kilo ölçümü");
    await expect(card).toContainText("0/4 adım");
    await focus.getByRole("button", { name: "Yedim", exact: true }).click();
    await expect(card).toContainText("1/4 adım");
    expect(f.state.posts).toHaveLength(0);
    expect(f.state.decisionWrites).toEqual([{ path: "/tracking/meal-check-ins/synthetic-plan/1/2", method: "PUT", revision: 0, desired: "EATEN" }]);
    expect(f.state.meals.every((entry) => entry.calories == null && entry.name == null)).toBe(true);
  });
}
for (const mode of ["expired", "future", "none", "error", "loading"] as const) {
  test(`11-A: ${mode} plan is explained without invented menu or paid generation`, async ({
    page,
  }) => {
    const p = fullCalendarPlan(7, mode === "future" ? "2026-10-29" : "2026-10-21");
    const f = await fixture(page, {
      plan: mode === "none" ? null : p,
      now: "2026-10-28T19:00:00+03:00",
      noMealRecords: true,
      planReadError: mode === "error",
      delayPlan: mode === "loading",
    });
    const planWrites: string[] = [];
    page.on("request", (req) => {
      if (new URL(req.url()).pathname.startsWith("/api/nutrition-plans") && req.method() !== "GET")
        planWrites.push(req.method());
    });
    await open(page);
    const notice = section(page).locator("[data-journey-plan-fallback]");
    await expect(notice).toHaveAttribute("data-plan-status", mode === "future" ? "upcoming" : mode);
    if (mode === "expired") await expect(notice).toContainText("27 Ekim 2026 tarihinde sona erdi");
    if (mode === "future") await expect(notice).toContainText("29 Ekim 2026");
    if (mode === "none") await expect(notice).toContainText("Etkin bir beslenme planın yok");
    if (mode === "error") await expect(notice).toContainText("doğrulanamadı");
    if (mode === "loading") await expect(notice).toContainText("doğrulanıyor");
    await expect(section(page).locator("[data-journey-plan-meal]")).toHaveCount(0);
    const outer = section(page).locator("[data-journey-outer-toggle]");
    if ((await outer.getAttribute("aria-expanded")) === "false") await outer.click();
    await expect(notice).toBeVisible();
    await expect(notice.getByRole("link", { name: "Planı görüntüle" })).toHaveAttribute(
      "href",
      "/meals/plan",
    );
    expect(planWrites).toEqual([]);
    expect(f.state.posts).toEqual([]);
  });
}
for (const water of [0, 2250, 2500, 2750]) {
  test(`11-A: water ${water} keeps a fixed denominator and only pending water can be added in Journey`, async ({
    page,
  }) => {
    const f = await fixture(page, { waterMl: water, waterGoalMl: 2500 });
    await open(page);
    const card = section(page);
    await card.locator("[data-journey-details-toggle]").click();
    if (water < 2500) {
      await expect(
        card.getByRole("button", { name: "+250 ml su ekle", exact: true }),
      ).toBeVisible();
      await expect(card).toContainText("1/4 adım");
    } else {
      await expect(card.getByRole("button", { name: "+250 ml su ekle", exact: true })).toHaveCount(
        0,
      );
      await expect(card).toContainText("2/4 adım");
      await expect(
        card
          .locator("[data-journey-tracking-steps] [data-journey-timeline-step]")
          .filter({ hasText: "Su hedefin tamamlandı" }),
      ).toHaveCount(0);
      await card.locator("[data-journey-completed] > summary").click();
      await expect(card.locator("[data-journey-completed]")).toContainText(
        `Su hedefin tamamlandı (${water}/2500 ml)`,
      );
      // Simulate the authoritative record being removed, then re-read it on reload.
      f.state.water = 0;
      await page.reload();
      await expect(card).toContainText("1/4 adım");
      await expect(
        card.getByRole("button", { name: "+250 ml su ekle", exact: true }),
      ).toBeVisible();
    }
    expect(f.state.waterPosts).toBe(0);
  });
}
test("11-A: completing Journey water does not block the existing independent water action", async ({
  page,
}) => {
  const f = await fixture(page, { waterMl: 2500, waterGoalMl: 2500 });
  await open(page);
  await page.getByRole("button", { name: "Su Ekle", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Su ekle", exact: true });
  await dialog.getByRole("button", { name: "250 ml su ekle", exact: true }).click();
  await expect.poll(() => f.state.waterPosts).toBe(1);
  expect(f.state.water).toBe(2750);
  await expect(
    section(page).getByRole("button", { name: "+250 ml su ekle", exact: true }),
  ).toHaveCount(0);
});
test("11-A: postponed final day keeps the real overnight menu before showing expiration", async ({
  page,
}) => {
  const p = fullCalendarPlan(7, "2026-10-16");
  p.dailyPlans.calendar.forEach((entry) => (entry.dateOffsetDays = 1));
  p.dailyPlans.cycle[6].meals = [
    meal("Akşam yemeği", "22:00", "Gece ana öğünü"),
    meal("Ara öğün", "02:00", "Gece ara öğünü"),
  ];
  await fixture(page, { plan: p, now: "2026-10-24T01:00:00+03:00", noMealRecords: true });
  // Last mapped day is 23 October after postponement; its 02:00 meal is on 24 October.
  await open(page);
  const focus = section(page).locator("[data-journey-plan-meal]");
  await expect(focus).toContainText("Gece ara öğünü");
  await expect(focus).toContainText("Yaklaşıyor");
  await expect(focus.locator("time")).toContainText("24 Ekim · Planlanan 02:00");
});

test("11-B: 409 re-reads the other device decision without replaying an old intent", async ({ page }) => {
  const f = await fixture(page);
  await open(page);
  const card = section(page), eat = card.getByRole("button", { name: "Yedim", exact: true });
  await expect(eat).toBeEnabled();
  f.decide(1, "SKIPPED");
  await eat.click();
  await expect(card).toContainText("başka bir cihazda değişti");
  await expect(card).toContainText("2/4 adım");
  expect(f.state.decisionWrites).toHaveLength(1);
  expect(f.state.decisionWrites[0]).toMatchObject({ revision: 0, desired: "EATEN" });
  expect(f.state.posts).toHaveLength(0);
  await page.reload();
  await expect(card).toContainText("2/4 adım");
  expect(f.state.decisionWrites).toHaveLength(1);
});
for (const status of [401, 403, 404, 422, 503]) {
  test(`11-B: ${status} mutation error never completes or falls back to legacy food writes`, async ({ page }) => {
    const f = await fixture(page);
    await open(page);
    await expect(section(page).getByRole("button", { name: "Yedim", exact: true })).toBeEnabled();
    f.state.mutationStatus = status;
    await section(page).getByRole("button", { name: "Yedim", exact: true }).click();
    await expect(section(page)).toContainText("İşlem doğrulanamadı");
    await expect(section(page)).toContainText("1/4 adım");
    expect(f.state.decisionWrites).toHaveLength(1);
    expect(f.state.posts).toHaveLength(0);
  });
}
test("11-B: unavailable v2 storage stays unknown and explicit re-read restores the same scope", async ({ page }) => {
  const f = await fixture(page, { decisionStatus: 503 });
  await open(page);
  await expect(section(page).getByText("Öğün takibi şu anda kullanılamıyor", { exact: false })).toBeVisible();
  await expect(section(page).getByRole("button", { name: "Yedim", exact: true })).toBeDisabled();
  await expect(section(page).getByRole("progressbar")).not.toHaveAttribute("aria-valuenow", "100");
  expect(f.state.posts).toHaveLength(0);
  f.state.decisionStatus = 0;
  await section(page).getByRole("button", { name: "Öğünleri tekrar oku", exact: true }).click();
  await expect(section(page)).toContainText("1/4 adım");
  await expect(section(page).getByRole("button", { name: "Yedim", exact: true })).toBeEnabled();
  expect(f.state.decisionWrites).toHaveLength(0);
});
test("11-B: lost write response is resolved by a read, never a second mutation", async ({ page }) => {
  const f = await fixture(page);
  await open(page);
  await expect(section(page).getByRole("button", { name: "Yedim", exact: true })).toBeEnabled();
  f.state.loseDecisionResponse = true;
  await section(page).getByRole("button", { name: "Yedim", exact: true }).click();
  await expect(section(page)).toContainText("2/4 adım");
  await expect(section(page)).toContainText("otomatik tekrar yapılmadı");
  expect(f.state.decisionWrites).toHaveLength(1);
  expect(f.state.posts).toHaveLength(0);
});
test("11-B: a network read failure cannot reuse old slot evidence", async ({ page }) => {
  const f = await fixture(page);
  f.state.abortDecisionRead = true;
  await open(page);
  await expect(section(page)).toContainText("Öğün takibi şu anda kullanılamıyor");
  await expect(section(page).getByRole("button", { name: "Yedim", exact: true })).toBeDisabled();
  expect(f.state.decisionWrites).toHaveLength(0);
  expect(f.state.posts).toHaveLength(0);
});
async function enterDifferent(page: Page) {
  await section(page).getByRole("button", { name: "Farklı yedim", exact: true }).click();
  await expect(page.locator("[data-journey-food-entry]")).toBeVisible();
}
async function fillSyntheticFood(page: Page) {
  await page.getByLabel("Besin Adı", { exact: true }).fill("Sentetik farklı besin");
  await page.getByLabel("Miktar", { exact: true }).fill("1 porsiyon");
  await page.getByLabel("Kalori (kcal)", { exact: true }).fill("100");
}
test("11-B: food search fills the existing form without writing or confirming until explicit save", async ({ page }) => {
  const f = await fixture(page);
  await open(page); await enterDifferent(page);
  await page.getByRole("searchbox", { name: "Besin ara", exact: true }).fill("tavuk");
  await page.getByRole("button", { name: /Tavuk/i }).first().click();
  expect(f.state.posts).toHaveLength(0); expect(f.state.decisionWrites).toHaveLength(0);
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(section(page)).toBeVisible();
  await expect(section(page)).toContainText("1/4 adım");
  expect(f.state.posts).toHaveLength(1); expect(f.state.decisionWrites).toHaveLength(0);
});
test("11-B: changed plan while editing prevents a food write", async ({ page }) => {
  const f = await fixture(page);
  await open(page); await enterDifferent(page); await fillSyntheticFood(page);
  f.state.plan = { ...f.state.plan!, id: "other-plan" };
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByText("Kayıt doğrulanamadı", { exact: false })).toBeVisible();
  expect(f.state.posts).toHaveLength(0); expect(f.state.decisionWrites).toHaveLength(0);
});
test("11-B: midnight and malformed meal context fail closed without a food write", async ({ page }) => {
  const f = await fixture(page, { now: `${today}T23:59:00+03:00` });
  await open(page); await enterDifferent(page);
  const url = page.url();
  await page.clock.fastForward(61_000);
  await expect(page.locator("[data-journey-entry-blocked]")).toBeVisible();
  await page.goto(url.replace(/journey=[^&]+/, "journey=invalid"));
  await expect(page.locator("[data-journey-entry-blocked]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Kaydet", exact: true })).toHaveCount(0);
  expect(f.state.posts).toHaveLength(0); expect(f.state.decisionWrites).toHaveLength(0);
});
test("11-B: prior account entry context cannot be used by another authenticated account", async ({ page }) => {
  const f = await fixture(page);
  await open(page); await enterDifferent(page);
  const oldEntry = page.url();
  await page.goto("/profile"); await page.getByText("Çıkış yap", { exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  f.state.owner = "synthetic-b";
  await page.getByLabel("E-posta").fill("journey-b@example.com");
  await page.getByLabel("Şifre", { exact: true }).fill("SyntheticPass123");
  await page.getByRole("button", { name: "Giriş Yap", exact: true }).click();
  await expect(section(page)).toBeVisible();
  await page.goto(oldEntry);
  await expect(page.locator("[data-journey-entry-blocked]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Kaydet", exact: true })).toHaveCount(0);
  expect(f.state.posts).toHaveLength(0); expect(f.state.decisionWrites).toHaveLength(0);
});
for (const mode of ["photo", "barcode"] as const) {
  test(`11-B: ${mode} scan keeps exact entry context and only explicit food save writes once`, async ({ page }) => {
    const f = await fixture(page);
    await open(page); await enterDifferent(page);
    await page.getByRole("link", { name: mode === "photo" ? "Fotoğrafla tara" : "Barkod okut", exact: true }).click();
    await expect(page.locator("[data-journey-scan-context]")).toContainText("Öğle yemeği");
    expect(f.state.posts).toHaveLength(0); expect(f.state.decisionWrites).toHaveLength(0);
    if (mode === "photo") {
      await page.locator('input[type="file"]').first().setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
      await page.getByRole("button", { name: "Görseli analiz et", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Sentetik taranan yemek", exact: true })).toBeVisible();
      expect(f.state.photoScans).toBe(1);
      expect(f.state.posts).toHaveLength(0);
      await page.clock.setFixedTime(new Date(`${today}T14:07:13+03:00`));
      await page.getByRole("button", { name: "Seçilen porsiyonu öğüne ekle", exact: true }).click();
    } else {
      await expect(page.getByRole("tab", { name: "Barkod Tara", exact: true })).toHaveAttribute("aria-selected", "true");
      await page.getByLabel("Barkod numarası", { exact: true }).fill("8690000000001");
      await page.getByRole("button", { name: "Sorgula", exact: true }).click();
      await expect(page.getByText("Sentetik barkod ürünü", { exact: true }).first()).toBeVisible();
      expect(f.state.posts).toHaveLength(0);
      await page.getByRole("button", { name: "Öğüne ekle", exact: true }).click();
      await expect(page.getByText("1 paket tüketim", { exact: true })).toBeVisible();
      await page.clock.setFixedTime(new Date(`${today}T14:07:13+03:00`));
      await page.getByRole("button", { name: "Öğüne ekle", exact: true }).click();
    }
    await expect(section(page)).toBeVisible();
    await expect(section(page)).toContainText("Besin kaydedildi. Öğün kararını ayrıca seç");
    await expect(section(page)).toContainText("1/4 adım");
    expect(f.state.posts).toHaveLength(1); expect(f.state.decisionWrites).toHaveLength(0);
    expect(f.state.posts[0]).toMatchObject({ mealType: "LUNCH", calories: 100, micronutrients: { iron: 2 }, loggedAt: `${today}T11:07:13.000Z` });
    await section(page).getByRole("button", { name: "Yedim", exact: true }).click();
    await expect(section(page)).toContainText("2/4 adım");
    expect(f.state.posts).toHaveLength(1); expect(f.state.decisionWrites).toHaveLength(1);
  });
}

test("11-B: FREE Yemedim is a reversible decision, with no calories and a fixed denominator", async ({ page }) => {
  const f = await fixture(page);
  await open(page);
  await section(page).getByRole("button", { name: "Yemedim", exact: true }).click();
  await expect(section(page)).toContainText("Yemedim kaydedildi. Besin veya kalori eklenmedi.");
  await expect(section(page)).toContainText("2/4 adım");
  expect(f.state.posts).toHaveLength(0);
  await section(page).getByRole("button", { name: "Son öğün kararını geri al", exact: true }).click();
  await expect(section(page)).toContainText("1/4 adım");
  expect(f.state.decisionWrites.map(w => w.desired)).toEqual(["SKIPPED", "PENDING"]);
  await page.reload();
  await expect(section(page)).toContainText("1/4 adım");
  expect(f.state.posts).toHaveLength(0);
});
test("11-B: tampered meal index and reused saved entry cannot create another food record", async ({ page }) => {
  const f = await fixture(page);
  await open(page); await enterDifferent(page);
  const original = page.url();
  await page.evaluate(() => {
    const token = new URLSearchParams(location.search).get("journey")!;
    const key = "diewish:journey-entry:" + token;
    const entry = JSON.parse(sessionStorage.getItem(key)!);
    entry.identity.mealIndex = 99;
    sessionStorage.setItem(key, JSON.stringify(entry));
  });
  await page.reload();
  await expect(page.locator("[data-journey-entry-blocked]")).toBeVisible();
  expect(f.state.posts).toHaveLength(0);
  await page.goto("/dashboard");
  await enterDifferent(page); await fillSyntheticFood(page);
  const savedEntry = page.url();
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(section(page)).toBeVisible();
  expect(f.state.posts).toHaveLength(1);
  await page.goto(savedEntry);
  await expect(page.locator("[data-journey-entry-blocked]")).toContainText("Besin zaten kaydedildi");
  await expect(page.getByRole("button", { name: "Kaydet", exact: true })).toHaveCount(0);
  expect(f.state.posts).toHaveLength(1); expect(f.state.decisionWrites).toHaveLength(0);
  expect(savedEntry).not.toBe(original);
});
