const { test, expect } = require("@playwright/test");

const WEB_BASE_URL = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const API_BASE_URL = process.env.E2E_API_BASE_URL || "http://127.0.0.1:4000/api";

test("register -> consent -> onboarding -> scanner -> same-day weigh-in preserves baseline", async ({
  page,
  request,
}) => {
  const email = `browser.e2e.${Date.now()}@example.com`;
  const password = "BrowserE2ePass123";

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
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });

  const loginResponse = await request.post(`${API_BASE_URL}/auth/login`, {
    data: { email, password },
  });
  const loginBody = await loginResponse.json();
  const token = loginBody.data.tokens.accessToken;
  const authHeaders = { Authorization: `Bearer ${token}` };

  const initialWeightResponse = await request.get(`${API_BASE_URL}/tracking/weight`, {
    headers: authHeaders,
  });
  const initialWeightBody = await initialWeightResponse.json();
  expect(initialWeightBody.data.logs).toHaveLength(1);
  expect(initialWeightBody.data.logs[0].note).toBe("Başlangıç");
  expect(initialWeightBody.data.logs[0].weightKg).toBe(70);

  await page.goto(`${WEB_BASE_URL}/meals/scan`);
  await expect(page.getByText("Besin & Barkod Tarayıcı")).toBeVisible();
  await page.getByRole("button", { name: /Fotoğraftan Tara/ }).click();

  const imagePath = require("node:path").join(__dirname, "fixtures", "kuru-fasulye.jpg");
  await page.locator('input[type="file"]').setInputFiles(imagePath);
  await page.getByRole("button", { name: /Görseli analiz et/ }).click();
  await expect(page.getByText("Kuru fasulye", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Malzemeleri Düzenle/ }).click();
  await page.getByLabel("Toplam porsiyon").fill("250");
  await page.getByRole("button", { name: /Yeniden hesapla/ }).click();
  await expect(page.getByText(/250 g tahmini\/düzeltilmiş porsiyon/)).toBeVisible();
  await expect(page.getByText("Bu porsiyonda sodyum miktarı dikkat gerektirecek düzeyde.")).toBeVisible();

  await page.goto(`${WEB_BASE_URL}/progress`);
  await expect(page.getByText("Kilo İlerlemen")).toBeVisible();
  await page.getByLabel("Kilo (kg)").fill("68.5");
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
