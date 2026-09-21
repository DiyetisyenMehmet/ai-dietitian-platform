import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const BASE_URL = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const EVIDENCE_DIR = path.resolve(process.cwd(), "e2e-artifacts/history-share-v2");

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const modes = [
  ["daily", "Günün Özeti"],
  ["weekly", "Haftanın Özeti"],
  ["monthly", "Ayın Özeti"],
  ["weekly-comparison", "Haftalık Karşılaştırma"],
  ["monthly-comparison", "Aylık Karşılaştırma"],
] as const;

test("renders all five Share V2 scenes at 390x844 without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const [mode, heading] of modes) {
    await page.goto(`${BASE_URL}/__history-share-validation/${mode}`);
    const dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
    const preview = dialog.getByRole("img", { name: new RegExp(heading) });

    await expect(dialog).toBeVisible();
    await expect(preview).toBeVisible();
    await expect(preview.getByText(heading, { exact: true })).toBeVisible();

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);

    if (mode === "weekly" || mode === "monthly") {
      await expect(preview.getByText(/Geçen hafta|Geçen ay/, { exact: false })).toHaveCount(0);
      await expect(preview.getByText("Fark", { exact: true })).toHaveCount(0);
    }
    if (mode === "weekly-comparison") {
      await expect(preview.getByText("Bu hafta", { exact: true }).first()).toBeVisible();
      await expect(preview.getByText("Geçen hafta", { exact: true }).first()).toBeVisible();
      await expect(preview.getByText("Fark", { exact: true }).first()).toBeVisible();
    }
    if (mode === "monthly-comparison") {
      await expect(preview.getByText("Bu ay", { exact: true }).first()).toBeVisible();
      await expect(preview.getByText("Geçen ay", { exact: true }).first()).toBeVisible();
      await expect(preview.getByText("Fark", { exact: true }).first()).toBeVisible();
    }

    await preview.screenshot({
      path: path.join(EVIDENCE_DIR, `${mode}-390x844.png`),
    });
  }
});

test("daily privacy defaults exclude optional content from the actual preview scene", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/__history-share-validation/daily`);

  const dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  const preview = dialog.getByRole("img", { name: /Günün Özeti/ });

  await expect(dialog.getByRole("checkbox", { name: /Kalori ve makrolar/ })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /^Su/ })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /Aktivite/ })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /Öğün isimleri/ })).not.toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /^Uyku/ })).not.toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /^Kilo/ })).not.toBeChecked();
  await expect(
    dialog.getByRole("checkbox", { name: /Diewish değerlendirmesi/ }),
  ).not.toBeChecked();

  await expect(preview.getByText(/Zeytinyağlı sebze/)).toHaveCount(0);
  await expect(preview.getByText("7 sa 32 dk", { exact: true })).toHaveCount(0);
  await expect(preview.getByText("70,2 kg", { exact: true })).toHaveCount(0);
  await expect(preview.getByText("Diewish değerlendirmesi", { exact: true })).toHaveCount(0);
});

test("all optional content wraps inside the scene and exports a real 1080x1920 PNG", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        const file = data.files?.[0];
        if (!file) throw new Error("PNG file missing");

        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        const chunk = 0x8000;
        for (let offset = 0; offset < bytes.length; offset += chunk) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
        }

        const bitmap = await createImageBitmap(file);
        (
          window as typeof window & {
            __historyShareCapture?: {
              base64: string;
              width: number;
              height: number;
              type: string;
              text: string;
            };
          }
        ).__historyShareCapture = {
          base64: btoa(binary),
          width: bitmap.width,
          height: bitmap.height,
          type: file.type,
          text: data.text ?? "",
        };
        bitmap.close();
      },
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/__history-share-validation/daily`);
  const dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });

  for (const name of ["Öğün isimleri", "Uyku", "Kilo", "Diewish değerlendirmesi"]) {
    await dialog.getByRole("checkbox", { name: new RegExp(name) }).check();
  }

  const preview = dialog.getByRole("img", { name: /Günün Özeti/ });
  await expect(preview.getByText(/Zeytinyağlı sebze/)).toBeVisible();
  await expect(preview.getByText("7 sa 32 dk", { exact: true })).toBeVisible();
  await expect(preview.getByText("70,2 kg", { exact: true })).toBeVisible();
  await expect(preview.getByText("Diewish değerlendirmesi", { exact: true })).toBeVisible();
  await preview.screenshot({ path: path.join(EVIDENCE_DIR, "daily-all-options-preview.png") });

  await dialog.getByRole("button", { name: "Görseli Paylaş" }).click();
  await page.waitForFunction(() =>
    Boolean(
      (window as typeof window & { __historyShareCapture?: unknown }).__historyShareCapture,
    ),
  );

  const capture = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __historyShareCapture: {
            base64: string;
            width: number;
            height: number;
            type: string;
            text: string;
          };
        }
      ).__historyShareCapture,
  );

  expect(capture.width).toBe(1080);
  expect(capture.height).toBe(1920);
  expect(capture.type).toBe("image/png");
  expect(capture.text).toContain("Diewish değerlendirmesi");
  expect(capture.text).toContain("Zeytinyağlı sebze");

  const png = Buffer.from(capture.base64, "base64");
  expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.length).toBeGreaterThan(25_000);
  fs.writeFileSync(path.join(EVIDENCE_DIR, "daily-all-options-1080x1920.png"), png);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 412, height: 915 },
]) {
  test(`share dialog remains usable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(`${BASE_URL}/__history-share-validation/daily`);

    const dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
    await expect(dialog).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);

    const visualMode = dialog.getByRole("button", { name: "Görsel olarak paylaş" });
    const textMode = dialog.getByRole("button", { name: "Yazı olarak paylaş" });
    await expect(visualMode).toHaveAttribute("aria-pressed", "true");
    await textMode.click();
    await expect(textMode).toHaveAttribute("aria-pressed", "true");
    await visualMode.click();

    const shareButton = dialog.getByRole("button", { name: "Görseli Paylaş" });
    await shareButton.scrollIntoViewIfNeeded();
    await expect(shareButton).toBeVisible();
    const box = await shareButton.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `dialog-${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    });
  });
}
