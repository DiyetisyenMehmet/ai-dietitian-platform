const { test, expect } = require("@playwright/test");

const WEB = process.env.E2E_WEB_BASE_URL || "https://staging.diewish.com";
const API = process.env.E2E_API_BASE_URL || WEB + "/api";
const PASSWORD = "HistoryShareTextRuntime123";
const ZONE = "Europe/Istanbul";

test.use({ viewport: { width: 390, height: 844 }, timezoneId: ZONE });

async function api(request, method, path, { token, data } = {}) {
  const options = {};
  if (token) options.headers = { authorization: "Bearer " + token };
  if (data !== undefined) options.data = data;
  const response = await request[method](API + path, options);
  const raw = response.status() === 204 ? "" : await response.text();
  return { response, body: raw ? JSON.parse(raw) : null };
}

async function createUser(request) {
  const nonce = String(Date.now()) + "." + Math.random().toString(16).slice(2);
  const email = "history-share-text." + nonce + "@example.com";
  const fullName = "History Share Text Runtime";
  const registration = await api(request, "post", "/auth/register", {
    data: { email, password: PASSWORD, fullName },
  });
  expect(registration.response.status()).toBe(201);
  const token = registration.body.data.tokens.accessToken;

  for (const type of ["TERMS_OF_SERVICE", "MEDICAL_DISCLAIMER", "KVKK_EXPLICIT_CONSENT"]) {
    const consent = await api(request, "post", "/legal/consents", {
      token,
      data: { type },
    });
    expect(consent.response.status()).toBe(200);
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
  return { email, token };
}

async function login(page, email) {
  await page.goto(WEB + "/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 });
}

const ONLY_WATER_TEXT = [
  "17 Eylül 2026 • Diewish Gün Özetim 🌿",
  "",
  "💧 Su Tüketimi",
  "Kaydedilen su: 500 ml",
  "",
  "📊 Günün Genel Durumu",
  "Bugün kaydettiğim verilere göre takip edilen başlıca alan su tüketimim oldu.",
  "",
  "Diewish ile ilerlememi takip ediyorum. 🌿",
].join("\n");

test("professional History share text is canonical across image, text, copy and native adapters", async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const user = await createUser(request);

  const water = await api(request, "post", "/tracking/water", {
    token: user.token,
    data: { amountMl: 500, loggedAt: "2026-09-17T09:00:00.000Z" },
  });
  expect(water.response.status()).toBe(201);

  // A second day contains private optional fields. Defaults must keep them out of text.
  const meal = await api(request, "post", "/tracking/meals", {
    token: user.token,
    data: {
      mealType: "LUNCH",
      name: "STAGING_PRIVATE_MEAL",
      calories: 610,
      proteinG: 31,
      carbsG: 72,
      fatG: 21,
      loggedAt: "2026-09-18T09:00:00.000Z",
    },
  });
  expect(meal.response.status()).toBe(201);
  const weight = await api(request, "post", "/tracking/weight", {
    token: user.token,
    data: { weightKg: 69.4, loggedAt: "2026-09-18T10:00:00.000Z" },
  });
  expect(weight.response.status()).toBe(201);
  const sleep = await api(request, "post", "/sleep", {
    token: user.token,
    data: {
      sleepStart: "2026-09-17T20:30:00.000Z",
      wakeTime: "2026-09-18T04:00:00.000Z",
      quality: 4,
      note: "STAGING_PRIVATE_SLEEP_NOTE",
    },
  });
  expect(sleep.response.status()).toBe(201);

  await login(page, user.email);
  await page.route("**/api/history/insight", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: { code: "SHARE_TEXT_AI_DISABLED", message: "AI excluded from share formatter smoke" },
      }),
    });
  });

  await page.goto(WEB + "/history");
  const dateInput = page.locator('input[type="date"]');
  await dateInput.fill("2026-09-17");
  await expect(page.getByText("500 ml", { exact: true }).first()).toBeVisible();

  await page.evaluate(() => {
    window.__shareTextData = null;
    window.__copiedHistoryText = null;
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data) => {
        window.__shareTextData = {
          text: data.text || "",
          fileCount: data.files ? data.files.length : 0,
          fileType: data.files && data.files[0] ? data.files[0].type : null,
        };
      },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__copiedHistoryText = text;
        },
      },
    });
  });

  // Text preview is the canonical formatter output.
  await page.getByRole("button", { name: "Günü paylaş" }).click();
  let dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await dialog.getByRole("button", { name: "Yazı olarak paylaş" }).click();
  const textPreview = await dialog.locator("pre").innerText();
  expect(textPreview).toBe(ONLY_WATER_TEXT);

  // Explicit copy must use byte-for-byte the same canonical text.
  await dialog.getByRole("button", { name: "Kopyala" }).click();
  expect(await page.evaluate(() => window.__copiedHistoryText)).toBe(textPreview);

  // Text share must use the same canonical text, without a PNG.
  await dialog.getByRole("button", { name: "Yazıyı Paylaş" }).click();
  await expect(dialog).toHaveCount(0);
  const textShare = await page.evaluate(() => window.__shareTextData);
  expect(textShare.text).toBe(textPreview);
  expect(textShare.fileCount).toBe(0);

  // Image share must carry the same canonical text next to a PNG.
  await page.evaluate(() => { window.__shareTextData = null; });
  await page.getByRole("button", { name: "Günü paylaş" }).click();
  dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await dialog.getByRole("button", { name: "Önizlemeyi Aç" }).click();
  const visual = page.getByRole("dialog", { name: "Görsel paylaşım önizlemesi" });
  await visual.getByRole("button", { name: "Paylaş", exact: true }).click();
  await expect(visual).toHaveCount(0);
  const imageShare = await page.evaluate(() => window.__shareTextData);
  expect(imageShare.text).toBe(textPreview);
  expect(imageShare.fileCount).toBe(1);
  expect(imageShare.fileType).toBe("image/png");

  // Native bridge adapter receives the exact same business text. No native dependency/change required.
  await page.evaluate(() => {
    window.__nativeHistoryShare = null;
    window.DiewishShare = {
      isAvailable: () => true,
      sharePng: (base64Png, filename, text) => {
        window.__nativeHistoryShare = { base64Length: base64Png.length, filename, text };
      },
      shareText: () => {},
    };
  });
  await page.getByRole("button", { name: "Günü paylaş" }).click();
  dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await dialog.getByRole("button", { name: "Önizlemeyi Aç" }).click();
  const nativeVisual = page.getByRole("dialog", { name: "Görsel paylaşım önizlemesi" });
  await nativeVisual.getByRole("button", { name: "Paylaş", exact: true }).click();
  const nativeShare = await page.evaluate(() => window.__nativeHistoryShare);
  expect(nativeShare.base64Length).toBeGreaterThan(100);
  expect(nativeShare.filename).toMatch(/\.png$/);
  expect(nativeShare.text).toBe(textPreview);

  // Default privacy on a day that has optional sensitive fields.
  await page.evaluate(() => { delete window.DiewishShare; });
  await dateInput.fill("2026-09-18");
  await expect(page.getByText("610 kcal", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Günü paylaş" }).click();
  dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });

  for (const name of [/Kalori ve makrolar/, /^Su/, /Aktivite/]) {
    await expect(dialog.getByRole("checkbox", { name })).toBeChecked();
  }
  for (const name of [/Öğün isimleri/, /^Uyku/, /^Kilo/, /^Değerlendirme$/]) {
    await expect(dialog.getByRole("checkbox", { name })).not.toBeChecked();
  }

  await dialog.getByRole("button", { name: "Yazı olarak paylaş" }).click();
  const privateDefaultText = await dialog.locator("pre").innerText();
  expect(privateDefaultText).toContain("Toplam enerji: 610 kcal");
  expect(privateDefaultText).not.toContain("STAGING_PRIVATE_MEAL");
  expect(privateDefaultText).not.toContain("7 sa 30 dk");
  expect(privateDefaultText).not.toContain("69,4 kg");
  expect(privateDefaultText).not.toContain("STAGING_PRIVATE_SLEEP_NOTE");
  expect(privateDefaultText).not.toContain("Diewish Değerlendirmesi");

  console.log("HISTORY_SHARE_TEXT_RUNTIME", JSON.stringify({
    applicationSha: process.env.APPLICATION_SHA || null,
    canonicalChannels: ["image", "text", "copy", "native-adapter"],
    onlyWaterExact: true,
    defaultPrivacy: true,
  }));
});
