const { test, expect } = require("@playwright/test");

const WEB = process.env.E2E_WEB_BASE_URL || "https://staging.diewish.com";
const API = process.env.E2E_API_BASE_URL || WEB + "/api";
const ZONE = "Europe/Istanbul";
const PASSWORD = "Stage4B2Pass123";

test.use({ viewport: { width: 390, height: 844 }, timezoneId: ZONE });

async function api(request, method, route, { token, data } = {}) {
  const options = {};
  if (token) options.headers = { authorization: "Bearer " + token };
  if (data !== undefined) options.data = data;
  const response = await request[method](API + route, options);
  const raw = response.status() === 204 ? "" : await response.text();
  return { response, body: raw ? JSON.parse(raw) : null };
}

async function createUser(request, prefix) {
  const runId = Date.now() + "." + Math.random().toString(16).slice(2);
  const email = prefix + "." + runId + "@example.com";
  const fullName = prefix === "stage4b2-a" ? "Stage4B2 Private User A" : "Stage4B2 Private User B";
  const reg = await api(request, "post", "/auth/register", {
    data: { email, password: PASSWORD, fullName },
  });
  expect(reg.response.status()).toBe(201);
  const token = reg.body.data.tokens.accessToken;
  const userId = reg.body.data.user.id;

  for (const type of ["TERMS_OF_SERVICE", "MEDICAL_DISCLAIMER", "KVKK_EXPLICIT_CONSENT"]) {
    expect((await api(request, "post", "/legal/consents", { token, data: { type } })).response.status()).toBe(200);
  }

  const onboarding = await api(request, "post", "/onboarding", {
    token,
    data: {
      fullName,
      dateOfBirth: "1990-05-20",
      gender: "PREFER_NOT_TO_SAY",
      heightCm: 175,
      currentWeightKg: 70,
      targetWeightKg: 65,
      activityLevel: "MODERATE",
      healthConditions: ["STAGE4B2_HEALTH_SECRET"],
      allergies: ["STAGE4B2_ALLERGY_SECRET"],
      dietaryPreference: "OMNIVORE",
      dailyWaterGoalMl: 2500,
      workScheduleType: "REGULAR",
      usualWakeTime: "07:00",
      usualSleepTime: "23:00",
    },
  });
  expect(onboarding.response.status()).toBe(200);
  return { email, fullName, token, userId };
}

async function addMeal(request, user, date, name, calories) {
  const result = await api(request, "post", "/tracking/meals", {
    token: user.token,
    data: {
      mealType: "LUNCH",
      name,
      calories,
      proteinG: 24,
      carbsG: 48,
      fatG: 14,
      loggedAt: date + "T09:00:00.000Z",
    },
  });
  expect(result.response.status()).toBe(201);
  return result.body?.data?.log?.id ?? null;
}

async function seed(request, user, privateMode) {
  await addMeal(request, user, "2026-08-15", "Previous Month", 380);
  await addMeal(request, user, "2026-09-07", "Previous Week", 420);

  const privateMeal = privateMode ? "STAGE4B2_PRIVATE_MEAL_" + Date.now() : "Stage4B2 Current";
  const longMeal = "STAGE4B2_LONG_" + "X".repeat(86);
  const mealId = await addMeal(request, user, "2026-09-15", privateMeal, 520);

  if (privateMode) {
    await addMeal(request, user, "2026-09-15", longMeal, 210);
    expect((await api(request, "post", "/tracking/meals", {
      token: user.token,
      data: { mealType: "SNACK", loggedAt: "2026-09-15T10:00:00.000Z" },
    })).response.status()).toBe(201);

    expect((await api(request, "post", "/tracking/water", {
      token: user.token,
      data: { amountMl: 700, loggedAt: "2026-09-15T11:00:00.000Z" },
    })).response.status()).toBe(201);

    expect((await api(request, "post", "/activity", {
      token: user.token,
      data: {
        type: "WALKING",
        name: "Stage4B2 Walk",
        durationMinutes: 35,
        distanceKm: 2.8,
        caloriesBurned: 145,
        note: "STAGE4B2_PRIVATE_ACTIVITY_NOTE",
        loggedAt: "2026-09-15T12:00:00.000Z",
      },
    })).response.status()).toBe(201);

    expect((await api(request, "post", "/tracking/weight", {
      token: user.token,
      data: { weightKg: 69.4, loggedAt: "2026-09-15T13:00:00.000Z" },
    })).response.status()).toBe(201);

    expect((await api(request, "post", "/sleep", {
      token: user.token,
      data: {
        sleepStart: "2026-09-14T20:40:00.000Z",
        wakeTime: "2026-09-15T04:20:00.000Z",
        quality: 4,
        note: "STAGE4B2_PRIVATE_SLEEP_NOTE",
      },
    })).response.status()).toBe(201);
  }
  return { privateMeal, longMeal, mealId };
}

async function insight(request, token, scope, date, extra = {}) {
  return api(request, "post", "/history/insight", {
    token,
    data: scope === "DAY"
      ? { scope, date, timezone: ZONE, ...extra }
      : { scope, referenceDate: date, timezone: ZONE, ...extra },
  });
}

async function realMiss(request, token, scope, date) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await insight(request, token, scope, date);
    expect(result.response.status()).toBe(200);
    const value = result.body.data.insight;
    if (value.generatedBy === "AI" && value.cacheStatus === "MISS") return value;
    expect(value.generatedBy).toBe("FALLBACK");
    expect(value.cacheStatus).toBe("BYPASS");
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
  }
  throw new Error(scope + " real AI provider did not return MISS");
}

function safeAi(text) {
  expect(text).not.toMatch(/\b(tanı|teşhis|tedavi|reçete|ilaç dozu|dozaj)\b/i);
  expect(text).not.toMatch(/\b(iradesiz|tembel|başarısızsın|suçlusun|utan)\b/i);
}

async function login(page, user) {
  await page.goto(WEB + "/login");
  await page.getByLabel("E-posta").fill(user.email);
  await page.getByLabel("Şifre", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });
}

test("Stage4B-2 real AI cache isolation share and web acceptance", async ({ page, request }) => {
  test.setTimeout(300000);

  const userA = await createUser(request, "stage4b2-a");
  const userB = await createUser(request, "stage4b2-b");
  const privateData = await seed(request, userA, true);
  await seed(request, userB, false);

  // Grounding probe: bare meal occurrence has no numeric nutrition values.
  expect((await api(request, "post", "/tracking/meals", {
    token: userA.token,
    data: { mealType: "BREAKFAST", loggedAt: "2026-09-12T08:00:00.000Z" },
  })).response.status()).toBe(201);

  const bare = await realMiss(request, userA.token, "DAY", "2026-09-12");
  expect(bare.provider).toBeTruthy();
  expect(bare.model).toBeTruthy();
  safeAi(bare.content.text);
  expect(bare.content.text).not.toMatch(/\b0\s*kcal\b/i);
  expect(bare.content.text).not.toMatch(/\b\d+(?:[,.]\d+)?\s*(?:kcal|ml|kg|g|dk|dakika|saat)\b/i);

  const day1 = await realMiss(request, userA.token, "DAY", "2026-09-15");
  const week1 = await realMiss(request, userA.token, "WEEK", "2026-09-16");
  const month1 = await realMiss(request, userA.token, "MONTH", "2026-09-19");

  for (const value of [day1, week1, month1]) {
    expect(value.provider).toBeTruthy();
    expect(value.model).toBeTruthy();
    safeAi(value.content.text);
    for (const sentinel of [
      privateData.privateMeal,
      "STAGE4B2_PRIVATE_ACTIVITY_NOTE",
      "STAGE4B2_PRIVATE_SLEEP_NOTE",
      "STAGE4B2_HEALTH_SECRET",
      "STAGE4B2_ALLERGY_SECRET",
    ]) {
      expect(value.content.text).not.toContain(sentinel);
    }
  }

  const weekCmp = await api(request, "get",
    "/history/comparison?" + new URLSearchParams({ period: "week", referenceDate: "2026-09-16", timezone: ZONE }),
    { token: userA.token });
  const monthCmp = await api(request, "get",
    "/history/comparison?" + new URLSearchParams({ period: "month", referenceDate: "2026-09-19", timezone: ZONE }),
    { token: userA.token });

  expect(weekCmp.body.data.comparison.completeness.current.nutrition.coverageRatio).toBeLessThan(1);
  expect(monthCmp.body.data.comparison.completeness.current.nutrition.coverageRatio).toBeLessThan(1);
  expect(week1.content.text).toMatch(/(kayıt|veri|aynı dönem|sınırl|şimdiye)/i);
  expect(month1.content.text).toMatch(/(kayıt|veri|dönem|şimdiye|mevcut)/i);
  expect(week1.content.text).not.toMatch(/(haftanın tamamı|tüm hafta boyunca)/i);
  expect(month1.content.text).not.toMatch(/(ayın tamamı|tüm ay boyunca)/i);

  // Same identity/context: MISS -> HIT with same content/generatedAt.
  for (const [scope, date, original] of [
    ["DAY", "2026-09-15", day1],
    ["WEEK", "2026-09-16", week1],
    ["MONTH", "2026-09-19", month1],
  ]) {
    const hit = await insight(request, userA.token, scope, date);
    expect(hit.response.status()).toBe(200);
    expect(hit.body.data.insight.cacheStatus).toBe("HIT");
    expect(hit.body.data.insight.generatedAt).toBe(original.generatedAt);
    expect(hit.body.data.insight.content.text).toBe(original.content.text);
  }

  // Real source mutation. Existing cache identity remains same; post-mutation MISS
  // proves the server-computed contextHash no longer matches the cached contextHash.
  expect((await api(request, "post", "/tracking/water", {
    token: userA.token,
    data: { amountMl: 250, loggedAt: "2026-09-15T14:00:00.000Z" },
  })).response.status()).toBe(201);

  const day2 = await realMiss(request, userA.token, "DAY", "2026-09-15");
  const week2 = await realMiss(request, userA.token, "WEEK", "2026-09-16");
  const month2 = await realMiss(request, userA.token, "MONTH", "2026-09-19");
  expect(day2.generatedAt).not.toBe(day1.generatedAt);
  expect(week2.generatedAt).not.toBe(week1.generatedAt);
  expect(month2.generatedAt).not.toBe(month1.generatedAt);

  console.log("STAGE4B2_AI_CACHE_PROBE", JSON.stringify({
    provider: day2.provider,
    model: day2.model,
    dayCache: "MISS->HIT->MISS",
    weekCache: "MISS->HIT->MISS",
    monthCache: "MISS->HIT->MISS",
    contextHashInvalidatedByContract: true,
  }));

  // Authenticated user isolation: B's first calls are MISS, not A-cache HIT.
  const bDay = await realMiss(request, userB.token, "DAY", "2026-09-15");
  const bWeek = await realMiss(request, userB.token, "WEEK", "2026-09-16");
  const bMonth = await realMiss(request, userB.token, "MONTH", "2026-09-19");
  expect(bDay.cacheStatus).toBe("MISS");
  expect(bWeek.cacheStatus).toBe("MISS");
  expect(bMonth.cacheStatus).toBe("MISS");

  const spoof = await insight(request, userB.token, "DAY", "2026-09-15", { userId: userA.userId });
  expect(spoof.response.status()).toBe(200);
  expect(spoof.body.data.insight.cacheStatus).toBe("HIT");
  expect(spoof.body.data.insight.generatedAt).toBe(bDay.generatedAt);

  await login(page, userA);
  await page.goto(WEB + "/history");
  const dateInput = page.locator('input[type="date"]');
  await dateInput.fill("2026-09-15");
  await expect(page.getByText(privateData.privateMeal, { exact: true })).toBeVisible();
  await expect(page.getByText("Diewish değerlendirmesi", { exact: true })).toBeVisible();

  expect(await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )).toBe(false);

  await page.evaluate(() => {
    window.__stage4Canvas = [];
    window.__stage4Share = null;
    const original = CanvasRenderingContext2D.prototype.fillText;
    if (!window.__stage4Original) window.__stage4Original = original;
    CanvasRenderingContext2D.prototype.fillText = function (value, ...args) {
      window.__stage4Canvas.push(String(value));
      return window.__stage4Original.call(this, value, ...args);
    };
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data) => {
        window.__stage4Share = {
          fileCount: data.files ? data.files.length : 0,
          fileType: data.files && data.files[0] ? data.files[0].type : null,
        };
      },
    });
  });

  await page.getByRole("button", { name: "Günü paylaş" }).click();
  let dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await expect(dialog).toBeVisible();

  for (const name of [/Kalori ve makrolar/, /^Su/, /Aktivite/]) {
    await expect(dialog.getByRole("checkbox", { name })).toBeChecked();
  }
  for (const name of [/Öğün isimleri/, /^Uyku/, /^Kilo/, /Diewish değerlendirmesi/]) {
    await expect(dialog.getByRole("checkbox", { name })).not.toBeChecked();
  }
  await expect(dialog.getByText(privateData.privateMeal)).toHaveCount(0);

  await dialog.getByRole("checkbox", { name: /Öğün isimleri/ }).check();
  const mealNamesLine = dialog.getByText(/Öğünler:/);
  await expect(mealNamesLine).toContainText(privateData.privateMeal);
  await expect(mealNamesLine).toContainText(privateData.longMeal);
  expect(await mealNamesLine.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await dialog.getByRole("checkbox", { name: /Öğün isimleri/ }).uncheck();
  await expect(dialog.getByText(privateData.privateMeal)).toHaveCount(0);

  await page.evaluate(() => { window.__stage4Canvas = []; });
  await dialog.getByRole("button", { name: "Paylaş", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const defaultExport = await page.evaluate(() => ({
    canvas: window.__stage4Canvas.join("\n"),
    share: window.__stage4Share,
  }));
  expect(defaultExport.share.fileCount).toBe(1);
  expect(defaultExport.share.fileType).toBe("image/png");
  for (const forbidden of [
    privateData.privateMeal,
    "69,4 kg",
    "460 dk",
    "Diewish değerlendirmesi",
  ]) {
    expect(defaultExport.canvas).not.toContain(forbidden);
  }

  await page.getByRole("button", { name: "Günü paylaş" }).click();
  dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  for (const name of [/Öğün isimleri/, /^Uyku/, /^Kilo/, /Diewish değerlendirmesi/]) {
    await dialog.getByRole("checkbox", { name }).check();
  }
  await expect(dialog.getByText(/Öğünler:/)).toContainText(privateData.privateMeal);
  await page.evaluate(() => { window.__stage4Canvas = []; });
  await dialog.getByRole("button", { name: "Paylaş", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const selectedCanvas = await page.evaluate(() => window.__stage4Canvas.join("\n"));
  expect(selectedCanvas).toContain(privateData.privateMeal);
  expect(selectedCanvas).toContain("69,4 kg");
  expect(selectedCanvas).toContain("460 dk");
  expect(selectedCanvas).toContain(privateData.privateMeal);

  for (const forbidden of [
    userA.email,
    userA.fullName,
    userA.userId,
    "1990",
    "STAGE4B2_HEALTH_SECRET",
    "STAGE4B2_ALLERGY_SECRET",
    "STAGE4B2_PRIVATE_ACTIVITY_NOTE",
    "STAGE4B2_PRIVATE_SLEEP_NOTE",
    privateData.mealId,
  ].filter(Boolean)) {
    expect(selectedCanvas).not.toContain(forbidden);
  }

  // Browser fallback path.
  await page.evaluate(() => {
    window.__stage4Clipboard = null;
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value) => { window.__stage4Clipboard = value; } },
    });
  });
  await page.getByRole("button", { name: "Günü paylaş" }).click();
  dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await dialog.getByRole("button", { name: "Paylaş", exact: true }).click();
  await expect(page.getByText(/panoya kopyalandı/)).toBeVisible();
  const clipboard = await page.evaluate(() => window.__stage4Clipboard);
  expect(clipboard).not.toContain(privateData.privateMeal);
  expect(clipboard).not.toContain(userA.email);

  // Safe UI-only provider failure injection; data stays visible.
  await page.route("**/api/history/insight", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: { code: "STAGE4B2_AI_FAILURE", message: "Controlled Stage4B2 AI failure" },
      }),
    });
  });
  await page.reload();
  await page.locator('input[type="date"]').fill("2026-09-15");
  await expect(page.getByText(privateData.privateMeal, { exact: true })).toBeVisible();
  await expect(page.getByText(/Controlled Stage4B2 AI failure/)).toBeVisible();
  await page.unroute("**/api/history/insight");

  // Light/dark/mobile 390x844.
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )).toBe(false);

  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await expect(page.getByText("Geçmişim", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Günü paylaş" }).click();
  dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )).toBe(false);
  const box = await dialog.locator("div").nth(0).boundingBox();
  expect(box).not.toBeNull();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  await dialog.getByRole("button", { name: "Kapat" }).click();
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  console.log("STAGE4B2_WEB_PROBE", JSON.stringify({
    shareDefaults: "PASS",
    explicitToggles: "PASS",
    png: "image/png",
    webShare: "PASS",
    fallbackClipboard: "PASS",
    lightDarkMobile: "PASS",
    sensitiveCanvasExclusion: "PASS",
  }));
});