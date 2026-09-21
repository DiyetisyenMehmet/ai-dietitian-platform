const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const BASE = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const OUT = path.join(process.cwd(), "test-results", "history-share-v2-evidence");

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
});

async function openScenario(page, scenario) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
  });
  await page.goto(`${BASE}/history-share-validation/${scenario}`);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("img", { name: /Diewish paylaşım görseli önizlemesi/ })).toBeVisible();
}

async function assertNoHorizontalOverflow(page) {
  const result = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(result.documentWidth).toBeLessThanOrEqual(result.viewport);
  expect(result.bodyWidth).toBeLessThanOrEqual(result.viewport);
}

async function exportPng(page, scenario) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Görseli Paylaş" }).click();
  const download = await downloadPromise;
  const target = path.join(OUT, `${scenario}-export.png`);
  await download.saveAs(target);
  expect(fs.statSync(target).size).toBeGreaterThan(20_000);
  return target;
}

for (const scenario of ["daily", "weekly", "monthly", "weekly-comparison", "monthly-comparison"]) {
  test(`${scenario} Share V2 renders and exports`, async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await openScenario(page, scenario);
    const preview = page.getByRole("img", { name: /Diewish paylaşım görseli önizlemesi/ });
    await assertNoHorizontalOverflow(page);

    const text = await preview.innerText();
    if (scenario === "daily") expect(text).toContain("Günün Özeti");
    if (scenario === "weekly") {
      expect(text).toContain("Haftanın Özeti");
      expect(text).not.toContain("Geçen hafta");
      expect(text).not.toContain("Fark");
    }
    if (scenario === "monthly") {
      expect(text).toContain("Ayın Özeti");
      expect(text).not.toContain("Geçen ay");
      expect(text).not.toContain("Fark");
    }
    if (scenario === "weekly-comparison") {
      expect(text).toContain("Haftalık Karşılaştırma");
      expect(text).toContain("Bu hafta");
      expect(text).toContain("Geçen hafta");
      expect(text).toContain("Fark");
    }
    if (scenario === "monthly-comparison") {
      expect(text).toContain("Aylık Karşılaştırma");
      expect(text).toContain("Bu ay");
      expect(text).toContain("Geçen ay");
      expect(text).toContain("Fark");
    }

    await preview.screenshot({ path: path.join(OUT, `${scenario}-preview.png`) });
    await exportPng(page, scenario);
  });
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 412, height: 915 },
]) {
  test(`daily dialog fits ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openScenario(page, "daily");
    await assertNoHorizontalOverflow(page);

    const dialog = page.getByRole("dialog");
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(page.getByRole("button", { name: "Görsel olarak paylaş" })).toBeVisible();
    expect(page.getByRole("button", { name: "Yazı olarak paylaş" })).toBeVisible();
    expect(page.getByRole("button", { name: "Görseli Paylaş" })).toBeVisible();

    await page.screenshot({
      path: path.join(OUT, `daily-dialog-${viewport.width}x${viewport.height}.png`),
      fullPage: false,
    });
  });
}

test("privacy-off data is absent until explicitly enabled and markup never executes", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await openScenario(page, "daily");
  const preview = page.getByRole("img", { name: /Diewish paylaşım görseli önizlemesi/ });

  await expect(preview).not.toContainText("Zeytinyağlı sebzeli");
  await expect(preview).not.toContainText("72,4 kg");
  await expect(preview).not.toContainText("Diewish değerlendirmesi");

  await page.getByLabel("Öğün isimleri").check();
  await page.getByLabel("Kilo").check();
  await page.getByLabel("Diewish değerlendirmesi").check();

  await expect(preview).toContainText("Zeytinyağlı sebzeli");
  await expect(preview).toContainText("72,4 kg");
  await expect(preview).toContainText("Diewish değerlendirmesi");
  expect(await preview.locator("script").count()).toBe(0);
  expect(await preview.locator("img[onerror]").count()).toBe(0);
  expect(await page.evaluate(() => window.__HISTORY_XSS__)).toBeUndefined();
  await preview.screenshot({ path: path.join(OUT, "daily-all-optional-preview.png") });
  await exportPng(page, "daily-all-optional");
});
