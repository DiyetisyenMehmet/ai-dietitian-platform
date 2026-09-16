const { test, expect } = require("@playwright/test");

const WEB_BASE_URL = process.env.E2E_WEB_BASE_URL;
const PREMIUM_EMAIL = process.env.KACAMAK_PREMIUM_EMAIL;
const PREMIUM_PASSWORD = process.env.KACAMAK_PREMIUM_PASSWORD;
const PREMIUM_PLAN_ID = process.env.KACAMAK_PREMIUM_PLAN_ID;
const FREE_EMAIL = process.env.KACAMAK_FREE_EMAIL;
const FREE_PASSWORD = process.env.KACAMAK_FREE_PASSWORD;
const FREE_PLAN_ID = process.env.KACAMAK_FREE_PLAN_ID;
const DOWNGRADED_EMAIL = process.env.KACAMAK_DOWNGRADED_EMAIL;
const DOWNGRADED_PASSWORD = process.env.KACAMAK_DOWNGRADED_PASSWORD;
const DOWNGRADED_PLAN_ID = process.env.KACAMAK_DOWNGRADED_PLAN_ID;
const DOWNGRADED_DEVIATION_ID = process.env.KACAMAK_DOWNGRADED_DEVIATION_ID;

for (const [name, value] of Object.entries({
  WEB_BASE_URL,
  PREMIUM_EMAIL,
  PREMIUM_PASSWORD,
  PREMIUM_PLAN_ID,
  FREE_EMAIL,
  FREE_PASSWORD,
  FREE_PLAN_ID,
  DOWNGRADED_EMAIL,
  DOWNGRADED_PASSWORD,
  DOWNGRADED_PLAN_ID,
  DOWNGRADED_DEVIATION_ID,
})) {
  if (!value) throw new Error(`Missing staging Kaçamak env: ${name}`);
}

async function loginToken(request, email, password) {
  const response = await request.post(`${WEB_BASE_URL}/api/auth/login`, {
    data: { email, password },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.success).toBe(true);
  return body.data.tokens.accessToken;
}

async function apiJson(request, method, path, token, data) {
  const response = await request[method](`${WEB_BASE_URL}/api${path}`, {
    headers: { authorization: `Bearer ${token}` },
    ...(data === undefined ? {} : { data }),
  });
  const body = response.status() === 204 ? null : await response.json();
  return { response, body };
}

async function openFirstKacamak(page) {
  const button = page.getByRole("button", { name: "Kaçamak ekle" }).first();
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByRole("button", { name: "Yemedim", exact: true }).first()).toBeVisible();
}

async function undoFirst(page) {
  const undo = page.getByRole("button", { name: "Geri al" }).first();
  await expect(undo).toBeVisible();
  await undo.click();
  await expect(page.getByText("Kaçamak kaydı kaldırıldı", { exact: true })).toBeVisible();
}

test.use({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/Istanbul" });

test("staging Kaçamak acceptance: four flows, persistence, undo, entitlement, IDOR and mobile layout", async ({ page, request }) => {
  test.setTimeout(180_000);

  await page.goto(`${WEB_BASE_URL}/login`);
  await page.getByLabel("E-posta").fill(PREMIUM_EMAIL);
  await page.getByLabel("Şifre", { exact: true }).fill(PREMIUM_PASSWORD);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
  await page.goto(`${WEB_BASE_URL}/meals/plan`);
  await expect(page.getByText("Öğün Planım", { exact: true })).toBeVisible();

  // Four product choices are visible and whole-meal is only under Yemedim.
  await openFirstKacamak(page);
  for (const label of ["Yemedim", "Değiştirdim", "Fazla Kaçtı", "Porsiyonu Değiştirdim"]) {
    await expect(page.getByRole("button", { name: label, exact: true }).first()).toBeVisible();
  }
  await page.getByRole("button", { name: "Yemedim", exact: true }).first().click();
  const skippedSelect = page.locator("label").filter({ hasText: "Neyi yemedin?" }).locator("select").first();
  await expect(skippedSelect.locator(`option[value="__WHOLE_MEAL__"]`)).toHaveCount(1);
  await skippedSelect.selectOption("0");
  await page.getByRole("button", { name: "Kaydet", exact: true }).first().click();
  await expect(page.getByText("Kaçamak kaydedildi. Planın devam ediyor.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Yemedim: Tam buğday ekmeği/)).toBeVisible();

  // Reload persistence.
  await page.reload();
  await expect(page.getByText(/Yemedim: Tam buğday ekmeği/)).toBeVisible();
  await undoFirst(page);

  // Whole-meal skip.
  await openFirstKacamak(page);
  await page.getByRole("button", { name: "Yemedim", exact: true }).first().click();
  const wholeSelect = page.locator("label").filter({ hasText: "Neyi yemedin?" }).locator("select").first();
  await wholeSelect.selectOption("__WHOLE_MEAL__");
  await page.getByRole("button", { name: "Kaydet", exact: true }).first().click();
  await expect(page.getByText(/Yemedim: Kahvaltı/)).toBeVisible();
  await undoFirst(page);

  // Replacement with reliable actual nutrition.
  await openFirstKacamak(page);
  await page.getByRole("button", { name: "Değiştirdim", exact: true }).first().click();
  await page.locator("label").filter({ hasText: "Hangi besin?" }).locator("select").first().selectOption("0");
  await page.getByPlaceholder("Örn. yoğurt").fill("Yoğurt");
  await page.getByPlaceholder("Örn. 2 dilim, 150 g").fill("150 g");
  await page.getByLabel("Gerçek kalori").fill("120");
  await page.getByLabel("Gerçek protein").fill("8");
  await page.getByLabel("Gerçek karbonhidrat").fill("10");
  await page.getByLabel("Gerçek yağ").fill("5");
  await page.getByRole("button", { name: "Kaydet", exact: true }).first().click();
  await expect(page.getByText(/Değiştirdim: Tam buğday ekmeği → Yoğurt/)).toBeVisible();

  const premiumToken = await loginToken(request, PREMIUM_EMAIL, PREMIUM_PASSWORD);
  const meals = await apiJson(request, "get", "/tracking/meals", premiumToken);
  expect(meals.response.status()).toBe(200);
  expect(meals.body.data.logs.some((item) => item.name === "Yoğurt" && item.calories === 120)).toBe(true);
  await undoFirst(page);

  // EXTRA.
  await openFirstKacamak(page);
  await page.getByRole("button", { name: "Fazla Kaçtı", exact: true }).first().click();
  await page.getByPlaceholder("Örn. bir dilim pasta").fill("Bir dilim pasta");
  await page.getByPlaceholder("Örn. 2 dilim, 150 g").fill("1 dilim");
  await page.getByLabel("Gerçek kalori").fill("250");
  await page.getByRole("button", { name: "Kaydet", exact: true }).first().click();
  await expect(page.getByText(/Fazla Kaçtı: Bir dilim pasta/)).toBeVisible();
  await undoFirst(page);

  // Portion change; zero is blocked client-side, positive amount saves.
  await openFirstKacamak(page);
  await page.getByRole("button", { name: "Porsiyonu Değiştirdim", exact: true }).first().click();
  await page.locator("label").filter({ hasText: "Hangi besin?" }).locator("select").first().selectOption("0");
  const portionInput = page.getByPlaceholder("Örn. 2 dilim, 150 g");
  await portionInput.fill("0 g");
  await expect(page.getByText("Miktar pozitif bir sayı ile başlamalıdır.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Kaydet", exact: true }).first()).toBeDisabled();
  await portionInput.fill("150 g");
  await page.getByRole("button", { name: "Kaydet", exact: true }).first().click();
  await expect(page.getByText(/Porsiyonu Değiştirdim: Tam buğday ekmeği → 150 g/)).toBeVisible();
  await undoFirst(page);

  // Future plan days expose the inactive product state.
  expect(await page.getByRole("button", { name: "Gün başlamadı" }).count()).toBeGreaterThan(0);

  // Long food names/mobile UI must not create horizontal overflow.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  // FREE backend create rejection.
  const freeToken = await loginToken(request, FREE_EMAIL, FREE_PASSWORD);
  const freeCreate = await apiJson(
    request,
    "post",
    `/nutrition-plans/${FREE_PLAN_ID}/deviations`,
    freeToken,
    {
      dayNumber: 1,
      mealIndex: 0,
      foodIndex: 0,
      scope: "FOOD",
      type: "SKIPPED",
      localDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date()),
    },
  );
  expect(freeCreate.response.status()).toBe(403);
  expect(freeCreate.body.error.code).toBe("SUBSCRIPTION_REQUIRED");

  // Simulated post-downgrade account can still READ and DELETE its historical record.
  const downgradedToken = await loginToken(request, DOWNGRADED_EMAIL, DOWNGRADED_PASSWORD);
  const downgradedRead = await apiJson(
    request,
    "get",
    `/nutrition-plans/${DOWNGRADED_PLAN_ID}/deviations`,
    downgradedToken,
  );
  expect(downgradedRead.response.status()).toBe(200);
  expect(downgradedRead.body.data.deviations.some((item) => item.id === DOWNGRADED_DEVIATION_ID)).toBe(true);
  const downgradedDelete = await apiJson(
    request,
    "delete",
    `/nutrition-plans/${DOWNGRADED_PLAN_ID}/deviations/${DOWNGRADED_DEVIATION_ID}`,
    downgradedToken,
  );
  expect(downgradedDelete.response.status()).toBe(204);

  // IDOR: a different authenticated user cannot read the Premium Plus plan.
  const idor = await apiJson(request, "get", `/nutrition-plans/${PREMIUM_PLAN_ID}/deviations`, freeToken);
  expect(idor.response.status()).toBe(404);
});
