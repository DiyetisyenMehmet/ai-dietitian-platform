const { test, expect } = require("@playwright/test");

const WEB_BASE_URL = process.env.E2E_WEB_BASE_URL || "https://staging.diewish.com";
const API_BASE_URL = process.env.E2E_API_BASE_URL || WEB_BASE_URL + "/api";
const PASSWORD = "Stage4HistoryCorePass123";
const ZONE = "Europe/Istanbul";

test.use({
  viewport: { width: 390, height: 844 },
  timezoneId: ZONE,
});

async function apiJson(request, method, path, { token, data } = {}) {
  const options = {};
  if (token) options.headers = { authorization: "Bearer " + token };
  if (data !== undefined) options.data = data;
  const response = await request[method](API_BASE_URL + path, options);
  const text = response.status() === 204 ? "" : await response.text();
  return { response, body: text ? JSON.parse(text) : null };
}

async function grantRequiredConsents(request, token) {
  for (const type of ["TERMS_OF_SERVICE", "MEDICAL_DISCLAIMER", "KVKK_EXPLICIT_CONSENT"]) {
    const result = await apiJson(request, "post", "/legal/consents", { token, data: { type } });
    expect(result.response.status()).toBe(200);
    expect(result.body.success).toBe(true);
  }
}

async function createOnboardedUser(request) {
  const runId = String(Date.now()) + "." + Math.random().toString(16).slice(2);
  const email = "stage4-history-core." + runId + "@example.com";
  const fullName = "Stage4 History Core User";

  const registration = await apiJson(request, "post", "/auth/register", {
    data: { email, password: PASSWORD, fullName },
  });
  expect(registration.response.status()).toBe(201);
  expect(registration.body.success).toBe(true);

  const token = registration.body.data.tokens.accessToken;
  await grantRequiredConsents(request, token);

  const onboarding = await apiJson(request, "post", "/onboarding", {
    token,
    data: {
      fullName,
      dateOfBirth: "1990-05-20",
      gender: "PREFER_NOT_TO_SAY",
      heightCm: 175,
      currentWeightKg: 70,
      targetWeightKg: 65,
      activityLevel: "MODERATE",
      healthConditions: [],
      allergies: [],
      dietaryPreference: "OMNIVORE",
      dailyWaterGoalMl: 2500,
      workScheduleType: "REGULAR",
      usualWakeTime: "07:00",
      usualSleepTime: "23:00",
    },
  });
  expect(onboarding.response.status()).toBe(200);
  expect(onboarding.body.success).toBe(true);
  expect(onboarding.body.data.onboardingCompleted).toBe(true);

  const profile = await apiJson(request, "get", "/onboarding", { token });
  expect(profile.response.status()).toBe(200);
  expect(profile.body.data.profile.workScheduleType).toBe("REGULAR");

  return { email, token };
}

async function historyDay(request, token, date, timezone = ZONE) {
  const query = new URLSearchParams({ date, timezone }).toString();
  return apiJson(request, "get", "/history/day?" + query, { token });
}

async function historyComparison(request, token, period, referenceDate) {
  const query = new URLSearchParams({ period, referenceDate, timezone: ZONE }).toString();
  return apiJson(request, "get", "/history/comparison?" + query, { token });
}

function expectNoNonFinite(value) {
  const walk = (node) => {
    if (typeof node === "number") expect(Number.isFinite(node)).toBe(true);
    if (typeof node === "string") {
      expect(node).not.toBe("NaN");
      expect(node).not.toBe("Infinity");
      expect(node).not.toBe("-Infinity");
    }
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") Object.values(node).forEach(walk);
  };
  walk(value);
}

async function loginBrowser(page, email) {
  await page.goto(WEB_BASE_URL + "/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });
}

test("Stage4B-1 real staging core History acceptance", async ({ page, request }) => {
  test.setTimeout(180000);
  const user = await createOnboardedUser(request);

  // Empty day: missing is not fabricated zero.
  const empty = await historyDay(request, user.token, "2026-09-01");
  expect(empty.response.status()).toBe(200);
  expect(empty.body.data.history.nutrition.status).toBe("NONE");
  expect(empty.body.data.history.nutrition.totals.calories).toEqual({
    state: "NO_RECORD",
    value: null,
  });
  expect(empty.body.data.history.water.totalMl).toEqual({
    state: "NO_RECORD",
    value: null,
  });
  expect(empty.body.data.history.activity.status).toBe("NONE");
  expect(empty.body.data.history.sleep.status).toBe("NONE");
  expect(empty.body.data.history.weight.measurement).toBeNull();
  expect(empty.body.data.history.meta.partialResponse).toBe(false);

  // Bare meal occurrence: present but nutrition remains unknown, never zero.
  const bare = await apiJson(request, "post", "/tracking/meals", {
    token: user.token,
    data: { mealType: "BREAKFAST", loggedAt: "2026-09-02T09:00:00.000Z" },
  });
  expect(bare.response.status()).toBe(201);
  const bareDay = await historyDay(request, user.token, "2026-09-02");
  const bareBreakfast = bareDay.body.data.history.nutrition.meals.find(
    (meal) => meal.mealType === "BREAKFAST",
  );
  expect(bareBreakfast.occurrenceRecorded).toBe(true);
  expect(bareBreakfast.items).toEqual([]);
  expect(bareBreakfast.totals.calories).toEqual({ state: "UNKNOWN", value: null });
  expect(bareDay.body.data.history.nutrition.status).toBe("PARTIAL");

  // Meal-only and water-only days preserve category absence.
  const mealOnly = await apiJson(request, "post", "/tracking/meals", {
    token: user.token,
    data: {
      mealType: "LUNCH",
      name: "Stage4 Core Meal",
      calories: 410,
      proteinG: 24,
      carbsG: 48,
      fatG: 14,
      loggedAt: "2026-09-03T09:00:00.000Z",
    },
  });
  expect(mealOnly.response.status()).toBe(201);
  const mealOnlyDay = await historyDay(request, user.token, "2026-09-03");
  expect(mealOnlyDay.body.data.history.nutrition.totals.calories).toEqual({
    state: "KNOWN_VALUE",
    value: 410,
  });
  expect(mealOnlyDay.body.data.history.water.totalMl.state).toBe("NO_RECORD");
  expect(mealOnlyDay.body.data.history.activity.status).toBe("NONE");
  expect(mealOnlyDay.body.data.history.sleep.status).toBe("NONE");
  expect(mealOnlyDay.body.data.history.weight.measurement).toBeNull();

  const waterOnly = await apiJson(request, "post", "/tracking/water", {
    token: user.token,
    data: { amountMl: 650, loggedAt: "2026-09-04T09:00:00.000Z" },
  });
  expect(waterOnly.response.status()).toBe(201);
  const waterOnlyDay = await historyDay(request, user.token, "2026-09-04");
  expect(waterOnlyDay.body.data.history.water.totalMl).toEqual({
    state: "KNOWN_VALUE",
    value: 650,
  });
  expect(waterOnlyDay.body.data.history.water.historicalGoalComparisonAvailable).toBe(false);
  expect(waterOnlyDay.body.data.history.nutrition.status).toBe("NONE");

  // Known zero is distinct from no record.
  const zeroMeal = await apiJson(request, "post", "/tracking/meals", {
    token: user.token,
    data: {
      mealType: "LUNCH",
      name: "Stage4 Known Zero",
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      loggedAt: "2026-09-07T09:00:00.000Z",
    },
  });
  expect(zeroMeal.response.status()).toBe(201);
  const zeroDay = await historyDay(request, user.token, "2026-09-07");
  expect(zeroDay.body.data.history.nutrition.totals.calories).toEqual({
    state: "KNOWN_ZERO",
    value: 0,
  });

  // Multi-category day and deterministic timeline.
  const meal = await apiJson(request, "post", "/tracking/meals", {
    token: user.token,
    data: {
      mealType: "BREAKFAST",
      name: "Stage4 Timeline Meal",
      calories: 520,
      proteinG: 32,
      carbsG: 55,
      fatG: 18,
      loggedAt: "2026-09-10T06:00:00.000Z",
    },
  });
  expect(meal.response.status()).toBe(201);

  const waterA = await apiJson(request, "post", "/tracking/water", {
    token: user.token,
    data: { amountMl: 400, loggedAt: "2026-09-10T06:00:00.000Z" },
  });
  const waterB = await apiJson(request, "post", "/tracking/water", {
    token: user.token,
    data: { amountMl: 500, loggedAt: "2026-09-10T06:00:00.000Z" },
  });
  expect(waterA.response.status()).toBe(201);
  expect(waterB.response.status()).toBe(201);

  const weight = await apiJson(request, "post", "/tracking/weight", {
    token: user.token,
    data: { weightKg: 69.4, loggedAt: "2026-09-10T07:00:00.000Z" },
  });
  expect(weight.response.status()).toBe(201);

  const activity = await apiJson(request, "post", "/activity", {
    token: user.token,
    data: {
      type: "WALKING",
      name: "Stage4 Core Walk",
      durationMinutes: 35,
      distanceKm: 2.8,
      caloriesBurned: 145,
      loggedAt: "2026-09-10T08:00:00.000Z",
    },
  });
  expect(activity.response.status()).toBe(201);

  const sleep = await apiJson(request, "post", "/sleep", {
    token: user.token,
    data: {
      sleepStart: "2026-09-09T20:40:00.000Z",
      wakeTime: "2026-09-10T04:20:00.000Z",
      quality: 4,
      note: "Stage4 Core private sleep note",
    },
  });
  expect(sleep.response.status()).toBe(201);

  const complete = await historyDay(request, user.token, "2026-09-10");
  expect(complete.response.status()).toBe(200);
  const history = complete.body.data.history;
  expect(history.nutrition.totals.calories.value).toBe(520);
  expect(history.water.totalMl.value).toBe(900);
  expect(history.activity.totalActiveMinutes.value).toBe(35);
  expect(history.sleep.entries).toHaveLength(1);
  expect(history.sleep.entries[0].wakeTime).toBe("2026-09-10T04:20:00.000Z");
  expect(history.sleep.entries[0].durationMinutes).toBe(460);
  expect(history.weight.measurement.weightKg).toBe(69.4);
  expect(history.completeness.nutrition.status).toBe("RECORDED");
  expect(history.completeness.water.status).toBe("RECORDED");
  expect(history.completeness.activity.status).toBe("RECORDED");
  expect(history.completeness.sleep.status).toBe("RECORDED");
  expect(history.completeness.weight.status).toBe("RECORDED");

  const times = history.timeline.map((event) => new Date(event.timestamp).getTime());
  expect(times).toEqual([...times].sort((a, b) => a - b));
  expect(history.timeline[0].type).toBe("SLEEP");
  const sixUtc = history.timeline.filter((event) => event.timestamp === "2026-09-10T06:00:00.000Z");
  expect(sixUtc[0].type).toBe("MEAL");
  expect(sixUtc.slice(1).every((event) => event.type === "WATER")).toBe(true);
  const sameTimeWaterIds = sixUtc.slice(1).map((event) => event.sourceId);
  expect(sameTimeWaterIds).toEqual([...sameTimeWaterIds].sort());

  // Cross-midnight sleep belongs only to the wake date.
  const previousDay = await historyDay(request, user.token, "2026-09-09");
  expect(previousDay.body.data.history.sleep.entries).toHaveLength(0);
  expect(previousDay.body.data.history.timeline.filter((event) => event.type === "SLEEP")).toHaveLength(0);
  expect(history.timeline.filter((event) => event.type === "SLEEP")).toHaveLength(1);

  // Exact-day weight: profile current weight is never backfilled into another day.
  const noWeight = await historyDay(request, user.token, "2026-09-11");
  expect(noWeight.body.data.history.weight.status).toBe("NONE");
  expect(noWeight.body.data.history.weight.measurement).toBeNull();

  // Weekly equal-period comparison + numeric safety.
  const currentMeal = await apiJson(request, "post", "/tracking/meals", {
    token: user.token,
    data: {
      mealType: "LUNCH",
      name: "Stage4 Current Week",
      calories: 600,
      proteinG: 40,
      carbsG: 60,
      fatG: 20,
      loggedAt: "2026-09-14T09:00:00.000Z",
    },
  });
  expect(currentMeal.response.status()).toBe(201);
  await apiJson(request, "post", "/tracking/water", {
    token: user.token,
    data: { amountMl: 500, loggedAt: "2026-09-08T09:00:00.000Z" },
  });
  await apiJson(request, "post", "/tracking/water", {
    token: user.token,
    data: { amountMl: 700, loggedAt: "2026-09-15T09:00:00.000Z" },
  });

  const weekly = await historyComparison(request, user.token, "week", "2026-09-16");
  expect(weekly.response.status()).toBe(200);
  const week = weekly.body.data.comparison;
  expect(week.comparisonMode).toBe("EQUAL_ELAPSED_DAYS");
  expect(week.currentPeriod.localStartDate).toBe("2026-09-14");
  expect(week.currentPeriod.localEndDateInclusive).toBe("2026-09-16");
  expect(week.currentPeriod.days).toBe(3);
  expect(week.previousPeriod.localStartDate).toBe("2026-09-07");
  expect(week.previousPeriod.localEndDateInclusive).toBe("2026-09-09");
  expect(week.previousPeriod.days).toBe(3);
  expect(week.metrics.nutrition.averageCaloriesPerQuantifiedDay.previous.value).toBe(0);
  expect(week.metrics.nutrition.averageCaloriesPerQuantifiedDay.percentageChange).toBeNull();
  expect(week.metrics.nutrition.averageCaloriesPerQuantifiedDay.direction).toBe("UP");
  expect(week.metrics.nutrition.averageCaloriesPerQuantifiedDay.quality).not.toBe("NONE");
  expect(week.completeness.current.nutrition.recordedDays).toBe(1);
  expect(week.completeness.current.nutrition.quantifiedDays).toBe(1);
  expect(week.completeness.current.nutrition.expectedDays).toBe(3);
  expect(week.completeness.current.nutrition.coverageRatio).toBeCloseTo(1 / 3, 6);
  expect(week.completeness.current.nutrition.status).toBe("PARTIAL");
  expectNoNonFinite(week);

  // Monthly current partial period and historical short-month clamp.
  const monthly = await historyComparison(request, user.token, "month", "2026-09-19");
  expect(monthly.response.status()).toBe(200);
  const month = monthly.body.data.comparison;
  expect(month.comparisonMode).toBe("EQUAL_ELAPSED_DAYS");
  expect(month.currentPeriod.localStartDate).toBe("2026-09-01");
  expect(month.currentPeriod.localEndDateInclusive).toBe("2026-09-19");
  expect(month.currentPeriod.days).toBe(19);
  expect(month.previousPeriod.localStartDate).toBe("2026-08-01");
  expect(month.previousPeriod.localEndDateInclusive).toBe("2026-08-19");
  expect(month.previousPeriod.days).toBe(19);
  expectNoNonFinite(month);

  const march = await historyComparison(request, user.token, "month", "2026-03-31");
  expect(march.response.status()).toBe(200);
  expect(march.body.data.comparison.currentPeriod.days).toBe(31);
  expect(march.body.data.comparison.previousPeriod.days).toBe(28);
  expectNoNonFinite(march.body.data.comparison);

  // 2028 edge cannot be a runtime acceptance input yet because future dates fail closed.
  const futureLeapEdge = await historyComparison(request, user.token, "month", "2028-03-31");
  expect(futureLeapEdge.response.status()).toBe(400);

  // Real staging UI. Prevent any provider-backed insight request in 4B-1.
  await loginBrowser(page, user.email);
  await page.route("**/api/history/insight", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: { code: "STAGE4B1_AI_DISABLED", message: "AI excluded from Stage4B-1" },
      }),
    });
  });

  await page.goto(WEB_BASE_URL + "/progress");
  const historyEntry = page.getByRole("link", { name: "Tüm geçmişimi gör" });
  await expect(historyEntry).toHaveAttribute("href", "/history");
  await historyEntry.click();
  await expect(page).toHaveURL(/\/history$/);

  const dateInput = page.locator('input[type="date"]');
  await expect(dateInput).toHaveValue("2026-09-19");
  await dateInput.fill("2026-09-10");
  await expect(page.getByText("Stage4 Timeline Meal", { exact: true })).toBeVisible();

  const timelineSection = page.locator("section").filter({
    has: page.getByText("Zaman çizelgesi", { exact: true }),
  });
  const beforeReload = await timelineSection.locator("li").allTextContents();
  const urlBefore = new URL(page.url());
  expect(urlBefore.search).toBe("");

  await page.reload();
  await expect(page.getByText("Geçmişim", { exact: true })).toBeVisible();
  await expect(page.locator('input[type="date"]')).toHaveValue("2026-09-19");
  expect(new URL(page.url()).search).toBe("");
  await page.locator('input[type="date"]').fill("2026-09-10");
  await expect(page.getByText("Stage4 Timeline Meal", { exact: true })).toBeVisible();
  const afterReload = await page.locator("section").filter({
    has: page.getByText("Zaman çizelgesi", { exact: true }),
  }).locator("li").allTextContents();
  expect(afterReload).toEqual(beforeReload);

  await page.getByRole("button", { name: "Haftalık" }).click();
  await page.locator('input[type="date"]').fill("2026-09-16");
  await expect(page.getByText("Dönem karşılaştırması", { exact: true })).toBeVisible();
  await expect(page.getByText(/karşılaştırma sınırlı olabilir/)).toBeVisible();

  await page.getByRole("button", { name: "Aylık" }).click();
  await page.locator('input[type="date"]').fill("2026-09-19");
  await expect(page.getByText("Dönem karşılaştırması", { exact: true })).toBeVisible();

  // UI distinguishes data absence from technical unavailability/error.
  await page.getByRole("button", { name: "Günlük" }).click();
  await page.locator('input[type="date"]').fill("2026-09-01");
  await expect(page.getByText("Bu gün için henüz kayıt bulunmuyor", { exact: true })).toBeVisible();

  await page.route("**/api/history/day?*", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: { code: "HISTORY_SOURCES_UNAVAILABLE", message: "Controlled Stage4B-1 unavailable source path" },
      }),
    });
  });
  await page.locator('input[type="date"]').fill("2026-09-05");
  await expect(page.getByText("Geçmiş yüklenemedi", { exact: true })).toBeVisible();
  await page.unroute("**/api/history/day?*");

  expect(await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )).toBe(false);
});
