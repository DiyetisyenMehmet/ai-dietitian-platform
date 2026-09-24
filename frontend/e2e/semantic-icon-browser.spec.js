const { test, expect } = require("@playwright/test");

const WEB_BASE_URL = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";

test.use({ viewport: { width: 390, height: 844 } });

async function onboard(page) {
  const email = `semantic.icons.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;
  const password = "SemanticIconsPass123";

  await page.goto(`${WEB_BASE_URL}/register`);
  await page.getByLabel("Ad Soyad").fill("Semantic Icon User");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.getByLabel("Şifre (Tekrar)").fill(password);
  await page.getByRole("button", { name: "Hesap Oluştur" }).click();

  await expect(page).toHaveURL(/\/consent$/);
  const consentCheckboxes = page.getByRole("checkbox");
  for (let index = 0; index < 3; index += 1) await consentCheckboxes.nth(index).click();
  await page.getByRole("button", { name: "Onayla ve Devam Et" }).click();

  await page.getByLabel("Ad Soyad").fill("Semantic Icon User");
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

async function expectNoOverflow(page) {
  await expect.poll(() =>
    page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  ).toBe(true);
}

async function expectHealthySemanticImages(page) {
  const result = await page.locator("img[data-diewish-semantic-icon]").evaluateAll((images) =>
    images.map((image) => {
      const rect = image.getBoundingClientRect();
      return {
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        width: rect.width,
        height: rect.height,
        objectFit: getComputedStyle(image).objectFit,
      };
    }),
  );
  expect(result.length).toBeGreaterThan(0);
  for (const item of result) {
    expect(item.naturalWidth).toBe(1536);
    expect(item.naturalHeight).toBe(1536);
    expect(item.width).toBeGreaterThan(0);
    expect(item.height).toBeGreaterThan(0);
    expect(Math.abs(item.width - item.height)).toBeLessThanOrEqual(1);
    expect(item.objectFit).toBe("contain");
  }
}

async function checkViewports(page) {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 412, height: 915 },
  ]) {
    await page.setViewportSize(viewport);
    await expectNoOverflow(page);
    await expectHealthySemanticImages(page);
  }
}

test("semantic Diewish icons keep coach, History and progress meanings distinct", async ({ page }) => {
  test.setTimeout(180_000);
  await onboard(page);

  await page.route("**/api/ai-chat/conversations**", async (route) => {
    const url = new URL(route.request().url());
    const base = {
      id: "semantic-conv",
      title: "Semantik ikon testi",
      pinnedAt: null,
      createdAt: "2026-09-24T09:00:00.000Z",
      updatedAt: "2026-09-24T09:01:00.000Z",
    };
    if (url.pathname.endsWith("/semantic-conv")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            conversation: {
              ...base,
              messages: [{
                id: "assistant-semantic",
                role: "ASSISTANT",
                content: "Koç avatarı semantik test yanıtı.",
                createdAt: "2026-09-24T09:01:00.000Z",
              }],
            },
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { conversations: [base] } }),
    });
  });

  await page.goto(`${WEB_BASE_URL}/ai`);
  await expect(page.getByText("Diewish Koç", { exact: true })).toBeVisible();
  await expect(page.getByText("Koç avatarı semantik test yanıtı.", { exact: true })).toBeVisible();
  await expect(page.locator('img[data-diewish-semantic-icon="coach-avatar"]')).toHaveCount(2);

  const quickButton = page.getByRole("button", { name: "Hızlı öneriler", exact: true });
  await expect(quickButton).toBeVisible();
  await expect(quickButton.locator('img[data-diewish-semantic-icon="quick-suggestions"]')).toBeVisible();
  await quickButton.click();
  const quickDialog = page.getByRole("dialog", { name: "Hızlı öneriler" });
  await expect(quickDialog).toBeVisible();
  await expect(quickDialog.locator('img[data-diewish-semantic-icon="quick-suggestions"]')).toBeVisible();

  const coachNav = page.getByRole("link", { name: "Koç", exact: true });
  await expect(coachNav.locator("svg.lucide-leaf")).toHaveCount(1);
  await expect(coachNav.locator('img[data-diewish-semantic-icon="coach-avatar"]')).toHaveCount(0);
  await quickDialog.getByRole("button", { name: "Kapat" }).click();
  await checkViewports(page);

  await page.getByRole("button", { name: "Koyu temaya geç" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await checkViewports(page);

  await page.goto(`${WEB_BASE_URL}/progress`);
  const dates = await page.evaluate(() => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const key = (value) =>
      `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    return { today: key(today), yesterday: key(yesterday) };
  });

  const weightInput = page.getByLabel("Kilo (kg)");
  const dateInput = page.getByLabel("Ölçüm tarihi");
  await weightInput.fill("69,8");
  await dateInput.fill(dates.yesterday);
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(weightInput).toHaveValue("", { timeout: 15_000 });
  await weightInput.fill("69,4");
  await dateInput.fill(dates.today);
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(weightInput).toHaveValue("", { timeout: 15_000 });

  const progressEvaluation = page.locator("section").filter({ hasText: "Hedef kiloya ilerleme" }).first();
  await expect(progressEvaluation.locator('img[data-diewish-semantic-icon="evaluation"]')).toBeVisible();

  const weightAnalysis = page
    .locator("section")
    .filter({ hasText: "Bu hafta" })
    .filter({ hasText: "Hedef tamamlanma" })
    .first();
  await expect(weightAnalysis.locator('img[data-diewish-semantic-icon="weight-analysis"]')).toBeVisible();
  await expect(weightAnalysis.locator('img[data-diewish-semantic-icon="evaluation"]')).toBeVisible();
  await checkViewports(page);

  await page.goto(`${WEB_BASE_URL}/ai`);
  await page.getByRole("button", { name: "Açık temaya geç" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await page.route("**/api/history/insight", async (route) => {
    const payload = route.request().postDataJSON();
    const scope = payload.scope || "DAY";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          insight: {
            scope,
            periodKey: payload.date || payload.referenceDate || "semantic",
            timezone: payload.timezone || "UTC",
            content: { text: "Semantik ikon değerlendirmesi." },
            generatedBy: "FALLBACK",
            cacheStatus: "BYPASS",
            provider: null,
            model: null,
            generatedAt: "2026-09-24T12:00:00.000Z",
          },
        },
      }),
    });
  });

  await page.goto(`${WEB_BASE_URL}/history`);
  await expect(
    page.locator("section").filter({ hasText: "Günlük Değerlendirme" }).first()
      .locator('img[data-diewish-semantic-icon="evaluation"]'),
  ).toBeVisible();

  await page.getByRole("button", { name: "Haftalık", exact: true }).click();
  await expect(
    page.locator("section").filter({ hasText: "Haftalık Değerlendirme" }).first()
      .locator('img[data-diewish-semantic-icon="evaluation"]'),
  ).toBeVisible();

  await page.getByRole("button", { name: "Aylık", exact: true }).click();
  await expect(
    page.locator("section").filter({ hasText: "Aylık Değerlendirme" }).first()
      .locator('img[data-diewish-semantic-icon="evaluation"]'),
  ).toBeVisible();

  await page.getByRole("button", { name: "Ayı paylaş" }).click();
  const shareDialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await shareDialog.getByRole("checkbox", { name: /^Değerlendirme/ }).check();
  await shareDialog.getByRole("button", { name: "Önizlemeyi Aç" }).click();
  const sharePreview = page.getByRole("dialog", { name: "Görsel paylaşım önizlemesi" });
  await expect(sharePreview.locator('img[data-diewish-semantic-icon="evaluation"]')).toHaveCount(2);
  await checkViewports(page);
});
