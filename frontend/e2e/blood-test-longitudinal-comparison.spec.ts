import { expect, test, type Page } from "@playwright/test";

import {
  createDashboardSession,
  DASHBOARD_WEB_BASE_URL,
  setDashboardTheme,
} from "./dashboard-test-session";

const UPLOAD_ID = "11111111-1111-4111-8111-111111111111";
const ANALYSIS_ID = "22222222-2222-4222-8222-222222222222";

function listAnalysis(testDate = "2026-09-15") {
  return {
    id: ANALYSIS_ID,
    bloodTestId: UPLOAD_ID,
    status: "COMPLETED",
    summary: "Karşılaştırma sunumu için test analizi.",
    abnormalCount: 1,
    normalizedValues: [
      {
        biomarkerCode: "GLUCOSE",
        biomarkerName: "Glukoz",
        rawValue: "92",
        numericValue: 92,
        unit: "mg/dL",
        extractedUnit: "mg/dL",
        referenceRange: {
          unit: "mg/dL",
          minValue: 70,
          maxValue: 99,
          source: "LAB_REPORT",
        },
        status: "NORMAL",
      },
    ],
    aiExplanations: [],
    nutritionImplications: [],
    overallRecommendations: [],
    testDate,
    freshness: "CURRENT",
    freshnessAgeDays: 1,
    personalizationEligible: true,
    freshnessMessage: null,
    createdAt: "2026-09-15T08:00:00.000Z",
    updatedAt: "2026-09-15T08:00:00.000Z",
  };
}

async function mockAnalysisList(page: Page, analysis = listAnalysis()) {
  await page.route("**/api/blood-tests/analyses", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { analyses: [analysis] } }),
    });
  });
}

async function openBloodTests(page: Page) {
  await page.goto(`${DASHBOARD_WEB_BASE_URL}/profile/blood-tests`);
  await expect(page.getByText("Karşılaştırma sunumu için test analizi.")).toBeVisible();
}

test("longitudinal comparison lazy-loads once and presents neutral mathematical changes", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await createDashboardSession(page, request);
  await mockAnalysisList(page);

  let detailCalls = 0;
  await page.route(`**/api/blood-tests/${UPLOAD_ID}/analysis`, async (route) => {
    detailCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          analysis: {
            ...listAnalysis(),
            longitudinalComparison: {
              previousAnalysisId: "33333333-3333-4333-8333-333333333333",
              previousMeasuredAt: "2026-08-20",
              currentMeasuredAt: "2026-09-15",
              comparedCount: 5,
              comparisons: [
                {
                  biomarkerCode: "GLUCOSE",
                  biomarkerName: "Glukoz",
                  unit: "mg/dL",
                  previousValue: 88,
                  currentValue: 92,
                  absoluteDifference: 4,
                  percentageDifference: 4.55,
                  direction: "increased",
                  previousReferenceStatus: "HIGH",
                  currentReferenceStatus: "NORMAL",
                },
                {
                  biomarkerCode: "FERRITIN",
                  biomarkerName: "Ferritin",
                  unit: "ng/mL",
                  previousValue: 50,
                  currentValue: 45,
                  absoluteDifference: -5,
                  percentageDifference: -10,
                  direction: "decreased",
                  previousReferenceStatus: "NORMAL",
                  currentReferenceStatus: "LOW",
                },
                {
                  biomarkerCode: "SODIUM",
                  biomarkerName: "Sodyum",
                  unit: "mmol/L",
                  previousValue: 140,
                  currentValue: 140,
                  absoluteDifference: 0,
                  percentageDifference: 0,
                  direction: "unchanged",
                  previousReferenceStatus: "NORMAL",
                  currentReferenceStatus: "NORMAL",
                },
                {
                  biomarkerCode: "CRITICAL_REFERENCE",
                  biomarkerName: "Laboratuvar kritik referans örneği",
                  unit: "U/L",
                  previousValue: 1,
                  currentValue: 2,
                  absoluteDifference: 1,
                  percentageDifference: 100,
                  direction: "increased",
                  previousReferenceStatus: "CRITICALLY_LOW",
                  currentReferenceStatus: "CRITICALLY_HIGH",
                },
                {
                  biomarkerCode: "LONG_NAME",
                  biomarkerName:
                    "Çok uzun biyobelirteç adı mobil taşma güvenliği doğrulaması için örnek değer",
                  unit: "çok-uzun-birim-ifadesi-mg/dL-eşdeğeri",
                  previousValue: 123456.789,
                  currentValue: 123460.789,
                  absoluteDifference: 4,
                  percentageDifference: 0.01,
                  direction: "increased",
                  previousReferenceStatus: "UNKNOWN",
                  currentReferenceStatus: "UNKNOWN",
                },
              ],
            },
          },
        },
      }),
    });
  });

  await openBloodTests(page);
  expect(detailCalls).toBe(0);

  const details = page.getByText("Detaylı analizi görüntüle").locator("..");
  await details.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByText("Önceki tahlille karşılaştırma yükleniyor")).toBeVisible();
  const comparison = page.locator("[data-blood-test-comparison]");
  await expect(comparison).toBeVisible();
  await expect(comparison.getByText("Önceki Tahlille Karşılaştırma")).toBeVisible();
  expect(detailCalls).toBe(1);

  await expect(comparison.getByText("Arttı").first()).toBeVisible();
  await expect(comparison.getByText("Azaldı")).toBeVisible();
  await expect(comparison.getByText("Değişmedi")).toBeVisible();
  await expect(comparison.getByText("+4 mg/dL (+4,55%)")).toBeVisible();
  const glucoseComparison = comparison
    .locator("[data-blood-test-comparison-item]")
    .filter({ hasText: "Glukoz" });
  await expect(glucoseComparison.getByText("Önceki: Yüksek")).toBeVisible();
  await expect(glucoseComparison.getByText("Şimdi: Normal")).toBeVisible();
  await expect(comparison.getByText("Referans değerlendirilemedi").first()).toBeVisible();
  await expect(comparison.getByText("Kritik düşük")).toBeVisible();
  await expect(comparison.getByText("Kritik yüksek")).toBeVisible();

  const comparisonText = await comparison.innerText();
  expect(comparisonText).not.toMatch(
    /iyileşti|kötüleşti|düzeldi|bozuldu|risk arttı|tedavi işe yaradı/i,
  );

  for (const direction of ["increased", "decreased", "unchanged"]) {
    const badge = comparison.locator(`[data-comparison-direction="${direction}"]`).first();
    const className = (await badge.getAttribute("class")) ?? "";
    expect(className).not.toMatch(/red|green|emerald|destructive/i);
  }

  await details.click();
  await details.click();
  await expect(comparison).toBeVisible();
  expect(detailCalls).toBe(1);

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const theme of ["light", "dark"] as const) {
      await setDashboardTheme(page, theme);
      const fits = await comparison.evaluate(
        (node) => node.scrollWidth <= node.clientWidth + 1,
      );
      expect(fits).toBe(true);
    }
  }
});

test("zero baseline keeps the real zero, hides fake percentage, and handles missing dates safely", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await createDashboardSession(page, request);
  await mockAnalysisList(page, listAnalysis("2026-09-16"));

  await page.route(`**/api/blood-tests/${UPLOAD_ID}/analysis`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          analysis: {
            ...listAnalysis("2026-09-16"),
            longitudinalComparison: {
              previousAnalysisId: "44444444-4444-4444-8444-444444444444",
              previousMeasuredAt: null,
              currentMeasuredAt: null,
              comparedCount: 1,
              comparisons: [
                {
                  biomarkerCode: "B12",
                  biomarkerName: "B12",
                  unit: "pg/mL",
                  previousValue: 0,
                  currentValue: 10,
                  absoluteDifference: 10,
                  percentageDifference: null,
                  direction: "increased",
                  previousReferenceStatus: "UNKNOWN",
                  currentReferenceStatus: "UNKNOWN",
                },
              ],
            },
          },
        },
      }),
    });
  });

  await openBloodTests(page);
  await page.getByText("Detaylı analizi görüntüle").click();

  const comparison = page.locator("[data-blood-test-comparison]");
  await expect(comparison).toBeVisible();
  const b12Comparison = comparison
    .locator("[data-blood-test-comparison-item]")
    .filter({ hasText: "B12" });
  await expect(b12Comparison.getByText("0 pg/mL", { exact: true })).toBeVisible();
  await expect(b12Comparison).toContainText("Değişim: +10 pg/mL");
  await expect(comparison.getByText("Yüzde değişim gösterilemiyor")).toBeVisible();
  await expect(comparison.getByText("Test tarihi kayıtlı değil")).toHaveCount(2);
  await expect(comparison).not.toContainText("%0");
});

test("comparison API failure stays isolated, retry works, and null result is cached", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await createDashboardSession(page, request);
  await mockAnalysisList(page, listAnalysis("2026-09-17"));

  let detailCalls = 0;
  await page.route(`**/api/blood-tests/${UPLOAD_ID}/analysis`, async (route) => {
    detailCalls += 1;
    if (detailCalls === 1) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: { code: "INTERNAL_ERROR", message: "synthetic comparison failure" },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          analysis: {
            ...listAnalysis("2026-09-17"),
            longitudinalComparison: null,
          },
        },
      }),
    });
  });

  await openBloodTests(page);
  const details = page.getByText("Detaylı analizi görüntüle").locator("..");
  await details.click();

  const comparison = page.locator("[data-blood-test-comparison]");
  await expect(comparison.getByText("Karşılaştırma şu anda yüklenemedi.")).toBeVisible();
  await expect(page.getByText("Karşılaştırma sunumu için test analizi.")).toBeVisible();
  expect(detailCalls).toBe(1);

  await comparison.getByRole("button", { name: "Önceki tahlil karşılaştırmasını tekrar yükle" }).click();
  await expect(comparison.getByText("Karşılaştırılabilir önceki tahlil bulunamadı.")).toBeVisible();
  expect(detailCalls).toBe(2);

  await details.click();
  await details.click();
  await expect(comparison.getByText("Karşılaştırılabilir önceki tahlil bulunamadı.")).toBeVisible();
  expect(detailCalls).toBe(2);
});
