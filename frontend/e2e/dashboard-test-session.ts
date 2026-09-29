import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const DASHBOARD_WEB_BASE_URL =
  process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";

const API_BASE_URL =
  process.env.E2E_API_BASE_URL || "http://127.0.0.1:4000/api";
const PASSWORD = "DashboardBrowserPass123";

async function postJson(
  request: APIRequestContext,
  path: string,
  data: unknown,
  token?: string,
) {
  const response = await request.post(`${API_BASE_URL}${path}`, {
    data,
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  const text = response.status() === 204 ? "" : await response.text();
  return { response, body: text ? JSON.parse(text) : null };
}

async function grantRequiredConsents(request: APIRequestContext, token: string) {
  for (const type of [
    "TERMS_OF_SERVICE",
    "MEDICAL_DISCLAIMER",
    "KVKK_EXPLICIT_CONSENT",
  ]) {
    const result = await postJson(request, "/legal/consents", { type }, token);
    expect(result.response.status()).toBe(200);
    expect(result.body?.success).toBe(true);
  }
}

export async function createDashboardSession(
  page: Page,
  request: APIRequestContext,
) {
  const runId = `${Date.now()}.${Math.random().toString(16).slice(2)}`;
  const email = `dashboard.browser.${runId}@example.com`;
  const fullName = "Dashboard Browser User";

  const registration = await postJson(request, "/auth/register", {
    email,
    password: PASSWORD,
    fullName,
  });
  expect(registration.response.status()).toBe(201);
  expect(registration.body?.success).toBe(true);

  const token = registration.body?.data?.tokens?.accessToken;
  expect(typeof token).toBe("string");
  await grantRequiredConsents(request, token);

  const onboarding = await postJson(
    request,
    "/onboarding",
    {
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
    token,
  );
  expect(onboarding.response.status()).toBe(200);
  expect(onboarding.body?.success).toBe(true);

  await page.goto(`${DASHBOARD_WEB_BASE_URL}/login`);
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });

  return { email, fullName };
}

export async function setDashboardTheme(
  page: Page,
  theme: "light" | "dark",
) {
  const html = page.locator("html");
  const isDark = await html.evaluate((element) =>
    element.classList.contains("dark"),
  );

  if (theme === "dark" && !isDark) {
    await page.getByRole("button", { name: "Koyu temaya geç" }).click();
    await expect(html).toHaveClass(/dark/);
  } else if (theme === "light" && isDark) {
    await page.getByRole("button", { name: "Açık temaya geç" }).click();
    await expect(html).not.toHaveClass(/dark/);
  }
}
