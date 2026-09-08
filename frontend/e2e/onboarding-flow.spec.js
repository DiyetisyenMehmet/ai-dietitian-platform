const { test, expect } = require("@playwright/test");

const WEB_BASE_URL = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const API_BASE_URL = process.env.E2E_API_BASE_URL || "http://127.0.0.1:4000/api";

function success(data) {
  return { success: true, data };
}

const nutrients100 = {
  energyKcal: 520,
  proteinG: 20,
  carbohydratesG: 55,
  fatG: 25,
  saturatedFatG: 8,
  sugarsG: 30,
  fiberG: 6,
  sodiumMg: 300,
  saltG: 0.75,
};

const nutrients25 = {
  energyKcal: 130,
  proteinG: 5,
  carbohydratesG: 13.75,
  fatG: 6.25,
  saturatedFatG: 2,
  sugarsG: 7.5,
  fiberG: 1.5,
  sodiumMg: 75,
  saltG: 0.19,
};

test("register -> consent -> onboarding -> scanner -> same-day weigh-in preserves baseline", async ({
  page,
  request,
}) => {
  const email = `browser.e2e.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;
  const password = "BrowserE2EPass123";

  await page.goto(`${WEB_BASE_URL}/register`);
  await expect(page.getByRole("heading", { name: "Hesap oluşturun" })).toBeVisible();

  await page.getByLabel("Ad Soyad").fill("Browser E2E User");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.getByLabel("Şifre (Tekrar)").fill(password);
  await page.getByRole("button", { name: "Hesap Oluştur" }).click();

  await expect(page).toHaveURL(/\/consent$/);
  const consentCheckboxes = page.getByRole("checkbox");
  await expect(consentCheckboxes).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    await consentCheckboxes.nth(index).click();
  }
  await page.getByRole("button", { name: "Onayla ve Devam Et" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Ad Soyad").fill("Browser E2E User");
  await page.getByLabel("Doğum Tarihi").fill("1990-05-20");
  await page.getByRole("radio", { name: "Belirtmek istemiyorum" }).click();
  await page.getByRole("button", { name: /Devam/ }).click();
  await page.getByLabel("Boy (cm)").fill("175");
  await page.getByLabel("Mevcut Kilo (kg)").fill("70");
  await page.getByLabel("Hedef Kilo (kg)").fill("65");
  await page.getByRole("button", { name: /Devam/ }).click();
  await page.getByRole("radio", { name: /Orta Aktif/ }).click();
  await page.getByRole("button", { name: /Devam/ }).click();
  await page.getByRole("button", { name: "Hastalığım yok" }).click();
  await page.getByRole("button", { name: "Alerjim yok" }).click();
  await page.getByRole("button", { name: /Devam/ }).click();
  await page.getByRole("radio", { name: /Her şey/ }).click();
  await page.getByLabel("Günlük Su Hedefi (ml)").fill("2500");
  await page.getByRole("button", { name: /Devam/ }).click();
  await page.getByRole("radio", { name: /Gece vardiyası/ }).click();
  await page.getByLabel("Genellikle kaçta uyanırsınız?").fill("17:00");
  await page.getByLabel("Genellikle kaçta uyursunuz?").fill("09:00");
  await page.getByRole("button", { name: "Tamamla" }).click();

  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  expect(await page.evaluate(() => window.localStorage.getItem("diewish.auth.session"))).toBeNull();
  const cookies = await page.context().cookies(`${API_BASE_URL}/auth`);
  const refreshCookie = cookies.find((cookie) => cookie.name === "diewish_refresh");
  expect(refreshCookie).toBeTruthy();
  expect(refreshCookie.httpOnly).toBe(true);
  expect(refreshCookie.path).toBe("/api/auth");
  expect(refreshCookie.sameSite).toBe("Lax");

  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  expect(await page.evaluate(() => window.localStorage.getItem("diewish.auth.session"))).toBeNull();

  const loginResponse = await request.post(`${API_BASE_URL}/auth/login`, {
    data: { email, password },
  });
  expect(loginResponse.status()).toBe(200);
  const loginBody = await loginResponse.json();
  expect(loginBody.data.tokens.refreshToken).toBeUndefined();
  const authHeaders = { authorization: `Bearer ${loginBody.data.tokens.accessToken}` };

  const profileResponse = await request.get(`${API_BASE_URL}/onboarding`, { headers: authHeaders });
  const profileBody = await profileResponse.json();
  expect(profileBody.data.profile.workScheduleType).toBe("NIGHT_SHIFT");
  expect(profileBody.data.profile.currentWeightKg).toBe(70);

  const provenance = {
    provider: "OPEN_FOOD_FACTS",
    externalId: "4006381333931",
    retrievedAt: "2026-09-08T12:00:00.000Z",
    lastValidatedAt: "2026-09-08T12:00:00.000Z",
    dataBasis: "PER_100_G",
    confidence: 0.75,
    stale: false,
    providerUpdatedAt: "2026-09-07T10:00:00.000Z",
  };
  const food = {
    externalId: "4006381333931",
    provider: "OPEN_FOOD_FACTS",
    name: "Test Protein Bar",
    displayNameTr: "Test Protein Bar",
    brand: "Diewish Test",
    barcode: "4006381333931",
    imageUrl: null,
    quantity: "50 g",
    serving: { amount: 25, unit: "g", gramWeight: 25, description: "1 bar / 25 g" },
    nutrientsPer100g: nutrients100,
    ingredients: ["yulaf", "kakao"],
    allergens: ["milk"],
    additives: ["e322"],
    labels: ["vegetarian"],
    vegan: false,
    vegetarian: true,
    glutenFree: null,
    nutriScore: "c",
    novaGroup: 4,
    provenance,
  };

  await page.route("**/api/nutrition/barcode/4006381333931", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(success({
        found: true,
        food,
        scan: {
          scanType: "BARCODE",
          identity: { name: food.displayNameTr, brand: food.brand, barcode: food.barcode, imageUrl: null },
          serving: { description: "1 bar / 25 g", grams: 25, confidence: 1 },
          nutrients: { per100g: nutrients100, perServing: nutrients25, estimated: false },
          ingredients: [],
          provenance: { nutrition: [provenance], recognition: "BARCODE_EXACT" },
          product: {
            quantity: "50 g",
            allergens: food.allergens,
            additives: food.additives,
            labels: food.labels,
            vegan: false,
            vegetarian: true,
            glutenFree: null,
            nutriScore: "c",
            novaGroup: 4,
          },
          disclaimer: null,
        },
      })),
    });
  });
  await page.route("**/api/nutrition/personalize", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(success({
        personalization: {
          grams: 25,
          nutrients: nutrients25,
          metrics: {
            contribution: { caloriesPercent: 6.5, proteinPercent: 5, carbohydratesPercent: 7, fatPercent: 9 },
            remainingAfter: { calories: 1870, proteinG: 95, carbohydratesG: 186, fatG: 64 },
            portionFit: "LOW",
            satiety: "LOW",
            lines: ["Bu porsiyon günlük kalori hedefinin yaklaşık %6.5 kadarına denk geliyor."],
          },
          profileContextUsed: true,
          activePlanUsed: true,
          dietaryCompatibility: "COMPATIBLE",
          allergenDataComplete: true,
          warnings: [],
          attentionFlags: [
            { code: "HIGH_SUGARS", severity: "WATCH", basis: "PER_100_G", message: "100 g için şeker miktarı yüksek." },
          ],
          windowHours: 24,
        },
      })),
    });
  });

  await page.goto(`${WEB_BASE_URL}/meals/scan`);
  await page.getByRole("tab", { name: "Barkod Tara" }).click();
  await page.getByPlaceholder("EAN / UPC barkod numarası").fill("4006381333931");
  await page.getByRole("button", { name: /Sorgula/ }).click();
  await expect(page.getByText("Test Protein Bar", { exact: true })).toBeVisible();
  await expect(page.getByText("100 g / 100 ml bazında")).toBeVisible();
  await expect(page.getByText("25 g porsiyon")).toBeVisible();
  await expect(page.getByText("100 g için şeker miktarı yüksek.")).toBeVisible();
  await expect(page.getByText("Open Food Facts", { exact: false }).first()).toBeVisible();
  const coachLink = page.getByRole("link", { name: /AI Koç/ });
  await expect(coachLink).toHaveAttribute("href", /prompt=/);

  await page.route("**/api/food-scan/analyze", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(success({
        analysis: {
          isFood: true,
          confidence: 90,
          reason: "Yemek görseli",
          dishName: "Kuru fasulye",
          estimatedPortion: "1 tabak",
          estimatedGrams: 220,
          ingredients: [
            {
              name: "fasulye",
              estimatedGrams: 200,
              confidence: 95,
              optional: false,
              included: true,
              matchedFood: { externalId: "usda-bean", provider: "USDA", displayNameTr: "Kuru fasulye", confidence: 0.95 },
              nutrients: { ...nutrients25, energyKcal: 240 },
            },
            {
              name: "yağ",
              estimatedGrams: 20,
              confidence: 45,
              optional: true,
              included: true,
              matchedFood: { externalId: "usda-oil", provider: "USDA", displayNameTr: "Yağ", confidence: 0.95 },
              nutrients: { ...nutrients25, energyKcal: 180 },
            },
          ],
          totals: { ...nutrients25, energyKcal: 420, sodiumMg: 650 },
          disclaimer: "Bu değerler tahminidir. Tarif ve yağ miktarına göre değişebilir.",
        },
        scan: { scanType: "PHOTO" },
      })),
    });
  });
  await page.route("**/api/nutrition/personalize-nutrients", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(success({
        personalization: {
          nutrients: { ...nutrients25, energyKcal: 420, sodiumMg: 650 },
          metrics: null,
          profileContextUsed: true,
          activePlanUsed: false,
          dietaryCompatibility: "UNKNOWN",
          allergenDataComplete: false,
          warnings: [],
          attentionFlags: [
            { code: "PORTION_HIGH_SODIUM", severity: "WATCH", basis: "PORTION", message: "Bu porsiyonda sodyum miktarı dikkat gerektirecek düzeyde." },
          ],
          windowHours: 24,
        },
      })),
    });
  });
  await page.route("**/api/food-scan/recalculate", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.targetGrams).toBe(250);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(success({
        analysis: {
          estimatedGrams: 250,
          ingredients: [
            {
              name: "fasulye",
              estimatedGrams: 227.3,
              confidence: 100,
              optional: false,
              included: true,
              matchedFood: { externalId: "usda-bean", provider: "USDA", displayNameTr: "Kuru fasulye", confidence: 0.95 },
              nutrients: { ...nutrients25, energyKcal: 273 },
            },
            {
              name: "yağ",
              estimatedGrams: 22.7,
              confidence: 100,
              optional: false,
              included: true,
              matchedFood: { externalId: "usda-oil", provider: "USDA", displayNameTr: "Yağ", confidence: 0.95 },
              nutrients: { ...nutrients25, energyKcal: 204 },
            },
          ],
          totals: { ...nutrients25, energyKcal: 477, sodiumMg: 650 },
        },
      })),
    });
  });

  await page.getByRole("tab", { name: "Fotoğrafla Tara" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "meal.png",
    mimeType: "image/png",
    buffer: Buffer.from("89504e470d0a1a0a", "hex"),
  });
  await page.getByRole("button", { name: /Görseli analiz et/ }).click();
  await expect(page.getByText("Kuru fasulye", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Malzemeleri Düzenle/ }).click();
  await page.getByLabel("Toplam porsiyon").fill("250");
  await page.getByRole("button", { name: /Yeniden hesapla/ }).click();
  await expect(page.getByText(/250 g tahmini\/düzeltilmiş porsiyon/)).toBeVisible();
  await expect(page.getByText("Bu porsiyonda sodyum miktarı dikkat gerektirecek düzeyde.")).toBeVisible();

  await page.goto(`${WEB_BASE_URL}/progress`);
  await expect(page.getByText("Kilo İlerlemen")).toBeVisible();
  await page.getByLabel("Bugünkü kilon (kg)").fill("68.5");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByText("68.5", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("70.0", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("65.0", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Hedefe 3,5 kg kaldı", { exact: true })).toBeVisible();

  const weightResponse = await request.get(`${API_BASE_URL}/tracking/weight`, { headers: authHeaders });
  const weightBody = await weightResponse.json();
  expect(weightBody.data.logs).toHaveLength(2);
  expect(weightBody.data.logs.find((log) => log.note === "Başlangıç").weightKg).toBe(70);
  expect(weightBody.data.logs.find((log) => log.note !== "Başlangıç").weightKg).toBe(68.5);
});
