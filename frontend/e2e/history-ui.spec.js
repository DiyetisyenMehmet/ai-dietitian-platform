const { test, expect } = require("@playwright/test");

const WEB_BASE_URL = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";

function success(data) {
  return { success: true, data };
}

async function onboard(page) {
  const email = `history.ui.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;
  const password = "HistoryBrowserPass123";

  await page.goto(`${WEB_BASE_URL}/register`);
  await page.getByLabel("Ad Soyad").fill("History Browser User");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.getByLabel("Şifre (Tekrar)").fill(password);
  await page.getByRole("button", { name: "Hesap Oluştur" }).click();

  await expect(page).toHaveURL(/\/consent$/);
  const consentCheckboxes = page.getByRole("checkbox");
  for (let index = 0; index < 3; index += 1) await consentCheckboxes.nth(index).click();
  await page.getByRole("button", { name: "Onayla ve Devam Et" }).click();

  await page.getByLabel("Ad Soyad").fill("History Browser User");
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
}

function observed(value) {
  return { state: value === 0 ? "KNOWN_ZERO" : "KNOWN_VALUE", value };
}

function metric(current, previous) {
  const absoluteChange = current - previous;
  return {
    current: observed(current),
    previous: observed(previous),
    absoluteChange,
    percentageChange: previous === 0 ? null : (absoluteChange / Math.abs(previous)) * 100,
    direction: absoluteChange === 0 ? "UNCHANGED" : absoluteChange > 0 ? "UP" : "DOWN",
    comparisonAvailable: true,
    quality: "LIMITED",
  };
}

function completeness(status, recordedDays, expectedDays) {
  return {
    recordedDays,
    quantifiedDays: recordedDays,
    expectedDays,
    coverageRatio: expectedDays > 0 ? recordedDays / expectedDays : null,
    status,
  };
}

function dayHistory(date, timezone) {
  return {
    date,
    timezone,
    period: {
      localStartDate: date,
      localEndDateExclusive: date,
      fromUtc: "2026-09-18T21:00:00.000Z",
      toUtcExclusive: "2026-09-19T21:00:00.000Z",
      days: 1,
    },
    nutrition: {
      sourceStatus: "OK",
      status: "RECORDED",
      meals: [
        {
          mealType: "LUNCH",
          occurrenceRecorded: true,
          nutritionKnown: true,
          items: [
            {
              id: "meal-ui",
              name: "Geçmiş test öğünü",
              loggedAt: "2026-09-19T10:00:00.000Z",
              calories: 650,
              proteinG: 35,
              carbsG: 75,
              fatG: 20,
            },
            {
              id: "meal-ui-long",
              name: "Uzun paylaşım metni taşma kontrolü için hazırlanan çok uzun öğün açıklaması",
              loggedAt: "2026-09-19T10:05:00.000Z",
              calories: null,
              proteinG: null,
              carbsG: null,
              fatG: null,
            },
          ],
          totals: {
            calories: observed(650),
            proteinG: observed(35),
            carbsG: observed(75),
            fatG: observed(20),
          },
        },
      ],
      totals: {
        calories: observed(650),
        proteinG: observed(35),
        carbsG: observed(75),
        fatG: observed(20),
      },
    },
    water: {
      sourceStatus: "OK",
      status: "NONE",
      totalMl: { state: "NO_RECORD", value: null },
      currentGoalMl: observed(2500),
      historicalGoalComparisonAvailable: true,
      logs: [],
    },
    activity: {
      sourceStatus: "OK",
      status: "RECORDED",
      entries: [
        {
          id: "activity-ui",
          type: "WALKING",
          name: "Yürüyüş",
          durationMinutes: 30,
          distanceKm: 2.5,
          perceivedIntensity: null,
          caloriesBurned: null,
          loggedAt: "2026-09-19T14:00:00.000Z",
        },
      ],
      totalActiveMinutes: observed(30),
      totalDistanceKm: observed(2.5),
      totalCaloriesBurned: { state: "UNKNOWN", value: null },
    },
    sleep: {
      sourceStatus: "OK",
      status: "NONE",
      entries: [],
      totalDurationMinutes: { state: "NO_RECORD", value: null },
      averageQuality: { state: "NO_RECORD", value: null },
    },
    weight: {
      sourceStatus: "OK",
      status: "RECORDED",
      measurement: { id: "weight-ui", weightKg: 69.8, loggedAt: "2026-09-19T06:00:00.000Z" },
    },
    timeline: [
      {
        id: "meal:meal-ui",
        type: "MEAL",
        timestamp: "2026-09-19T10:00:00.000Z",
        sourceId: "meal-ui",
        payload: { mealType: "LUNCH", name: "Geçmiş test öğünü", nutritionKnown: true },
      },
      {
        id: "activity:activity-ui",
        type: "ACTIVITY",
        timestamp: "2026-09-19T14:00:00.000Z",
        sourceId: "activity-ui",
        payload: { type: "WALKING", name: "Yürüyüş", durationMinutes: 30 },
      },
    ],
    completeness: {
      nutrition: {
        status: "RECORDED",
        mealTypesRecorded: ["LUNCH"],
        nutritionBearingEntries: 1,
        entriesWithUnknownCoreNutrition: 0,
      },
      water: { status: "NONE" },
      activity: { status: "RECORDED" },
      sleep: { status: "NONE" },
      weight: { status: "RECORDED", measurementCount: 1 },
    },
    meta: {
      partialResponse: false,
      unavailableSources: [],
      generatedAt: "2026-09-19T15:00:00.000Z",
    },
  };
}

function comparison(periodType, referenceDate, timezone) {
  const week = periodType === "WEEK";
  const expectedDays = week ? 3 : 19;
  return {
    periodType,
    timezone,
    comparisonMode: "EQUAL_ELAPSED_DAYS",
    currentPeriod: {
      localStartDate: week ? "2026-09-14" : "2026-09-01",
      localEndDateInclusive: referenceDate,
      localEndDateExclusive: referenceDate,
      fromUtc: "2026-09-01T00:00:00.000Z",
      toUtcExclusive: "2026-09-20T00:00:00.000Z",
      days: expectedDays,
    },
    previousPeriod: {
      localStartDate: week ? "2026-09-07" : "2026-08-01",
      localEndDateInclusive: week ? "2026-09-09" : "2026-08-19",
      localEndDateExclusive: week ? "2026-09-10" : "2026-08-20",
      fromUtc: "2026-08-01T00:00:00.000Z",
      toUtcExclusive: "2026-09-01T00:00:00.000Z",
      days: expectedDays,
    },
    metrics: {
      nutrition: {
        averageCaloriesPerQuantifiedDay: metric(1800, 1900),
        averageProteinGPerQuantifiedDay: metric(90, 85),
        averageCarbsGPerQuantifiedDay: metric(200, 210),
        averageFatGPerQuantifiedDay: metric(60, 65),
        mealOccurrenceCount: metric(6, 5),
      },
      water: {
        totalMl: metric(4200, 3900),
        averageMlPerRecordedDay: metric(2100, 0),
        recordedDays: metric(2, 2),
      },
      activity: {
        totalActiveMinutes: metric(80, 60),
        averageActiveMinutesPerRecordedDay: metric(40, 30),
        activityCount: metric(2, 2),
        totalDistanceKm: metric(6.2, 5.1),
        totalCaloriesBurned: metric(300, 250),
      },
      sleep: {
        recordedNights: metric(2, 2),
        totalDurationMinutes: metric(900, 840),
        averageDurationPerRecordedNight: metric(450, 420),
        averageQuality: metric(4, 3.5),
      },
      weight: {
        measurementCount: metric(2, 2),
        firstMeasurementKg: metric(70, 70.4),
        lastMeasurementKg: metric(69.8, 70.1),
        netChangeKg: metric(-0.2, -0.3),
      },
    },
    completeness: {
      current: {
        nutrition: completeness("PARTIAL", 2, expectedDays),
        water: completeness("PARTIAL", 2, expectedDays),
        activity: completeness("PARTIAL", 2, expectedDays),
        sleep: completeness("PARTIAL", 2, expectedDays),
        weight: { sourceStatus: "OK", measurementCount: 2 },
      },
      previous: {
        nutrition: completeness("PARTIAL", 2, expectedDays),
        water: completeness("PARTIAL", 2, expectedDays),
        activity: completeness("PARTIAL", 2, expectedDays),
        sleep: completeness("PARTIAL", 2, expectedDays),
        weight: { sourceStatus: "OK", measurementCount: 2 },
      },
    },
    meta: {
      partialResponse: false,
      unavailableSources: [],
      generatedAt: "2026-09-19T15:00:00.000Z",
    },
  };
}

test.use({ viewport: { width: 390, height: 844 } });

test("History daily/period UI keeps data visible when AI fails and share defaults are private", async ({
  page,
}) => {
  await onboard(page);

  let insightCalls = 0;
  await page.route("**/api/history/day**", async (route) => {
    const url = new URL(route.request().url());
    const date = url.searchParams.get("date") || "2026-09-19";
    const timezone = url.searchParams.get("timezone") || "UTC";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(success({ history: dayHistory(date, timezone) })),
    });
  });

  await page.route("**/api/history/comparison**", async (route) => {
    const url = new URL(route.request().url());
    const referenceDate = url.searchParams.get("referenceDate") || "2026-09-19";
    const timezone = url.searchParams.get("timezone") || "UTC";
    const periodType = url.searchParams.get("period") === "month" ? "MONTH" : "WEEK";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        success({ comparison: comparison(periodType, referenceDate, timezone) }),
      ),
    });
  });

  await page.route("**/api/history/insight", async (route) => {
    insightCalls += 1;
    if (insightCalls === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: { code: "AI_UNAVAILABLE", message: "AI unavailable for UI test" },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        success({
          insight: {
            scope: "DAY",
            periodKey: "2026-09-19",
            timezone: "UTC",
            content: { text: "Test değerlendirmesi hazır." },
            generatedBy: "AI",
            cacheStatus: "MISS",
            provider: "test",
            model: "test",
            generatedAt: "2026-09-19T15:00:00.000Z",
          },
        }),
      ),
    });
  });

  await page.goto(`${WEB_BASE_URL}/progress`);
  await expect(page.getByRole("link", { name: "Tüm geçmişimi gör" })).toHaveAttribute(
    "href",
    "/history",
  );
  await page.getByRole("link", { name: "Tüm geçmişimi gör" }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByText("Geçmişim", { exact: true })).toBeVisible();
  await expect(page.getByText(/Geçmişine bak/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Günlük" })).toBeVisible();
  await expect(page.getByText("Takvim", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bugün" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dün" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Karşılaştır" })).toBeVisible();
  await expect(page.getByText("650 kcal", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Toplam kalori", { exact: true })).toBeVisible();
  await expect(page.getByText("Aktivite süresi", { exact: true })).toBeVisible();
  await expect(page.getByText("Günlük Zaman Akışı", { exact: true })).toBeVisible();
  await expect(page.getByText("Kayıt yok", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Sonraki dönem" })).toBeDisabled();

  await expect(page.getByText(/AI unavailable for UI test/)).toBeVisible();
  await expect(page.getByText("650 kcal", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Tekrar dene" }).click();
  await expect(page.getByText("Test değerlendirmesi hazır.")).toBeVisible();

  await page.evaluate(() => {
    window.__historyShares = [];
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data) => {
        window.__historyShares.push({
          fileCount: data.files ? data.files.length : 0,
          fileType: data.files && data.files[0] ? data.files[0].type : null,
          text: data.text || "",
        });
      },
    });
  });

  await page.getByRole("button", { name: "Günü paylaş" }).click();
  let dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Görsel olarak paylaş" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Yazı olarak paylaş" })).toBeVisible();
  await expect(dialog.getByText("Story • 1080×1920", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /Kalori ve makrolar/ })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /^Su/ })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /Aktivite/ })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /Öğün isimleri/ })).not.toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /^Uyku/ })).not.toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /^Kilo/ })).not.toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /Diewish değerlendirmesi/ })).not.toBeChecked();
  await expect(dialog.getByText("Geçmiş test öğünü")).toHaveCount(0);

  await dialog.getByRole("button", { name: "Görseli Paylaş" }).click();
  await expect(dialog).toHaveCount(0);
  let shares = await page.evaluate(() => window.__historyShares);
  expect(shares.at(-1).fileCount).toBe(1);
  expect(shares.at(-1).fileType).toBe("image/png");

  await page.getByRole("button", { name: "Günü paylaş" }).click();
  dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await dialog.getByRole("button", { name: "Yazı olarak paylaş" }).click();
  await expect(dialog.getByText("Yazı önizleme", { exact: true })).toBeVisible();
  await expect(dialog.locator("pre")).toContainText("650 kcal");
  await expect(dialog.locator("pre")).not.toContainText("Geçmiş test öğünü");
  await expect(dialog.locator("pre")).not.toContainText("69,8 kg");
  await dialog.getByRole("button", { name: "Yazıyı Paylaş" }).click();
  await expect(dialog).toHaveCount(0);
  shares = await page.evaluate(() => window.__historyShares);
  expect(shares.at(-1).fileCount).toBe(0);
  expect(shares.at(-1).text).toContain("650 kcal");
  expect(shares.at(-1).text).not.toContain("Geçmiş test öğünü");
  expect(shares.at(-1).text).not.toContain("69,8 kg");

  await page.getByRole("button", { name: "Günü paylaş" }).click();
  dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await dialog.getByRole("checkbox", { name: /Öğün isimleri/ }).check();
  const longPreview = dialog
    .getByText(/Uzun paylaşım metni taşma kontrolü/, { exact: false })
    .first();
  await expect(longPreview).toBeVisible();
  expect(await longPreview.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  await dialog.getByRole("button", { name: "Yazı olarak paylaş" }).click();
  await expect(dialog.locator("pre")).toContainText("Geçmiş test öğünü");
  await expect(dialog.locator("pre")).toContainText("Uzun paylaşım metni taşma kontrolü");
  await dialog.getByRole("checkbox", { name: /Öğün isimleri/ }).uncheck();
  await expect(dialog.locator("pre")).not.toContainText("Geçmiş test öğünü");
  await dialog.getByRole("button", { name: "Kapat" }).click();

  await page.evaluate(() => {
    window.__nativeHistoryVisual = null;
    window.__nativeHistoryText = null;
    window.DiewishShare = {
      isAvailable: () => true,
      sharePng: (base64Png, filename, text) => {
        window.__nativeHistoryVisual = { base64Length: base64Png.length, filename, text };
      },
      shareText: (text, title) => {
        window.__nativeHistoryText = { text, title };
      },
    };
  });

  await page.getByRole("button", { name: "Günü paylaş" }).click();
  dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await dialog.getByRole("button", { name: "Görseli Paylaş" }).click();
  const nativeVisual = await page.evaluate(() => window.__nativeHistoryVisual);
  expect(nativeVisual.base64Length).toBeGreaterThan(100);
  expect(nativeVisual.filename).toMatch(/\.png$/);
  expect(nativeVisual.text).toContain("650 kcal");
  expect(nativeVisual.text).not.toContain("History Browser User");

  await page.getByRole("button", { name: "Günü paylaş" }).click();
  dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await dialog.getByRole("button", { name: "Yazı olarak paylaş" }).click();
  await dialog.getByRole("button", { name: "Yazıyı Paylaş" }).click();
  const nativeText = await page.evaluate(() => window.__nativeHistoryText);
  expect(nativeText.text).toContain("650 kcal");
  expect(nativeText.text).not.toContain("History Browser User");
  await page.evaluate(() => {
    delete window.DiewishShare;
  });

  await page.getByRole("button", { name: "Haftalık" }).click();
  await expect(page.getByText("Haftanın Özeti", { exact: true })).toBeVisible();
  await expect(page.getByText("Ortalama kalori", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("2/3 gün kayıt", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("7 sa 30 dk", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Karşılaştırma", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Geçen hafta", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Önceki dönem" }).click();
  const selectedWeeklyDate = (await page.getByTestId("history-selected-date").textContent()) || "";
  await page.getByRole("button", { name: "Karşılaştır" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Haftalık Karşılaştırma" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Haftalık karşılaştırma" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const weeklyComparison = page.getByLabel("Dönem karşılaştırması");
  await expect(weeklyComparison).toBeVisible();
  const weeklyCalories = weeklyComparison.locator("article").filter({ hasText: "Ortalama kalori" });
  await expect(weeklyCalories.getByText("Bu hafta", { exact: true })).toBeVisible();
  await expect(weeklyCalories.getByText("Geçen hafta", { exact: true })).toBeVisible();
  await expect(weeklyCalories.getByText("Fark", { exact: true })).toBeVisible();
  await expect(weeklyCalories.getByText("2/3 gün kayıt", { exact: true })).toBeVisible();
  const weeklyActivity = weeklyComparison
    .locator("article")
    .filter({ hasText: "Toplam aktivite süresi" });
  await expect(weeklyActivity.getByText("1 sa 20 dk", { exact: true })).toBeVisible();
  await expect(weeklyActivity.getByText("1 sa", { exact: true })).toBeVisible();
  await expect(weeklyActivity.getByText("+20 dk", { exact: true })).toBeVisible();
  await expect(weeklyComparison.getByText("NaN", { exact: false })).toHaveCount(0);
  await expect(weeklyComparison.getByText("Infinity", { exact: false })).toHaveCount(0);
  await page.evaluate(() => {
    window.__nativeHistoryVisual = null;
    window.DiewishShare = {
      isAvailable: () => true,
      sharePng: (base64Png, filename, text) => {
        window.__nativeHistoryVisual = { base64Length: base64Png.length, filename, text };
      },
      shareText: () => {},
    };
  });
  await page.getByRole("button", { name: "Karşılaştırmayı paylaş" }).click();
  dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await expect(dialog.getByText("Bu hafta", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText("Geçen hafta", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText("Fark", { exact: true }).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Görseli Paylaş" }).click();
  const weeklyComparisonVisual = await page.evaluate(() => window.__nativeHistoryVisual);
  expect(weeklyComparisonVisual.base64Length).toBeGreaterThan(100);
  expect(weeklyComparisonVisual.filename).toMatch(/\.png$/);
  expect(weeklyComparisonVisual.text).toContain("Bu hafta ↔ Geçen haftanın aynı dönemi");
  await page.evaluate(() => {
    delete window.DiewishShare;
  });
  const selectedComparisonPeriod =
    (await page.getByTestId("history-selected-date").textContent()) || "";
  expect(selectedComparisonPeriod).not.toBe("");
  await page.getByRole("button", { name: "Önceki dönem" }).click();
  await expect(page.getByTestId("history-selected-date")).not.toHaveText(selectedComparisonPeriod);
  await expect(page.getByLabel("Dönem karşılaştırması")).toBeVisible();
  await page.getByRole("button", { name: "Normal geçmişe dön" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Geçmişim" })).toBeVisible();
  await expect(page.getByText("Haftanın Özeti", { exact: true })).toBeVisible();
  await expect(page.getByTestId("history-selected-date")).toHaveText(selectedWeeklyDate);
  await page.evaluate(() => {
    window.__nativeHistoryVisual = null;
    window.DiewishShare = {
      isAvailable: () => true,
      sharePng: (base64Png, filename, text) => {
        window.__nativeHistoryVisual = { base64Length: base64Png.length, filename, text };
      },
      shareText: () => {},
    };
  });
  await page.getByRole("button", { name: "Haftayı paylaş" }).click();
  dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await expect(dialog.getByText("Görsel önizleme", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Görseli Paylaş" }).click();
  const weeklyVisual = await page.evaluate(() => window.__nativeHistoryVisual);
  expect(weeklyVisual.base64Length).toBeGreaterThan(100);
  expect(weeklyVisual.filename).toMatch(/\.png$/);
  await page.evaluate(() => {
    delete window.DiewishShare;
  });

  await page.getByRole("button", { name: "Haftayı paylaş" }).click();
  dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await dialog.getByRole("button", { name: "Yazı olarak paylaş" }).click();
  await expect(dialog.locator("pre")).toContainText("Diewish hafta özetim");
  await expect(dialog.locator("pre")).toContainText("Ortalama Kalori: 1.800 kcal");
  await expect(dialog.locator("pre")).not.toContainText("Geçen hafta");
  await expect(dialog.locator("pre")).not.toContainText("Fark:");
  await dialog.getByRole("button", { name: "Kapat" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);

  await page.getByRole("button", { name: "Aylık" }).click();
  await expect(page.getByText("Ayın Özeti", { exact: true })).toBeVisible();
  await expect(page.getByText("2/19 gün kayıt", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Karşılaştırma", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Geçen ay", { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    window.__nativeHistoryVisual = null;
    window.DiewishShare = {
      isAvailable: () => true,
      sharePng: (base64Png, filename, text) => {
        window.__nativeHistoryVisual = { base64Length: base64Png.length, filename, text };
      },
      shareText: () => {},
    };
  });
  await page.getByRole("button", { name: "Ayı paylaş" }).click();
  dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await expect(dialog.getByText("Görsel önizleme", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Görseli Paylaş" }).click();
  const monthlyVisual = await page.evaluate(() => window.__nativeHistoryVisual);
  expect(monthlyVisual.base64Length).toBeGreaterThan(100);
  expect(monthlyVisual.filename).toMatch(/\.png$/);
  await page.evaluate(() => {
    delete window.DiewishShare;
  });

  await page.getByRole("button", { name: "Ayı paylaş" }).click();
  dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await dialog.getByRole("button", { name: "Yazı olarak paylaş" }).click();
  await expect(dialog.locator("pre")).toContainText("Diewish ay özetim");
  await expect(dialog.locator("pre")).toContainText("Ortalama Kalori: 1.800 kcal");
  await expect(dialog.locator("pre")).not.toContainText("Geçen ay");
  await expect(dialog.locator("pre")).not.toContainText("Fark:");
  await dialog.getByRole("button", { name: "Kapat" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);

  const selectedMonthlyDate = (await page.getByTestId("history-selected-date").textContent()) || "";
  await page.getByRole("button", { name: "Karşılaştır" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Aylık Karşılaştırma" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aylık karşılaştırma" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const monthlyComparison = page.getByLabel("Dönem karşılaştırması");
  await expect(monthlyComparison).toBeVisible();
  const monthlyCalories = monthlyComparison.locator("article").filter({
    hasText: "Ortalama kalori",
  });
  await expect(monthlyCalories.getByText("Bu ay", { exact: true })).toBeVisible();
  await expect(monthlyCalories.getByText("Geçen ay", { exact: true })).toBeVisible();
  await expect(monthlyCalories.getByText("Fark", { exact: true })).toBeVisible();
  await expect(monthlyCalories.getByText("2/19 gün kayıt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Karşılaştırmayı paylaş" }).click();
  dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await expect(dialog.getByText("Bu ay", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText("Geçen ay", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText("Fark", { exact: true }).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Yazı olarak paylaş" }).click();
  await expect(dialog.locator("pre")).toContainText("Bu ay ↔ Geçen ayın aynı dönemi");
  await expect(dialog.locator("pre")).toContainText("Bu ay: 1.800 kcal");
  await expect(dialog.locator("pre")).toContainText("Geçen ay: 1.900 kcal");
  await expect(dialog.locator("pre")).toContainText("Fark: −100 kcal");
  await dialog.getByRole("button", { name: "Kapat" }).click();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Geçmişim" })).toBeVisible();
  await expect(page.getByText("Ayın Özeti", { exact: true })).toBeVisible();
  await expect(page.getByTestId("history-selected-date")).toHaveText(selectedMonthlyDate);

  await page.evaluate(() => document.documentElement.classList.add("dark"));
  expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
  await expect(page.getByText("Geçmişim", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ayı paylaş" }).click();
  dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await expect(dialog.getByText("Görsel önizleme", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Kapat" }).click();

  await page.getByRole("button", { name: "Karşılaştır" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Aylık Karşılaştırma" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Normal geçmişe dön" }).click();

  await page.setViewportSize({ width: 412, height: 915 });
  await page.getByRole("button", { name: "Günlük" }).click();
  await expect(page.getByText("Günün Özeti", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Karşılaştır" }).click();
  await expect(page.getByRole("button", { name: "Haftalık karşılaştırma" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Normal geçmişe dön" }).click();
  await expect(page.getByText("Günün Özeti", { exact: true })).toBeVisible();
});
