const { test, expect } = require("@playwright/test");

const WEB_BASE_URL = process.env.E2E_WEB_BASE_URL || "https://staging.diewish.com";
const API_BASE_URL = process.env.E2E_API_BASE_URL || WEB_BASE_URL + "/api";
const PASSWORD = "Stage4HistoryPass123";
const ZONE = "Europe/Istanbul";

test.use({
  viewport: { width: 390, height: 844 },
  timezoneId: ZONE,
});

async function apiJson(request, method, path, options = {}) {
  const requestOptions = {};
  if (options.token) requestOptions.headers = { authorization: "Bearer " + options.token };
  if (options.data !== undefined) requestOptions.data = options.data;
  const response = await request[method](API_BASE_URL + path, requestOptions);
  let body = null;
  if (response.status() !== 204) {
    const bodyText = await response.text();
    body = bodyText ? JSON.parse(bodyText) : null;
  }
  return { response, body };
}

async function grantRequiredConsents(request, token) {
  for (const type of ["TERMS_OF_SERVICE", "MEDICAL_DISCLAIMER", "KVKK_EXPLICIT_CONSENT"]) {
    const result = await apiJson(request, "post", "/legal/consents", {
      token,
      data: { type },
    });
    expect(result.response.status()).toBe(200);
    expect(result.body.success).toBe(true);
  }
}

async function createOnboardedUser(request, prefix, probeInvalidWorkSchedule = false) {
  const runId = String(Date.now()) + "." + Math.random().toString(16).slice(2);
  const email = prefix + "." + runId + "@example.com";
  const fullName = prefix.includes("-a") ? "Stage4 History User A" : "Stage4 History User B";

  const registration = await apiJson(request, "post", "/auth/register", {
    data: { email, password: PASSWORD, fullName },
  });
  expect(registration.response.status()).toBe(201);
  expect(registration.body.success).toBe(true);
  const token = registration.body.data.tokens.accessToken;
  const userId = registration.body.data.user.id;

  await grantRequiredConsents(request, token);

  const onboardingPayload = {
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
  };

  if (probeInvalidWorkSchedule) {
    const invalid = await apiJson(request, "post", "/onboarding", {
      token,
      data: { ...onboardingPayload, workScheduleType: "DAY_SHIFT" },
    });
    const safeDetails = Array.isArray(invalid.body?.error?.details)
      ? invalid.body.error.details.map((item) => ({
          field: item?.field ?? null,
          message: item?.message ?? null,
        }))
      : [];
    console.log(
      "ONBOARDING_CONTRACT_PROBE",
      JSON.stringify({
        status: invalid.response.status(),
        code: invalid.body?.error?.code ?? null,
        message: invalid.body?.error?.message ?? null,
        details: safeDetails,
      }),
    );
    expect(invalid.response.status()).toBe(422);
    expect(invalid.body?.success).toBe(false);
    expect(invalid.body?.error?.code).toBe("UNPROCESSABLE_ENTITY");
    expect(safeDetails.some((item) => item.field === "workScheduleType")).toBe(true);
  }

  const onboarding = await apiJson(request, "post", "/onboarding", {
    token,
    data: onboardingPayload,
  });
  expect(onboarding.response.status()).toBe(200);
  expect(onboarding.body.success).toBe(true);
  expect(onboarding.body.data.onboardingCompleted).toBe(true);
  return { email, fullName, token, userId };
}

async function loginBrowser(page, user) {
  await page.goto(WEB_BASE_URL + "/login");
  await page.getByLabel("E-posta").fill(user.email);
  await page.getByLabel("Şifre", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });
}

async function historyDay(request, token, date, timezone = ZONE) {
  const query = new URLSearchParams({ date, timezone }).toString();
  return apiJson(request, "get", "/history/day?" + query, { token });
}

async function historyComparison(request, token, period, referenceDate, timezone = ZONE) {
  const query = new URLSearchParams({ period, referenceDate, timezone }).toString();
  return apiJson(request, "get", "/history/comparison?" + query, { token });
}

async function insight(request, token, scope, date, timezone = ZONE) {
  return apiJson(request, "post", "/history/insight", {
    token,
    data:
      scope === "DAY"
        ? { scope, date, timezone }
        : { scope, referenceDate: date, timezone },
  });
}

async function expectFreshAiAfterMutation(
  request,
  token,
  scope,
  date,
  previousGeneratedAt,
) {
  let last = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    last = await insight(request, token, scope, date);
    expect(last.response.status()).toBe(200);

    const value = last.body.data.insight;
    console.log(
      "HISTORY_AI_INVALIDATION_PROBE",
      JSON.stringify({
        scope,
        attempt,
        generatedBy: value.generatedBy,
        cacheStatus: value.cacheStatus,
        provider: value.provider,
        model: value.model,
        generatedAt: value.generatedAt,
      }),
    );

    // A source mutation must never serve the stale pre-mutation cached result.
    expect(value.cacheStatus).not.toBe("HIT");

    if (value.generatedBy === "AI" && value.cacheStatus === "MISS") {
      expect(value.generatedAt).not.toBe(previousGeneratedAt);
      return last;
    }

    // Real providers can fail transiently. The product contract deliberately
    // returns a non-persisted fallback instead of caching or serving stale AI.
    expect(value.generatedBy).toBe("FALLBACK");
    expect(value.cacheStatus).toBe("BYPASS");

    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }

  throw new Error(scope + " History insight did not regenerate after source mutation.");
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

function sensitiveAiLanguage(text) {
  return /\b\d+\s*(mg|ml)\s*(ilaç|doz)|\b(reçete|tedavi dozu)\b/i.test(text);
}

test("real staging History acceptance", async ({ page, request }) => {
  test.setTimeout(240000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const userA = await createOnboardedUser(request, "stage4-history-a", true);
  const userB = await createOnboardedUser(request, "stage4-history-b");

  const empty = await historyDay(request, userA.token, "2026-09-01");
  expect(empty.response.status()).toBe(200);
  expect(empty.body.data.history.nutrition.status).toBe("NONE");
  expect(empty.body.data.history.water.totalMl).toEqual({ state: "NO_RECORD", value: null });
  expect(empty.body.data.history.activity.status).toBe("NONE");
  expect(empty.body.data.history.sleep.status).toBe("NONE");
  expect(empty.body.data.history.weight.measurement).toBeNull();

  const emptyInsight = await insight(request, userA.token, "DAY", "2026-09-01");
  expect(emptyInsight.response.status()).toBe(200);
  expect(emptyInsight.body.data.insight.generatedBy).toBe("FALLBACK");
  expect(emptyInsight.body.data.insight.cacheStatus).toBe("BYPASS");

  const bareMeal = await apiJson(request, "post", "/tracking/meals", {
    token: userA.token,
    data: { mealType: "BREAKFAST", loggedAt: "2026-09-02T09:00:00.000Z" },
  });
  expect(bareMeal.response.status()).toBe(201);
  const bareDay = await historyDay(request, userA.token, "2026-09-02");
  const breakfast = bareDay.body.data.history.nutrition.meals.find(
    (meal) => meal.mealType === "BREAKFAST",
  );
  expect(breakfast.occurrenceRecorded).toBe(true);
  expect(breakfast.items).toEqual([]);
  expect(breakfast.totals.calories.state).toBe("UNKNOWN");
  expect(bareDay.body.data.history.nutrition.status).toBe("PARTIAL");
  const bareInsight = await insight(request, userA.token, "DAY", "2026-09-02");
  expect(bareInsight.response.status()).toBe(200);
  expect(bareInsight.body.data.insight.content.text).not.toMatch(/0\s*kcal/i);

  const mealOnly = await apiJson(request, "post", "/tracking/meals", {
    token: userA.token,
    data: {
      mealType: "LUNCH",
      name: "Stage4 meal-only",
      calories: 410,
      proteinG: 24,
      carbsG: 48,
      fatG: 14,
      loggedAt: "2026-09-03T09:00:00.000Z",
    },
  });
  expect(mealOnly.response.status()).toBe(201);
  const mealOnlyDay = await historyDay(request, userA.token, "2026-09-03");
  expect(mealOnlyDay.body.data.history.nutrition.status).toBe("RECORDED");
  expect(mealOnlyDay.body.data.history.water.totalMl.state).toBe("NO_RECORD");
  expect(mealOnlyDay.body.data.history.activity.status).toBe("NONE");

  const waterOnly = await apiJson(request, "post", "/tracking/water", {
    token: userA.token,
    data: { amountMl: 650, loggedAt: "2026-09-04T09:00:00.000Z" },
  });
  expect(waterOnly.response.status()).toBe(201);
  const waterOnlyDay = await historyDay(request, userA.token, "2026-09-04");
  expect(waterOnlyDay.body.data.history.water.totalMl.value).toBe(650);
  expect(waterOnlyDay.body.data.history.nutrition.status).toBe("NONE");

  const privateMeal = "STAGE4_HISTORY_PRIVATE_MEAL_" + Date.now();
  const privateSleepNote = "STAGE4_HISTORY_PRIVATE_SLEEP_NOTE_" + Date.now();

  const completeMeal = await apiJson(request, "post", "/tracking/meals", {
    token: userA.token,
    data: {
      mealType: "BREAKFAST",
      name: privateMeal,
      calories: 520,
      proteinG: 32,
      carbsG: 55,
      fatG: 18,
      loggedAt: "2026-09-10T06:00:00.000Z",
    },
  });
  expect(completeMeal.response.status()).toBe(201);

  const completeWater = await apiJson(request, "post", "/tracking/water", {
    token: userA.token,
    data: { amountMl: 900, loggedAt: "2026-09-10T06:00:00.000Z" },
  });
  expect(completeWater.response.status()).toBe(201);

  const completeWeight = await apiJson(request, "post", "/tracking/weight", {
    token: userA.token,
    data: { weightKg: 69.4, loggedAt: "2026-09-10T07:00:00.000Z" },
  });
  expect(completeWeight.response.status()).toBe(201);
  const weightId = completeWeight.body.data.log.id;

  const completeActivity = await apiJson(request, "post", "/activity", {
    token: userA.token,
    data: {
      type: "WALKING",
      name: "Stage4 History Walk",
      durationMinutes: 35,
      distanceKm: 2.8,
      caloriesBurned: 145,
      note: "STAGE4_HISTORY_PRIVATE_ACTIVITY_NOTE",
      loggedAt: "2026-09-10T08:00:00.000Z",
    },
  });
  expect(completeActivity.response.status()).toBe(201);

  const sleep = await apiJson(request, "post", "/sleep", {
    token: userA.token,
    data: {
      sleepStart: "2026-09-09T20:40:00.000Z",
      wakeTime: "2026-09-10T04:20:00.000Z",
      quality: 4,
      note: privateSleepNote,
    },
  });
  expect(sleep.response.status()).toBe(201);

  const complete = await historyDay(request, userA.token, "2026-09-10");
  expect(complete.response.status()).toBe(200);
  const completeHistory = complete.body.data.history;
  expect(completeHistory.nutrition.totals.calories.value).toBe(520);
  expect(completeHistory.water.totalMl.value).toBe(900);
  expect(completeHistory.activity.totalActiveMinutes.value).toBe(35);
  expect(completeHistory.sleep.entries).toHaveLength(1);
  expect(completeHistory.sleep.entries[0].wakeTime).toBe("2026-09-10T04:20:00.000Z");
  expect(completeHistory.weight.measurement.weightKg).toBe(69.4);

  const timelineTypes = completeHistory.timeline.map((event) => event.type);
  expect(timelineTypes).toEqual(["SLEEP", "MEAL", "WATER", "WEIGHT", "ACTIVITY"]);

  const previousSleepDay = await historyDay(request, userA.token, "2026-09-09");
  expect(previousSleepDay.body.data.history.sleep.entries).toHaveLength(0);
  const noWeightDay = await historyDay(request, userA.token, "2026-09-11");
  expect(noWeightDay.body.data.history.weight.measurement).toBeNull();

  for (const timezone of ["Europe/Istanbul", "Europe/Berlin", "America/New_York"]) {
    const accepted = await historyDay(request, userA.token, "2026-09-10", timezone);
    expect(accepted.response.status()).toBe(200);
    expect(accepted.body.data.history.timezone).toBe(timezone);
  }
  const invalidZone = await historyDay(request, userA.token, "2026-09-10", "Mars/Olympus");
  expect(invalidZone.response.status()).toBe(400);
  const futureDate = await historyDay(request, userA.token, "2099-01-01", ZONE);
  expect(futureDate.response.status()).toBe(400);

  const previousZeroMeal = await apiJson(request, "post", "/tracking/meals", {
    token: userA.token,
    data: {
      mealType: "LUNCH",
      name: "Stage4 previous zero",
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      loggedAt: "2026-09-07T09:00:00.000Z",
    },
  });
  expect(previousZeroMeal.response.status()).toBe(201);

  const currentWeekMeal = await apiJson(request, "post", "/tracking/meals", {
    token: userA.token,
    data: {
      mealType: "LUNCH",
      name: "Stage4 current week",
      calories: 600,
      proteinG: 40,
      carbsG: 60,
      fatG: 20,
      loggedAt: "2026-09-14T09:00:00.000Z",
    },
  });
  expect(currentWeekMeal.response.status()).toBe(201);

  await apiJson(request, "post", "/tracking/water", {
    token: userA.token,
    data: { amountMl: 500, loggedAt: "2026-09-08T09:00:00.000Z" },
  });
  await apiJson(request, "post", "/tracking/water", {
    token: userA.token,
    data: { amountMl: 700, loggedAt: "2026-09-15T09:00:00.000Z" },
  });

  const weekly = await historyComparison(request, userA.token, "week", "2026-09-16");
  expect(weekly.response.status()).toBe(200);
  const weeklyComparison = weekly.body.data.comparison;
  expect(weeklyComparison.currentPeriod.days).toBe(3);
  expect(weeklyComparison.previousPeriod.days).toBe(3);
  expect(weeklyComparison.comparisonMode).toBe("EQUAL_ELAPSED_DAYS");
  expect(weeklyComparison.currentPeriod.localStartDate).toBe("2026-09-14");
  expect(weeklyComparison.previousPeriod.localStartDate).toBe("2026-09-07");
  expect(
    weeklyComparison.metrics.nutrition.averageCaloriesPerQuantifiedDay.previous.value,
  ).toBe(0);
  expect(
    weeklyComparison.metrics.nutrition.averageCaloriesPerQuantifiedDay.percentageChange,
  ).toBeNull();
  expect(weeklyComparison.completeness.current.nutrition.status).toBe("PARTIAL");
  expect(weeklyComparison.completeness.current.nutrition.recordedDays).toBe(1);
  expect(weeklyComparison.completeness.current.nutrition.expectedDays).toBe(3);
  expectNoNonFinite(weeklyComparison);

  const monthly = await historyComparison(request, userA.token, "month", "2026-09-19");
  expect(monthly.response.status()).toBe(200);
  const monthlyComparison = monthly.body.data.comparison;
  expect(monthlyComparison.currentPeriod.days).toBe(19);
  expect(monthlyComparison.previousPeriod.days).toBe(19);
  expect(monthlyComparison.comparisonMode).toBe("EQUAL_ELAPSED_DAYS");
  expectNoNonFinite(monthlyComparison);

  const marchEdge = await historyComparison(request, userA.token, "month", "2026-03-31");
  expect(marchEdge.response.status()).toBe(200);
  expect(marchEdge.body.data.comparison.currentPeriod.days).toBe(31);
  expect(marchEdge.body.data.comparison.previousPeriod.days).toBe(28);
  expectNoNonFinite(marchEdge.body.data.comparison);

  const dailyAi1 = await insight(request, userA.token, "DAY", "2026-09-10");
  expect(dailyAi1.response.status()).toBe(200);
  expect(dailyAi1.body.data.insight.generatedBy).toBe("AI");
  expect(dailyAi1.body.data.insight.cacheStatus).toBe("MISS");
  expect(dailyAi1.body.data.insight.provider).toBeTruthy();
  expect(dailyAi1.body.data.insight.model).toBeTruthy();
  expect(dailyAi1.body.data.insight.content.text).not.toContain(privateMeal);
  expect(sensitiveAiLanguage(dailyAi1.body.data.insight.content.text)).toBe(false);

  const dailyAi2 = await insight(request, userA.token, "DAY", "2026-09-10");
  expect(dailyAi2.response.status()).toBe(200);
  expect(dailyAi2.body.data.insight.cacheStatus).toBe("HIT");
  expect(dailyAi2.body.data.insight.generatedAt).toBe(dailyAi1.body.data.insight.generatedAt);
  expect(dailyAi2.body.data.insight.content.text).toBe(dailyAi1.body.data.insight.content.text);

  const weekAi1 = await insight(request, userA.token, "WEEK", "2026-09-16");
  expect(weekAi1.response.status()).toBe(200);
  expect(weekAi1.body.data.insight.generatedBy).toBe("AI");
  expect(weekAi1.body.data.insight.cacheStatus).toBe("MISS");
  expect(sensitiveAiLanguage(weekAi1.body.data.insight.content.text)).toBe(false);

  const monthAi1 = await insight(request, userA.token, "MONTH", "2026-09-19");
  expect(monthAi1.response.status()).toBe(200);
  expect(monthAi1.body.data.insight.generatedBy).toBe("AI");
  expect(monthAi1.body.data.insight.cacheStatus).toBe("MISS");
  expect(sensitiveAiLanguage(monthAi1.body.data.insight.content.text)).toBe(false);

  const dailyMutation = await apiJson(request, "post", "/tracking/water", {
    token: userA.token,
    data: { amountMl: 250, loggedAt: "2026-09-10T09:00:00.000Z" },
  });
  expect(dailyMutation.response.status()).toBe(201);
  await expectFreshAiAfterMutation(
    request,
    userA.token,
    "DAY",
    "2026-09-10",
    dailyAi1.body.data.insight.generatedAt,
  );

  const periodMutation = await apiJson(request, "post", "/activity", {
    token: userA.token,
    data: { type: "WALKING", durationMinutes: 20, loggedAt: "2026-09-15T10:00:00.000Z" },
  });
  expect(periodMutation.response.status()).toBe(201);
  await expectFreshAiAfterMutation(
    request,
    userA.token,
    "WEEK",
    "2026-09-16",
    weekAi1.body.data.insight.generatedAt,
  );
  await expectFreshAiAfterMutation(
    request,
    userA.token,
    "MONTH",
    "2026-09-19",
    monthAi1.body.data.insight.generatedAt,
  );

  const bDay = await historyDay(request, userB.token, "2026-09-10");
  expect(bDay.response.status()).toBe(200);
  expect(bDay.body.data.history.nutrition.status).toBe("NONE");
  expect(bDay.body.data.history.water.totalMl.state).toBe("NO_RECORD");
  expect(bDay.body.data.history.activity.status).toBe("NONE");
  expect(bDay.body.data.history.sleep.status).toBe("NONE");
  expect(bDay.body.data.history.weight.measurement).toBeNull();

  const bSpoof = await apiJson(
    request,
    "get",
    "/history/day?date=2026-09-10&timezone=" + encodeURIComponent(ZONE) + "&userId=" + userA.userId,
    { token: userB.token },
  );
  expect(bSpoof.response.status()).toBe(200);
  expect(bSpoof.body.data.history.nutrition.status).toBe("NONE");

  const crossWeight = await apiJson(request, "get", "/tracking/weight/" + weightId, {
    token: userB.token,
  });
  expect(crossWeight.response.status()).toBe(404);

  const bComparison = await historyComparison(request, userB.token, "week", "2026-09-16");
  expect(bComparison.response.status()).toBe(200);
  expect(bComparison.body.data.comparison.metrics.water.totalMl.current.state).toBe("NO_RECORD");

  const bInsight = await insight(request, userB.token, "DAY", "2026-09-10");
  expect(bInsight.response.status()).toBe(200);
  expect(bInsight.body.data.insight.generatedBy).toBe("FALLBACK");
  expect(bInsight.body.data.insight.cacheStatus).toBe("BYPASS");

  await loginBrowser(page, userA);

  // Keep the History browser session deterministic. Rapid consecutive hard
  // navigations rotate the HttpOnly refresh cookie on every page hydration and
  // can create a test-only refresh race. The separate Body & Weight runtime
  // acceptance already covers dashboard/progress/profile hard-navigation smoke.
  const progressResponse = await page.goto(WEB_BASE_URL + "/progress");
  expect(progressResponse && progressResponse.status()).toBeLessThan(500);
  await expect(page).toHaveURL(/\/progress$/);
  await expect(page.getByText("Kilo İlerlemen", { exact: true })).toBeVisible();

  const historyEntry = page.getByRole("link", { name: "Tüm geçmişimi gör" });
  console.log(
    "HISTORY_PROGRESS_ENTRY_PROBE",
    JSON.stringify({
      path: new URL(page.url()).pathname,
      linkCount: await historyEntry.count(),
    }),
  );
  await expect(historyEntry).toHaveAttribute("href", "/history");
  await page.getByRole("link", { name: "Tüm geçmişimi gör" }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByText("Geçmişim", { exact: true })).toBeVisible();

  const dateInput = page.locator('input[type="date"]');
  await dateInput.fill("2026-09-10");
  await expect(page.getByText(privateMeal, { exact: true })).toBeVisible();
  await expect(page.getByText("Zaman çizelgesi", { exact: true })).toBeVisible();

  const timelineSection = page.locator("section").filter({
    has: page.getByText("Zaman çizelgesi", { exact: true }),
  });
  const beforeReload = await timelineSection.locator("li").allTextContents();
  expect(beforeReload.join(" ")).toContain("Uyku");
  expect(beforeReload.join(" ")).toContain(privateMeal);
  expect(beforeReload.findIndex((value) => value.includes(privateMeal))).toBeLessThan(
    beforeReload.findIndex((value) => value.includes("Su")),
  );

  await page.reload();
  await expect(page.getByText("Geçmişim", { exact: true })).toBeVisible();
  // Selected date is intentionally component state rather than URL-persisted
  // state. Re-select the same day after a full document reload so this assertion
  // validates deterministic event ordering rather than date-state persistence.
  await page.locator('input[type="date"]').fill("2026-09-10");
  await expect(page.getByText(privateMeal, { exact: true })).toBeVisible();
  const afterReload = await page.locator("section").filter({
    has: page.getByText("Zaman çizelgesi", { exact: true }),
  }).locator("li").allTextContents();
  expect(afterReload).toEqual(beforeReload);

  await page.route("**/api/history/insight", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: { code: "STAGE4_AI_FAILURE", message: "Controlled Stage4 AI failure" },
      }),
    });
  });
  await dateInput.fill("2026-09-03");
  await expect(page.getByText("410 kcal", { exact: true })).toBeVisible();
  await expect(page.getByText(/Controlled Stage4 AI failure/)).toBeVisible();
  await expect(page.getByText("410 kcal", { exact: true })).toBeVisible();
  await page.unroute("**/api/history/insight");

  await page.getByRole("button", { name: "Haftalık" }).click();
  await dateInput.fill("2026-09-16");
  await expect(page.getByText("Dönem karşılaştırması", { exact: true })).toBeVisible();
  await expect(page.getByText(/karşılaştırma sınırlı olabilir/)).toBeVisible();

  await page.getByRole("button", { name: "Aylık" }).click();
  await dateInput.fill("2026-09-19");
  await expect(page.getByText("Dönem karşılaştırması", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Günlük" }).click();
  await dateInput.fill("2026-09-10");
  await expect(page.getByText(privateMeal, { exact: true })).toBeVisible();

  await page.evaluate(() => {
    window.__historyCanvasText = [];
    window.__historyShareMeta = null;
    const original = CanvasRenderingContext2D.prototype.fillText;
    if (!window.__historyOriginalFillText) window.__historyOriginalFillText = original;
    CanvasRenderingContext2D.prototype.fillText = function (value, ...args) {
      window.__historyCanvasText.push(String(value));
      return window.__historyOriginalFillText.call(this, value, ...args);
    };
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data) => {
        window.__historyShareMeta = {
          title: data.title || null,
          text: data.text || null,
          fileCount: data.files ? data.files.length : 0,
          fileType: data.files && data.files[0] ? data.files[0].type : null,
          fileName: data.files && data.files[0] ? data.files[0].name : null,
        };
      },
    });
  });

  await page.getByRole("button", { name: "Günü paylaş" }).click();
  const shareDialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await expect(shareDialog).toBeVisible();
  await expect(shareDialog.getByRole("checkbox", { name: /Kalori ve makrolar/ })).toBeChecked();
  await expect(shareDialog.getByRole("checkbox", { name: /^Su/ })).toBeChecked();
  await expect(shareDialog.getByRole("checkbox", { name: /Aktivite/ })).toBeChecked();
  await expect(shareDialog.getByRole("checkbox", { name: /Öğün isimleri/ })).not.toBeChecked();
  await expect(shareDialog.getByRole("checkbox", { name: /^Uyku/ })).not.toBeChecked();
  await expect(shareDialog.getByRole("checkbox", { name: /^Kilo/ })).not.toBeChecked();
  await expect(shareDialog.getByRole("checkbox", { name: /Diewish değerlendirmesi/ })).not.toBeChecked();
  await expect(shareDialog.getByText(privateMeal)).toHaveCount(0);

  expect(await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )).toBe(false);

  await shareDialog.getByRole("button", { name: "Paylaş", exact: true }).click();
  await expect(shareDialog).toHaveCount(0);
  const defaultShare = await page.evaluate(() => ({
    meta: window.__historyShareMeta,
    canvasText: window.__historyCanvasText.join("\n"),
  }));
  expect(defaultShare.meta.fileCount).toBe(1);
  expect(defaultShare.meta.fileType).toBe("image/png");
  expect(defaultShare.canvasText).not.toContain(privateMeal);
  expect(defaultShare.canvasText).not.toContain("69,4 kg");
  expect(defaultShare.canvasText).not.toContain("460 dk");
  expect(defaultShare.canvasText).not.toContain(userA.email);
  expect(defaultShare.canvasText).not.toContain(userA.fullName);
  expect(defaultShare.canvasText).not.toContain(privateSleepNote);

  await page.getByRole("button", { name: "Günü paylaş" }).click();
  const secondDialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await secondDialog.getByRole("checkbox", { name: /Öğün isimleri/ }).check();
  await secondDialog.getByRole("checkbox", { name: /^Uyku/ }).check();
  await secondDialog.getByRole("checkbox", { name: /^Kilo/ }).check();
  await secondDialog.getByRole("checkbox", { name: /Diewish değerlendirmesi/ }).check();
  await expect(secondDialog.getByText(privateMeal)).toBeVisible();
  await page.evaluate(() => { window.__historyCanvasText = []; });
  await secondDialog.getByRole("button", { name: "Paylaş", exact: true }).click();
  // The share handler intentionally continues asynchronously after the click
  // event returns. Wait for the successful Web Share result to close this
  // dialog before changing navigator.share for the fallback-path test.
  await expect(secondDialog).toHaveCount(0);
  const selectedCanvasText = await page.evaluate(() => window.__historyCanvasText.join("\n"));
  expect(selectedCanvasText).toContain(privateMeal);
  expect(selectedCanvasText).toContain("69,4 kg");
  expect(selectedCanvasText).toContain("460 dk");
  expect(selectedCanvasText).not.toContain(userA.email);
  expect(selectedCanvasText).not.toContain(userA.fullName);
  expect(selectedCanvasText).not.toContain(privateSleepNote);

  await page.evaluate(() => {
    window.__historyClipboardText = null;
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value) => { window.__historyClipboardText = value; },
      },
    });
  });
  await page.getByRole("button", { name: "Günü paylaş" }).click();
  const fallbackDialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await fallbackDialog.getByRole("button", { name: "Paylaş", exact: true }).click();
  await expect(page.getByText(/panoya kopyalandı/)).toBeVisible();
  const fallbackText = await page.evaluate(() => window.__historyClipboardText);
  expect(fallbackText).toContain("Diewish");
  expect(fallbackText).not.toContain(privateMeal);

  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await expect(page.getByText("Geçmişim", { exact: true })).toBeVisible();
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )).toBe(false);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  await page.reload();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByText("Geçmişim", { exact: true })).toBeVisible();

  expect(pageErrors).toEqual([]);
});
