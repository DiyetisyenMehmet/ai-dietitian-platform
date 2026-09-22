import { expect, test, type Page } from "@playwright/test";

const validationPath = "/history-final-recovery-validation";

async function openVisualPreview(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Önizlemeyi Aç" }).click();

  const preview = page.getByRole("dialog", { name: "Görsel paylaşım önizlemesi" });
  await expect(preview).toBeVisible();
  await expect(preview.getByTestId("history-share-motivation")).toBeVisible();
  return preview;
}

test("390x844 light layout has no overflow and caption toggle is visual-only", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("theme", "light"));
  await page.goto(validationPath);

  const dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  const caption = dialog.getByRole("checkbox", { name: "Paylaşım mesajı ekle" });
  await expect(caption).toBeVisible();
  await expect(caption).not.toBeChecked();

  await dialog.getByRole("button", { name: "Yazı olarak paylaş" }).click();
  await expect(dialog.getByRole("checkbox", { name: "Paylaşım mesajı ekle" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Görsel olarak paylaş" }).click();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);

  await openVisualPreview(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("412x915 dark layout keeps the share preview usable", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  await page.goto(validationPath);

  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
    .toBe(true);

  const preview = await openVisualPreview(page);
  await expect(preview.getByText("Yalnız seçtiğin kayıtlar paylaşılır.")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("Web Share caption OFF sends a PNG without a text field", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        (
          window as Window & {
            __shareRecord?: {
              hasText: boolean;
              text: string | null;
              fileCount: number;
              fileType: string | null;
            };
          }
        ).__shareRecord = {
          hasText: Object.prototype.hasOwnProperty.call(data, "text"),
          text: data.text ?? null,
          fileCount: data.files?.length ?? 0,
          fileType: data.files?.[0]?.type ?? null,
        };
      },
    });
  });

  await page.goto(validationPath);
  const preview = await openVisualPreview(page);
  await preview.getByRole("button", { name: "Paylaş" }).click();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __shareRecord?: { hasText: boolean; text: string | null; fileCount: number };
            }
          ).__shareRecord ?? null,
      ),
    )
    .not.toBeNull();

  const record = await page.evaluate(
    () =>
      (
        window as unknown as {
          __shareRecord: {
            hasText: boolean;
            text: string | null;
            fileCount: number;
            fileType: string | null;
          };
        }
      ).__shareRecord,
  );

  expect(record).toMatchObject({
    hasText: false,
    text: null,
    fileCount: 1,
    fileType: "image/png",
  });
});

test("Web Share caption ON sends only the short Diewish caption with the PNG", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        (
          window as Window & {
            __shareRecord?: { hasText: boolean; text: string | null; fileCount: number };
          }
        ).__shareRecord = {
          hasText: Object.prototype.hasOwnProperty.call(data, "text"),
          text: data.text ?? null,
          fileCount: data.files?.length ?? 0,
        };
      },
    });
  });

  await page.goto(validationPath);
  const dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await dialog.getByRole("checkbox", { name: "Paylaşım mesajı ekle" }).check();

  const preview = await openVisualPreview(page);
  await preview.getByRole("button", { name: "Paylaş" }).click();

  const record = await page.evaluate(
    () =>
      (
        window as unknown as {
          __shareRecord: { hasText: boolean; text: string | null; fileCount: number };
        }
      ).__shareRecord,
  );

  expect(record.hasText).toBe(true);
  expect(record.fileCount).toBe(1);
  expect(record.text?.startsWith("Diewish ile ilerlememi takip ediyorum.")).toBe(true);
  expect(Array.from(record.text ?? "").length).toBeLessThanOrEqual(140);
  expect(record.text ?? "").not.toMatch(/kcal|kg|uyku|öğün/i);
});

test("Android bridge receives empty text OFF and short caption ON", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { DiewishShare: unknown }).DiewishShare = {
      isAvailable: () => true,
      shareText: () => undefined,
      sharePng: (_base64: string, _filename: string, text: string) => {
        (window as Window & { __nativeText?: string }).__nativeText = text;
      },
    };
  });

  await page.goto(validationPath);
  let preview = await openVisualPreview(page);
  await preview.getByRole("button", { name: "Paylaş" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as Window & { __nativeText?: string }).__nativeText),
    )
    .toBe("");

  await page.goto(validationPath);
  const dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await dialog.getByRole("checkbox", { name: "Paylaşım mesajı ekle" }).check();
  preview = await openVisualPreview(page);
  await preview.getByRole("button", { name: "Paylaş" }).click();

  const caption = await page.evaluate(
    () => (window as Window & { __nativeText?: string }).__nativeText ?? "",
  );
  expect(caption.startsWith("Diewish ile ilerlememi takip ediyorum.")).toBe(true);
  expect(Array.from(caption).length).toBeLessThanOrEqual(140);
});
