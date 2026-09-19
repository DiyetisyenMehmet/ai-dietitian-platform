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
      meals: [{
        mealType: "LUNCH",
        occurrenceRecorded: true,
        nutritionKnown: true,
        items: [{
          id: "meal-ui",
          name: "Geçmiş test öğünü",
          loggedAt: "2026-09-19T10:00:00.000Z",
          calories: 650,
          proteinG: 35,
          carbsG: 75,
          fatG: 20,
        }],
        totals: {
          calories: observed(650),
          proteinG: observed(35),
          carbsG: observed(75),
          fatG: observed(20),
        },
      }],
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
      entries: [{
        id: "activity-ui",
        type: "WALKING",
        name: "Yürüyüş",
        durationMinutes: 30,
        distanceKm: 2.5,
        perceivedIntensity: null,
        caloriesBurned: null,
        loggedAt: "2026-09-19T14:00:00.000Z",
      }],
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
    meta: { partialResponse: false, unavailableSources: [], generatedAt: "2026-09-19T15:00:00.000Z" },
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
        averageMlPerRecordedDay: metric(2100, 1950),
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
    meta: { partialResponse: false, unavailableSources: [], generatedAt: "2026-09-19T15:00:00.000Z" },
  };
}

test.use({ viewport: { width: 390, height: 844 } });

test("History daily/period UI keeps data visible when AI fails and share defaults are private", async ({ page }) => {
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
      body: JSON.stringify(success({ comparison: comparison(periodType, referenceDate, timezone) })),
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
      body: JSON.stringify(success({
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
      })),
    });
  });

  await page.goto(`${WEB_BASE_URL}/progress`);
  await expect(page.getByRole("link", { name: "Tüm geçmişimi gör" })).toHaveAttribute("href", "/history");

  await page.goto(`${WEB_BASE_URL}/history`);
  await expect(page.getByText("Geçmişim", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Günlük" })).toBeVisible();
  await expect(page.getByText("650 kcal", { exact: true })).toBeVisible();
  await expect(page.getByText("Kayıt yok", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Sonraki dönem" })).toBeDisabled();

  await expect(page.getByText(/AI unavailable for UI test/)).toBeVisible();
  await expect(page.getByText("650 kcal", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tekrar dene" }).click();
  await expect(page.getByText("Test değerlendirmesi hazır.")).toBeVisible();

  await page.getByRole("button", { name: "Günü paylaş" }).click();
  const dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /Kalori ve makrolar/ })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /^Su/ })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /Aktivite/ })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /Öğün isimleri/ })).not.toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /^Uyku/ })).not.toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /^Kilo/ })).not.toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /Diewish değerlendirmesi/ })).not.toBeChecked();
  await expect(dialog.getByText("Geçmiş test öğünü")).toHaveCount(0);

  await dialog.getByRole("checkbox", { name: /Öğün isimleri/ }).check();
  await expect(dialog.getByText(/Geçmiş test öğünü/)).toBeVisible();
  await dialog.getByRole("button", { name: "Kapat" }).click();

  await page.getByRole("button", { name: "Haftalık" }).click();
  await expect(page.getByText(/karşılaştırma sınırlı olabilir/)).toBeVisible();
  await expect(page.getByText("Ortalama kalori")).toBeVisible();

  await page.getByRole("button", { name: "Aylık" }).click();
  await expect(page.getByText("Dönem karşılaştırması")).toBeVisible();

  await page.evaluate(() => document.documentElement.classList.add("dark"));
  expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
  await expect(page.getByText("Geçmişim", { exact: true })).toBeVisible();
});
