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

const micronutrients100 = {
  calcium: 240,
  iron: 6,
  vitaminD: 10,
};

const micronutrients25 = {
  calcium: 60,
  iron: 1.5,
  vitaminD: 2.5,
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
    nutrientsPer100g: { ...nutrients100, micronutrients: micronutrients100 },
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
          nutritionReference: {
            basis: "PER_100_G",
            description: "100 g",
            grams: 100,
          },
          additionalNutritionReferences: [],
          nutrients: {
            per100g: { ...nutrients100, micronutrients: micronutrients100 },
            perServing: { ...nutrients25, micronutrients: micronutrients25 },
            reference: { ...nutrients100, micronutrients: micronutrients100 },
            estimated: false,
          },
          ingredients: [],
          provenance: { nutrition: [provenance], recognition: "BARCODE_EXACT" },
          dataQuality: {
            status: "QUALITY_ACCEPTED",
            level: "HIGH",
            issues: [],
          },
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
  const personalizationRequests = [];
  await page.route("**/api/nutrition/personalize", async (route) => {
    const body = route.request().postDataJSON();
    personalizationRequests.push(body);
    const grams = Number(body.grams);
    const factor = grams / 100;
    const scaled = {
      ...Object.fromEntries(
        Object.entries(nutrients100).map(([key, value]) => [
          key,
          value === null ? null : Math.round(value * factor * 100) / 100,
        ]),
      ),
      micronutrients: Object.fromEntries(
        Object.entries(micronutrients100).map(([key, value]) => [
          key,
          Math.round(value * factor * 100) / 100,
        ]),
      ),
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(success({
        personalization: {
          grams,
          nutrients: scaled,
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

  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => window.localStorage.removeItem("theme"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${WEB_BASE_URL}/meals/scan`);
  await page.getByRole("tab", { name: "Barkod Tara" }).click();
  await page.getByPlaceholder("EAN / UPC barkod numarası").fill("4006381333931");
  await page.getByRole("button", { name: /Sorgula/ }).click();

  await expect(page.getByText("Test Protein Bar", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Seçilen porsiyon gramı")).toHaveValue("");
  await expect(page.getByText("Henüz seçilmedi", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Kaynak porsiyon bilgisi: 1 bar / 25 g. Bu değer otomatik tüketim sayılmaz.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("520 kcal", { exact: true }).first()).toBeVisible();
  expect(personalizationRequests).toHaveLength(0);

  await page.getByLabel("Seçilen porsiyon gramı").fill("25");
  await page
    .getByRole("button", { name: "Tüketilen miktarı uygula ve besin değerlerini hesapla" })
    .click();
  await expect(page.getByLabel("Seçilen porsiyon gramı")).toHaveValue("25");
  await expect(page.getByText("130 kcal", { exact: true }).first()).toBeVisible();
  await page.getByText("Vitamin ve Mineraller", { exact: true }).click();
  await expect(page.getByText("60 mg", { exact: true })).toBeVisible();
  await expect(page.getByText("2,5 µg", { exact: true })).toBeVisible();
  await expect(page.getByText("Veri yok", { exact: true })).toHaveCount(0);
  await expect(page.getByText("100 g için", { exact: true })).toBeVisible();
  await expect(page.getByText(/Kaynak besin değeri 100 g referansına aittir/)).toBeVisible();
  await expect(page.getByText("100 g için şeker miktarı yüksek.")).toBeVisible();
  await expect(page.getByText("Open Food Facts", { exact: false }).first()).toBeVisible();
  expect(personalizationRequests.at(-1)).toMatchObject({ barcode: "4006381333931", grams: 25 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByLabel("Seçilen porsiyon gramı").fill("50");
  await expect(page.getByRole("button", { name: /Kalori karşılaştır/ })).toBeDisabled();
  await page
    .getByRole("button", { name: "Tüketilen miktarı uygula ve besin değerlerini hesapla" })
    .click();
  await expect(page.getByLabel("Seçilen porsiyon gramı")).toHaveValue("50");
  await expect(page.getByText("260 kcal", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("120 mg", { exact: true })).toBeVisible();
  await expect(page.getByText("5 µg", { exact: true })).toBeVisible();
  expect(personalizationRequests.at(-1)).toMatchObject({ barcode: "4006381333931", grams: 50 });

  let comparisonPayload = null;
  await page.route("**/api/nutrition/compare", async (route) => {
    comparisonPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(success({
        comparison: {
          source: { food: { displayNameTr: food.displayNameTr, provider: food.provider }, grams: 50, nutrients: { ...nutrients100, energyKcal: 260 } },
          comparisons: [],
          warning: "Aynı kalori, besinsel eşdeğerlik anlamına gelmez.",
        },
      })),
    });
  });
  await page.getByRole("button", { name: /Kalori karşılaştır/ }).click();
  await expect(page.getByText("Aynı kaloride neler var?")).toBeVisible();
  expect(comparisonPayload).toMatchObject({ barcode: "4006381333931", grams: 50 });

  let mealPayload = null;
  await page.route("**/api/tracking/meals", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    mealPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(success({ log: { id: "scanner-meal-e2e" } })),
    });
  });
  await page.getByRole("button", { name: /50 gram tüketimi .* ekle/i }).click();
  expect(mealPayload).toMatchObject({
    calories: 260,
    proteinG: 10,
    carbsG: 27.5,
    fatG: 12.5,
    micronutrients: {
      calcium: 120,
      iron: 3,
      vitaminD: 5,
    },
  });

  const coachLink = page.getByRole("link", { name: /Diewish Koç/ });
  const coachHref = await coachLink.getAttribute("href");
  expect(decodeURIComponent(coachHref ?? "")).toContain("50 g Test Protein Bar");
  expect(decodeURIComponent(coachHref ?? "")).toContain("260 kcal");

  await page.getByRole("button", { name: "Koyu temaya geç" }).evaluate((element) => element.click());
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByText("260 kcal", { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({ width: 412, height: 915 });
  await expect(page.getByText("Test Protein Bar", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Açık temaya geç" }).evaluate((element) => element.click());
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await page.route("**/api/tracking/meals/micronutrients/day?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(success({
        summary: {
          date: "2026-09-28",
          timezone: "Europe/Istanbul",
          mealCount: 2,
          mealsWithMicronutrients: 1,
          coverage: "PARTIAL",
          note: "2 öğünün 1 tanesindeki besin verilerine göre.",
          reference: {
            available: true,
            population: "ADULTS",
            version: "EU_1169_2011_ANNEX_XIII_ADULT_NRV",
            source: "Regulation (EU) No 1169/2011, Annex XIII, Part A — adult nutrient reference values",
            reason: null,
          },
          nutrients: [
            { key: "calcium", label: "Kalsiyum", unit: "mg", value: 1200, reference: 800, referencePercent: 150 },
            { key: "vitaminD", label: "Vitamin D", unit: "µg", value: 5, reference: 5, referencePercent: 100 },
          ],
        },
      })),
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${WEB_BASE_URL}/meals`);
  await expect(page.getByText("Vitamin ve Mineral Özeti", { exact: true })).toBeVisible();
  await expect(page.getByText("Kalsiyum", { exact: true })).toBeVisible();
  await expect(page.getByText("%150", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 412, height: 915 });
  await expect(page.getByText("Vitamin D", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.route("**/api/ai-coach/weekly-review", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(success({
        premium: false,
        review: {
          weekNumber: 40,
          year: 2026,
          score: 72,
          weightTrend: "STABLE",
          topRecommendations: [
            "Öğün kayıt düzenini koru.",
            "Su kayıtlarını gün içine yay.",
          ],
          premiumLocked: true,
        },
      })),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${WEB_BASE_URL}/insights`);
  await expect(page.getByRole("heading", { name: "Haftalık Koç Özeti" })).toBeVisible();
  await expect(page.getByText(/Haftalık kayıt puanın 72\/100/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aylık Koç Özeti" })).toBeVisible();
  await expect(page.getByText("Aylık koç özeti Premium erişim kapsamında sunulur.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Haftalık Değerlendirme" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("button", { name: "Koyu temaya geç" }).evaluate((element) => element.click());
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.setViewportSize({ width: 412, height: 915 });
  await expect(page.getByRole("heading", { name: "Haftalık Koç Özeti" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole("heading", { name: "Aylık Koç Özeti" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Açık temaya geç" }).evaluate((element) => element.click());
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await page.goto(`${WEB_BASE_URL}/meals/scan`);
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

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Fotoğrafla Tara" }).click();
  const cameraInput = page.getByLabel("Kamera fotoğraf girişi");
  const galleryInput = page.getByLabel("Galeri fotoğraf girişi");
  await expect(cameraInput).toHaveAttribute("capture", "environment");
  expect(await galleryInput.getAttribute("capture")).toBeNull();
  await galleryInput.setInputFiles({
    name: "meal.png",
    mimeType: "image/png",
    buffer: Buffer.from("89504e470d0a1a0a", "hex"),
  });
  await page.getByRole("button", { name: /Görseli analiz et/ }).click();
  await expect(page.getByText("Kuru fasulye", { exact: true })).toBeVisible();
  await expect(page.getByText("Görsel eşleşme: yüksek", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("3. Ne yapabilirsin?", { exact: true })).toBeVisible();
  await expect(page.getByText("6. Veri kaynağı", { exact: true })).toBeVisible();
  await expect(page.getByText("Hesaplama notu", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Öğünü elle ekle/ })).toBeVisible();
  await expect(page.getByText(/Diewish AI|AI yemeği|AI tarafından/i)).toHaveCount(0);
  for (const label of ["Karbonhidrat", "Yağ", "Şeker", "Tuz"]) {
    const nutrientLabel = page.getByText(label, { exact: true }).last();
    await expect(nutrientLabel).toBeVisible();
    expect(await nutrientLabel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }
  await page.getByRole("button", { name: /Malzemeleri Düzenle/ }).click();
  await page.getByLabel("Toplam porsiyon").fill("250");
  await page.getByRole("button", { name: /Yeniden hesapla/ }).click();
  await expect(page.getByText("Seçilen porsiyon: 250 g", { exact: true })).toBeVisible();
  await expect(page.getByText("Bu porsiyonda sodyum miktarı dikkat gerektirecek düzeyde.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("button", { name: "Koyu temaya geç" }).evaluate((element) => element.click());
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByText("Seçilen porsiyon: 250 g", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({ width: 412, height: 915 });
  await expect(page.getByText("Kuru fasulye", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Açık temaya geç" }).evaluate((element) => element.click());
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await page.goto(`${WEB_BASE_URL}/progress`);
  await expect(page.getByText("Kilo İlerlemen")).toBeVisible();
  await page.getByLabel("Kilo (kg)").fill("68.5");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByText("68,5", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("70,0", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("65,0", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Hedefe 3,5 kg kaldı", { exact: true })).toBeVisible();

  const weightResponse = await request.get(`${API_BASE_URL}/tracking/weight`, { headers: authHeaders });
  const weightBody = await weightResponse.json();
  expect(weightBody.data.logs).toHaveLength(2);
  expect(weightBody.data.logs.find((log) => log.note === "Başlangıç").weightKg).toBe(70);
  expect(weightBody.data.logs.find((log) => log.note !== "Başlangıç").weightKg).toBe(68.5);
});
