import { expect, test, type Page } from "@playwright/test";
import type { OnboardingPayload } from "../src/domain/onboarding/validation";
import type { NutritionPlanRecord } from "../src/infrastructure/nutrition/nutrition-plan-client";

const foods = [
  {
    name: "Zeytinyağlı sebzeli tam tahıllı bulgur pilavı ve yoğurtlu mevsim salatası",
    portion: "Bir büyük kase (yaklaşık 250 gram), yanında iki yemek kaşığı süzme yoğurt",
    calories: 400,
  },
  {
    name: "ÇokUzunBesinAdı".repeat(12),
    portion: "UzunPorsiyonAçıklaması".repeat(12),
    calories: 200,
  },
];

function savedPlan(): NutritionPlanRecord {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: "synthetic-saved-plan",
    createdAt: today + "T00:00:00Z",
    updatedAt: today + "T00:00:00Z",
    startDate: today,
    duration: "SEVEN_DAY",
    version: 1,
    isActive: true,
    status: "COMPLETED",
    bloodTestAnalysisId: null,
    bmr: 1500,
    tdee: 2000,
    dailyCalories: 1800,
    proteinGrams: 90,
    carbsGrams: 200,
    fatGrams: 60,
    waterMl: 2500,
    mealsPerDay: 3,
    mealTiming: { mealsPerDay: 3, slots: [] },
    dailyPlans: {
      durationDays: 7,
      cycleLengthDays: 1,
      cycle: [
        {
          dayLabel: "1. gün",
          meals: [
            {
              name: "lunch",
              time: "12:30",
              foods,
              calories: 600,
              proteinGrams: 30,
              carbsGrams: 60,
              fatGrams: 20,
              explanation: "Sentetik test öğünü.",
            },
          ],
          totalCalories: 600,
          totalProteinGrams: 30,
          totalCarbsGrams: 60,
          totalFatGrams: 20,
        },
      ],
      calendar: Array.from({ length: 7 }, (_, index) => ({ dayNumber: index + 1, cycleIndex: 0 })),
    },
    explanations: { calories: "", macros: "", water: "", mealTiming: "", overall: "" },
    recommendations: [],
    summary: null,
    aiProvider: null,
    aiModel: null,
    processingTimeMs: null,
  };
}

async function setup(page: Page, onboardingCompleted: boolean, theme: "light" | "dark") {
  const submitted: OnboardingPayload[] = [];
  const unexpectedWrites: string[] = [];
  await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
  await page.emulateMedia({ colorScheme: theme });
  // All API traffic is synthetic. No staging, user data, generation or quota is accessed.
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const headers = {
      "access-control-allow-origin": "http://127.0.0.1:3000",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type,authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    };
    const ok = (data: unknown) => route.fulfill({ headers, json: { success: true, data } });
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (path.endsWith("/auth/refresh-token"))
      return ok({
        user: {
          id: "synthetic-overflow-user",
          fullName: "Görünüm Testi",
          email: "layout@example.invalid",
          role: "USER",
          onboardingCompleted,
        },
        tokens: { accessToken: "synthetic-only-token" },
      });
    if (path.endsWith("/onboarding") && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as OnboardingPayload;
      submitted.push(payload);
      onboardingCompleted = true;
      return ok({
        fullName: payload.fullName,
        onboardingCompleted: true,
        profile: { ...payload, age: 36 },
      });
    }
    if (route.request().method() !== "GET") unexpectedWrites.push(path);
    if (path.endsWith("/legal/consents")) return ok({ allMandatoryGranted: true, items: [] });
    if (path.endsWith("/onboarding")) return ok({ profile: null });
    if (path.endsWith("/nutrition-plans")) return ok({ plans: [savedPlan()] });
    if (path.endsWith("/generation-jobs/capabilities")) return ok({ resumable: false });
    if (path.endsWith("/deviations")) return ok({ deviations: [] });
    return route.fulfill({
      status: 503,
      headers,
      json: {
        success: false,
        error: { code: "UNUSED_FIXTURE", message: "Unused synthetic endpoint" },
      },
    });
  });
  return { submitted, unexpectedWrites };
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const main = page.locator("main");
  expect(await main.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  );
}

async function mealLayout(page: Page) {
  await page.goto("/meals/plan");
  await expect(
    page.getByRole("heading", { name: "7 günlük kişisel plan", exact: true }),
  ).toBeVisible();
  for (const food of foods) {
    const name = page.getByText(food.name, { exact: true }).first();
    const portion = page.getByText(food.portion, { exact: true }).first();
    await expect(name).toBeVisible();
    await expect(portion).toBeVisible();
    for (const text of [name, portion]) {
      const bounds = await text.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return {
          left: box.left,
          right: box.right,
          fits: element.scrollWidth <= element.clientWidth + 1,
          clipped: getComputedStyle(element).overflow === "hidden",
        };
      });
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
      expect(bounds.fits).toBe(true);
      expect(bounds.clipped).toBe(false);
    }
    const a = (await name.boundingBox())!;
    const b = (await portion.boundingBox())!;
    expect(a.y + a.height <= b.y + 1 || a.x + a.width <= b.x + 1).toBe(true);
  }
  await noOverflow(page);
  await page.reload();
  await expect(page.getByText(foods[0].portion, { exact: true }).first()).toBeVisible();
  await noOverflow(page);
}

async function dailySchedule(page: Page) {
  await page.goto("/onboarding");
  await page.getByLabel("Ad Soyad").fill("Görünüm Testi");
  await page.getByLabel("Doğum Tarihi").fill("1990-05-20");
  await page.getByRole("radio", { name: "Belirtmek istemiyorum" }).click();
  const next = () => page.getByRole("button", { name: /Devam/ }).click();
  await next();
  await page.getByLabel("Boy (cm)").fill("175");
  await page.getByLabel("Mevcut Kilo (kg)").fill("70");
  await page.getByLabel("Hedef Kilo (kg)").fill("65");
  await next();
  await page.getByRole("radio", { name: /Orta Aktif/ }).click();
  await next();
  await page.getByRole("button", { name: "Hastalığım yok", exact: true }).click();
  await page.getByRole("button", { name: "Alerjim yok", exact: true }).click();
  await next();
  await page.getByRole("radio", { name: /Her şey/ }).click();
  await next();
  await page.getByRole("radio", { name: /Gece vardiyası/ }).click();
  const wake = page.getByLabel("Genellikle kaçta uyanırsınız?", { exact: true });
  const sleep = page.getByLabel("Genellikle kaçta uyursunuz?", { exact: true });
  await expect(page.getByText(/Saatleri 24 saat biçiminde yazın/)).toBeVisible();
  await expect(wake).toHaveAttribute("type", "text");
  await expect(sleep).toHaveAttribute("type", "text");
  await expect(wake).toHaveAccessibleDescription(/24 saat.*SS:DD/);
  await wake.click();
  await expect(wake).toBeFocused();
  await wake.fill("24:00");
  await sleep.fill("12:60");
  const submit = page.getByRole("button", { name: "Tamamla", exact: true });
  await submit.click();
  await expect(wake).toHaveAttribute("aria-invalid", "true");
  await expect(sleep).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert")).toHaveCount(2);
  await wake.fill("17:00");
  await sleep.fill("09:00");
  await page.getByRole("button", { name: /Geri/ }).click();
  await next();
  await expect(wake).toHaveValue("17:00");
  await expect(sleep).toHaveValue("09:00");
  await sleep.press("Tab");
  await noOverflow(page);
  await submit.click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

for (const width of [360, 390, 412, 430]) {
  for (const theme of ["light", "dark"] as const) {
    test(`@mobile meal text wraps fully: ${width}px ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 915 });
      const calls = await setup(page, true, theme);
      await mealLayout(page);
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      expect(calls.unexpectedWrites).toEqual([]);
    });
    test(`@mobile daily schedule entry: ${width}px ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 915 });
      const calls = await setup(page, false, theme);
      await dailySchedule(page);
      expect(calls.submitted).toHaveLength(1);
      expect(calls.submitted[0]).toMatchObject({
        workScheduleType: "NIGHT_SHIFT",
        usualWakeTime: "17:00",
        usualSleepTime: "09:00",
        healthConditions: [],
        allergies: [],
      });
      expect(calls.unexpectedWrites).toEqual([]);
    });
  }
}

test("@desktop meal card keeps names and portions readable", async ({ page }) => {
  await setup(page, true, "light");
  await mealLayout(page);
});

test("@desktop schedule supports keyboard and valid 24-hour submission", async ({ page }) => {
  const calls = await setup(page, false, "dark");
  await dailySchedule(page);
  expect(calls.submitted[0]).toMatchObject({ usualWakeTime: "17:00", usualSleepTime: "09:00" });
});
