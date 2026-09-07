const { test, expect } = require("@playwright/test");

const WEB_BASE_URL = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const API_BASE_URL = process.env.E2E_API_BASE_URL || "http://127.0.0.1:4000/api";

/**
 * Full-stack browser smoke for the first-run health-data path.
 *
 * The backend API already has direct integration tests. This browser layer is
 * deliberately focused on what those tests cannot prove: a real user can create
 * an account, grant only the three affirmative consents, complete every
 * onboarding step, persist a night-shift rhythm, then record a same-day weigh-in
 * without replacing the immutable onboarding baseline used by Progress.
 */
test("register -> consent -> onboarding -> same-day weigh-in preserves baseline", async ({
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
  await expect(page.getByRole("heading", { name: "Bilgilendirme ve onaylar" })).toBeVisible();

  // KVKK aydınlatması is informational, not an affirmative permission. The UI
  // must expose exactly the three mandatory consent checkboxes.
  const consentCheckboxes = page.getByRole("checkbox");
  await expect(consentCheckboxes).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    await consentCheckboxes.nth(index).click();
    await expect(consentCheckboxes.nth(index)).toBeChecked();
  }

  await page.getByRole("button", { name: "Onayla ve Devam Et" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByText("Adım 1 / 6")).toBeVisible();

  await page.getByLabel("Ad Soyad").fill("Browser E2E User");
  await page.getByLabel("Doğum Tarihi").fill("1990-05-20");
  await page.getByRole("radio", { name: "Belirtmek istemiyorum" }).click();
  await page.getByRole("button", { name: /Devam/ }).click();

  await expect(page.getByText("Adım 2 / 6")).toBeVisible();
  await page.getByLabel("Boy (cm)").fill("175");
  await page.getByLabel("Mevcut Kilo (kg)").fill("70");
  await page.getByLabel("Hedef Kilo (kg)").fill("65");
  await page.getByRole("button", { name: /Devam/ }).click();

  await expect(page.getByText("Adım 3 / 6")).toBeVisible();
  await page.getByRole("radio", { name: /Orta Aktif/ }).click();
  await page.getByRole("button", { name: /Devam/ }).click();

  await expect(page.getByText("Adım 4 / 6")).toBeVisible();
  await page.getByRole("button", { name: "Hastalığım yok" }).click();
  await page.getByRole("button", { name: "Alerjim yok" }).click();
  await page.getByRole("button", { name: /Devam/ }).click();

  await expect(page.getByText("Adım 5 / 6")).toBeVisible();
  await page.getByRole("radio", { name: /Her şey/ }).click();
  await page.getByLabel("Günlük Su Hedefi (ml)").fill("2500");
  await page.getByRole("button", { name: /Devam/ }).click();

  await expect(page.getByText("Adım 6 / 6")).toBeVisible();
  await page.getByRole("radio", { name: /Gece vardiyası/ }).click();
  await page.getByLabel("Genellikle kaçta uyanırsınız?").fill("17:00");
  await page.getByLabel("Genellikle kaçta uyursunuz?").fill("09:00");
  await page.getByRole("button", { name: "Tamamla" }).click();

  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });

  const session = await page.evaluate(() => {
    const raw = window.localStorage.getItem("diewish.auth.session");
    return raw ? JSON.parse(raw) : null;
  });
  expect(session).toBeTruthy();
  expect(session.user.onboardingCompleted).toBe(true);
  expect(session.tokens.accessToken).toBeTruthy();

  const authHeaders = { authorization: `Bearer ${session.tokens.accessToken}` };
  const profileResponse = await request.get(`${API_BASE_URL}/onboarding`, {
    headers: authHeaders,
  });
  expect(profileResponse.status()).toBe(200);

  const profileBody = await profileResponse.json();
  expect(profileBody.success).toBe(true);
  expect(profileBody.data.profile.workScheduleType).toBe("NIGHT_SHIFT");
  expect(profileBody.data.profile.usualWakeTime).toBe("17:00");
  expect(profileBody.data.profile.usualSleepTime).toBe("09:00");
  expect(profileBody.data.profile.currentWeightKg).toBe(70);
  expect(profileBody.data.profile.targetWeightKg).toBe(65);

  // The onboarding transaction creates an immutable 70 kg baseline. A second
  // weigh-in on the same calendar day must remain a separate measurement, update
  // currentWeightKg, and leave Progress calculating from the original 70 kg.
  await page.goto(`${WEB_BASE_URL}/progress`);
  await expect(page.getByText("Kilo İlerlemen")).toBeVisible();
  await expect(page.getByText("70.0", { exact: true }).first()).toBeVisible();

  await page.getByLabel("Bugünkü kilon (kg)").fill("68.5");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();

  await expect(page.getByText("68.5", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("70.0", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("65.0", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Hedefe 3,5 kg kaldı", { exact: true })).toBeVisible();

  const updatedProfileResponse = await request.get(`${API_BASE_URL}/onboarding`, {
    headers: authHeaders,
  });
  expect(updatedProfileResponse.status()).toBe(200);
  const updatedProfileBody = await updatedProfileResponse.json();
  expect(updatedProfileBody.success).toBe(true);
  expect(updatedProfileBody.data.profile.currentWeightKg).toBe(68.5);
  expect(updatedProfileBody.data.profile.targetWeightKg).toBe(65);

  const weightResponse = await request.get(`${API_BASE_URL}/tracking/weight`, {
    headers: authHeaders,
  });
  expect(weightResponse.status()).toBe(200);
  const weightBody = await weightResponse.json();
  expect(weightBody.success).toBe(true);
  expect(weightBody.data.logs).toHaveLength(2);

  const baseline = weightBody.data.logs.find((log) => log.note === "Başlangıç");
  expect(baseline).toBeTruthy();
  expect(baseline.weightKg).toBe(70);

  const current = weightBody.data.logs.find((log) => log.note !== "Başlangıç");
  expect(current).toBeTruthy();
  expect(current.weightKg).toBe(68.5);
});
