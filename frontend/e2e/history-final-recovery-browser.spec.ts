import { expect, test, type Page } from "@playwright/test";

const WEB_BASE_URL = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const VALIDATION_URL = `${WEB_BASE_URL}/history-final-recovery-validation`;
const CAPTION_PREFIX = "Diewish ile ilerlememi takip ediyorum.";

test.use({ timezoneId: "Europe/Istanbul" });

async function openHistory(
  page: Page,
  width: number,
  height: number,
  theme: "light" | "dark",
) {
  await page.setViewportSize({ width, height });
  await page.addInitScript((selectedTheme) => {
    window.localStorage.setItem("theme", selectedTheme);
  }, theme);
  await page.goto(VALIDATION_URL);

  await expect(page.getByRole("heading", { name: "Geçmişim" })).toBeVisible();
  if (theme === "dark") {
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(true);
  } else {
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(false);
  }

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

async function openVisualPreview(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Önizlemeyi Aç" }).click();

  const preview = page.getByRole("dialog", { name: "Görsel paylaşım önizlemesi" });
  await expect(preview).toBeVisible();
  await expect(preview.getByTestId("history-share-motivation")).toBeVisible();
  await expect(preview.locator('[data-history-share-capture-root="true"]')).toBeVisible();
  return preview;
}

async function assertComparisonDateUx(page: Page) {
  await page.getByRole("button", { name: "Karşılaştır" }).click();

  const current = page.getByTestId("history-comparison-current-period");
  const previous = page.getByTestId("history-comparison-previous-period");

  await expect(current).toContainText("Bu hafta:");
  await expect(current).toContainText("14–20 Eylül 2026");
  await expect(previous).toContainText("Geçen hafta:");
  await expect(previous).toContainText("7–13 Eylül 2026");

  const weeklyCurrentBox = await current.boundingBox();
  const weeklyPreviousBox = await previous.boundingBox();
  expect(weeklyCurrentBox).not.toBeNull();
  expect(weeklyPreviousBox).not.toBeNull();
  expect((weeklyPreviousBox?.y ?? 0) > (weeklyCurrentBox?.y ?? 0)).toBe(true);

  await page.getByRole("button", { name: "Aylık karşılaştırma" }).click();

  await expect(current).toContainText("Bu ay:");
  await expect(current).toContainText("1–22 Eylül 2026");
  await expect(previous).toContainText("Geçen ay:");
  await expect(previous).toContainText("1–22 Ağustos 2026");

  const monthlyCurrentBox = await current.boundingBox();
  const monthlyPreviousBox = await previous.boundingBox();
  expect(monthlyCurrentBox).not.toBeNull();
  expect(monthlyPreviousBox).not.toBeNull();
  expect((monthlyPreviousBox?.y ?? 0) > (monthlyCurrentBox?.y ?? 0)).toBe(true);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);

  const shareButton = page.getByRole("button", { name: "Karşılaştırmayı paylaş" });
  await expect(shareButton).toBeEnabled();
  await shareButton.click();

  const dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /Paylaşım mesajı ekle/ })).not.toBeChecked();

  const preview = await openVisualPreview(page);
  const motivation = preview.getByTestId("history-share-motivation");
  await expect(motivation).toBeVisible();
  expect((await motivation.innerText()).length).toBeLessThanOrEqual(190);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

for (const scenario of [
  { name: "390x844 LIGHT", width: 390, height: 844, theme: "light" as const },
  { name: "390x844 DARK", width: 390, height: 844, theme: "dark" as const },
  { name: "412x915 LIGHT", width: 412, height: 915, theme: "light" as const },
  { name: "412x915 DARK", width: 412, height: 915, theme: "dark" as const },
]) {
  test(`${scenario.name} renders full comparison dates and stable share layout`, async ({
    page,
  }) => {
    await openHistory(page, scenario.width, scenario.height, scenario.theme);
    await assertComparisonDateUx(page);
  });
}

test("privacy defaults do not leak weight, sleep, meal names or AI into visual share", async ({
  page,
}) => {
  await openHistory(page, 390, 844, "light");

  const dailyEvaluation = page.getByRole("heading", {
    name: "Diewish Günlük Değerlendirmesi",
  });
  await expect(dailyEvaluation).toBeVisible();
  const evaluationCard = dailyEvaluation.locator("xpath=ancestor::section[1]");
  await expect(evaluationCard.locator('[data-diewish-history-mark="leaf"]')).toHaveCount(1);
  await expect(evaluationCard.getByText("AI", { exact: true })).toHaveCount(0);

  const shareButton = page.getByRole("button", { name: "Günü paylaş" });
  await expect(shareButton).toBeEnabled();
  await shareButton.click();

  const dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await expect(dialog.getByRole("checkbox", { name: /Öğün isimleri/ })).not.toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /Uyku/ })).not.toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /Kilo/ })).not.toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /Diewish değerlendirmesi/ })).not.toBeChecked();

  const preview = await openVisualPreview(page);
  const capture = preview.locator('[data-history-share-capture-root="true"]');
  const rendered = await capture.innerText();

  expect(rendered).not.toContain("PRIVATE_MEAL_SENTINEL");
  expect(rendered).not.toContain("PRIVATE_AI_SENTINEL");
  expect(rendered).not.toContain("91,7 kg");
  expect(rendered).not.toContain("8 sa");
  expect(rendered).not.toContain("Uyku");
  expect(rendered).not.toContain("Kilo");
  expect(rendered).not.toContain("Yalnız seçtiğin kayıtlar paylaşılır.");
  await expect(capture.locator('[data-diewish-history-mark="leaf"]')).toHaveCount(1);

  const motivation = await preview.getByTestId("history-share-motivation").innerText();
  expect(motivation).not.toMatch(/PRIVATE_|91[,.]7|uyku|kilo/i);
});

test("Web Share caption OFF sends PNG with no text field or History body", async ({ page }) => {
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

  await openHistory(page, 390, 844, "light");
  await page.getByRole("button", { name: "Günü paylaş" }).click();
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

test("Web Share caption ON sends only the short generic Diewish caption with PNG", async ({
  page,
}) => {
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

  await openHistory(page, 390, 844, "light");
  await page.getByRole("button", { name: "Günü paylaş" }).click();

  const dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await dialog.getByRole("checkbox", { name: /Paylaşım mesajı ekle/ }).check();

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

  expect(record.hasText).toBe(true);
  expect(record.fileCount).toBe(1);
  expect(record.fileType).toBe("image/png");
  expect(record.text?.startsWith(CAPTION_PREFIX)).toBe(true);
  expect(Array.from(record.text ?? "").length).toBeLessThanOrEqual(140);
  expect(record.text ?? "").not.toMatch(/kcal|kg|uyku|öğün|PRIVATE_|Ortalama Kalori/i);
});

test("text share keeps the privacy-filtered History text contract", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        (
          window as Window & {
            __textShareRecord?: { text: string | null; fileCount: number };
          }
        ).__textShareRecord = {
          text: data.text ?? null,
          fileCount: data.files?.length ?? 0,
        };
      },
    });
  });

  await openHistory(page, 390, 844, "light");
  await page.getByRole("button", { name: "Günü paylaş" }).click();

  const dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await dialog.getByRole("button", { name: "Yazı olarak paylaş" }).click();
  await expect(dialog.getByRole("checkbox", { name: /Paylaşım mesajı ekle/ })).toHaveCount(0);

  const previewText = await dialog.locator("pre").innerText();
  expect(previewText).toContain("Diewish gün özetim");
  expect(previewText).toContain("Kalori:");
  expect(previewText).not.toContain("PRIVATE_MEAL_SENTINEL");
  expect(previewText).not.toContain("PRIVATE_AI_SENTINEL");
  expect(previewText).not.toContain("91,7 kg");
  expect(previewText).not.toContain("Uyku:");

  await dialog.getByRole("button", { name: "Yazıyı Paylaş" }).click();

  const record = await page.evaluate(
    () =>
      (
        window as unknown as {
          __textShareRecord: { text: string | null; fileCount: number };
        }
      ).__textShareRecord,
  );
  expect(record.fileCount).toBe(0);
  expect(record.text).toContain("Diewish gün özetim");
  expect(record.text ?? "").not.toMatch(/PRIVATE_MEAL_SENTINEL|PRIVATE_AI_SENTINEL|91[,.]7 kg|Uyku:/);
});

test("Android bridge contract browser-mock keeps visual caption opt-in", async ({ page }) => {
  await page.addInitScript(() => {
    (
      window as unknown as {
        DiewishShare: {
          isAvailable(): boolean;
          sharePng(base64Png: string, filename: string, text: string): void;
          shareText(text: string, title: string): void;
        };
      }
    ).DiewishShare = {
      isAvailable: () => true,
      shareText: () => undefined,
      sharePng: (base64Png: string, filename: string, text: string) => {
        (
          window as Window & {
            __nativeRecord?: { base64Length: number; filename: string; text: string };
          }
        ).__nativeRecord = { base64Length: base64Png.length, filename, text };
      },
    };
  });

  await openHistory(page, 390, 844, "light");
  await page.getByRole("button", { name: "Günü paylaş" }).click();

  let preview = await openVisualPreview(page);
  await preview.getByRole("button", { name: "Paylaş" }).click();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __nativeRecord?: { base64Length: number; filename: string; text: string };
            }
          ).__nativeRecord ?? null,
      ),
    )
    .not.toBeNull();

  let record = await page.evaluate(
    () =>
      (
        window as unknown as {
          __nativeRecord: { base64Length: number; filename: string; text: string };
        }
      ).__nativeRecord,
  );
  expect(record.base64Length).toBeGreaterThan(1000);
  expect(record.filename).toMatch(/\.png$/);
  expect(record.text).toBe("");

  await page.goto(VALIDATION_URL);
  await expect(page.getByRole("button", { name: "Günü paylaş" })).toBeEnabled();
  await page.getByRole("button", { name: "Günü paylaş" }).click();

  const dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await dialog.getByRole("checkbox", { name: /Paylaşım mesajı ekle/ }).check();
  preview = await openVisualPreview(page);
  await preview.getByRole("button", { name: "Paylaş" }).click();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __nativeRecord?: { base64Length: number; filename: string; text: string };
            }
          ).__nativeRecord ?? null,
      ),
    )
    .not.toBeNull();

  record = await page.evaluate(
    () =>
      (
        window as unknown as {
          __nativeRecord: { base64Length: number; filename: string; text: string };
        }
      ).__nativeRecord,
  );
  expect(record.base64Length).toBeGreaterThan(1000);
  expect(record.filename).toMatch(/\.png$/);
  expect(record.text.startsWith(CAPTION_PREFIX)).toBe(true);
  expect(Array.from(record.text).length).toBeLessThanOrEqual(140);
  expect(record.text).not.toMatch(/kcal|kg|uyku|öğün|PRIVATE_/i);
});


async function configureCustomComparison(
  page: Page,
  ranges = {
    period1Start: "2026-08-01",
    period1End: "2026-08-07",
    period2Start: "2026-09-01",
    period2End: "2026-09-07",
  },
) {
  await page.getByRole("button", { name: "Karşılaştır" }).click();
  await page.getByRole("button", { name: "Özel karşılaştırma" }).click();

  await page.getByLabel("1. dönem başlangıç").fill(ranges.period1Start);
  await page.getByLabel("1. dönem bitiş").fill(ranges.period1End);
  await page.getByLabel("2. dönem başlangıç").fill(ranges.period2Start);
  await page.getByLabel("2. dönem bitiş").fill(ranges.period2End);
  await page.getByRole("button", { name: "Özel karşılaştırmayı uygula" }).click();
}

async function assertCustomComparisonReady(page: Page) {
  const current = page.getByTestId("history-comparison-current-period");
  const previous = page.getByTestId("history-comparison-previous-period");

  await expect(current).toContainText("1. dönem:");
  await expect(current).toContainText("1–7 Ağustos 2026");
  await expect(previous).toContainText("2. dönem:");
  await expect(previous).toContainText("1–7 Eylül 2026");

  const currentBox = await current.boundingBox();
  const previousBox = await previous.boundingBox();
  expect(currentBox).not.toBeNull();
  expect(previousBox).not.toBeNull();
  expect((previousBox?.y ?? 0) > (currentBox?.y ?? 0)).toBe(true);

  const comparison = page.getByRole("region", { name: "Dönem karşılaştırması" });
  await expect(comparison).toBeVisible();
  await expect(comparison).toContainText("1. dönem");
  await expect(comparison).toContainText("2. dönem");
  await expect(comparison).toContainText("Fark");

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

for (const scenario of [
  { name: "390x844 LIGHT", width: 390, height: 844, theme: "light" as const },
  { name: "390x844 DARK", width: 390, height: 844, theme: "dark" as const },
  { name: "412x915 LIGHT", width: 412, height: 915, theme: "light" as const },
  { name: "412x915 DARK", width: 412, height: 915, theme: "dark" as const },
]) {
  test(`CUSTOM ${scenario.name} keeps controls, full dates, metrics and share preview stable`, async ({
    page,
  }) => {
    await openHistory(page, scenario.width, scenario.height, scenario.theme);
    await configureCustomComparison(page);
    await assertCustomComparisonReady(page);

    const controls = page.getByTestId("history-custom-comparison-controls");
    await expect(controls).toBeVisible();

    const shareButton = page.getByRole("button", { name: "Karşılaştırmayı paylaş" });
    await expect(shareButton).toBeEnabled();
    await shareButton.click();

    const dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
    await expect(dialog.getByRole("checkbox", { name: /Paylaşım mesajı ekle/ })).not.toBeChecked();

    const preview = await openVisualPreview(page);
    await expect(
      preview.getByRole("heading", { name: "Özel Karşılaştırma" }).first(),
    ).toBeVisible();
    await expect(preview).toContainText("1. dönem: 1–7 Ağustos 2026");
    await expect(preview).toContainText("2. dönem: 1–7 Eylül 2026");
    await expect(preview.getByTestId("history-share-motivation")).toBeVisible();

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
}

test("CUSTOM unequal ranges show the exact Turkish validation message before request", async ({
  page,
}) => {
  await openHistory(page, 390, 844, "light");
  await page.getByRole("button", { name: "Karşılaştır" }).click();
  await page.getByRole("button", { name: "Özel karşılaştırma" }).click();
  await page.getByLabel("1. dönem başlangıç").fill("2026-08-01");
  await page.getByLabel("1. dönem bitiş").fill("2026-08-07");
  await page.getByLabel("2. dönem başlangıç").fill("2026-09-01");
  await page.getByLabel("2. dönem bitiş").fill("2026-09-10");
  await page.getByRole("button", { name: "Özel karşılaştırmayı uygula" }).click();

  await expect(
    page.getByText("Karşılaştırılacak dönemler aynı sayıda gün içermelidir.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("CUSTOM share privacy defaults do not leak sleep, weight or AI evaluation", async ({
  page,
}) => {
  await openHistory(page, 390, 844, "light");
  await configureCustomComparison(page);
  await assertCustomComparisonReady(page);
  await page.getByRole("button", { name: "Karşılaştırmayı paylaş" }).click();

  const dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await expect(dialog.getByRole("checkbox", { name: /Uyku/ })).not.toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /Kilo/ })).not.toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /Diewish değerlendirmesi/ })).not.toBeChecked();

  const preview = await openVisualPreview(page);
  const rendered = await preview
    .locator('[data-history-share-capture-root="true"]')
    .innerText();

  expect(rendered).not.toContain("PRIVATE_CUSTOM_AI_SENTINEL");
  expect(rendered).not.toContain("91,7 kg");
  expect(rendered).not.toContain("Ortalama Uyku Süresi");
  expect(rendered).not.toContain("Kilo Değişimi");

  const motivation = await preview.getByTestId("history-share-motivation").innerText();
  expect(motivation).not.toMatch(/PRIVATE_|91[,.]7|uyku|kilo/i);
});

test("CUSTOM Web Share caption OFF sends PNG without text and caption ON sends only short copy", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        const records =
          (window as Window & {
            __customShareRecords?: Array<{
              hasText: boolean;
              text: string | null;
              fileCount: number;
              fileType: string | null;
            }>;
          }).__customShareRecords ?? [];
        records.push({
          hasText: Object.prototype.hasOwnProperty.call(data, "text"),
          text: data.text ?? null,
          fileCount: data.files?.length ?? 0,
          fileType: data.files?.[0]?.type ?? null,
        });
        (
          window as Window & {
            __customShareRecords?: typeof records;
          }
        ).__customShareRecords = records;
      },
    });
  });

  await openHistory(page, 390, 844, "light");
  await configureCustomComparison(page);
  await assertCustomComparisonReady(page);
  await page.getByRole("button", { name: "Karşılaştırmayı paylaş" }).click();

  let preview = await openVisualPreview(page);
  await preview.getByRole("button", { name: "Paylaş" }).click();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __customShareRecords?: unknown[] }).__customShareRecords
            ?.length ?? 0,
      ),
    )
    .toBe(1);

  let records = await page.evaluate(
    () =>
      (
        window as unknown as {
          __customShareRecords: Array<{
            hasText: boolean;
            text: string | null;
            fileCount: number;
            fileType: string | null;
          }>;
        }
      ).__customShareRecords,
  );

  expect(records[0]).toMatchObject({
    hasText: false,
    text: null,
    fileCount: 1,
    fileType: "image/png",
  });

  await page.goto(VALIDATION_URL);
  await configureCustomComparison(page);
  await assertCustomComparisonReady(page);
  await page.getByRole("button", { name: "Karşılaştırmayı paylaş" }).click();

  const dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await dialog.getByRole("checkbox", { name: /Paylaşım mesajı ekle/ }).check();
  preview = await openVisualPreview(page);
  await preview.getByRole("button", { name: "Paylaş" }).click();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __customShareRecords?: unknown[] }).__customShareRecords
            ?.length ?? 0,
      ),
    )
    .toBe(1);

  records = await page.evaluate(
    () =>
      (
        window as unknown as {
          __customShareRecords: Array<{
            hasText: boolean;
            text: string | null;
            fileCount: number;
            fileType: string | null;
          }>;
        }
      ).__customShareRecords,
  );

  expect(records[0].hasText).toBe(true);
  expect(records[0].fileCount).toBe(1);
  expect(records[0].fileType).toBe("image/png");
  expect(records[0].text?.startsWith(CAPTION_PREFIX)).toBe(true);
  expect(Array.from(records[0].text ?? "").length).toBeLessThanOrEqual(140);
  expect(records[0].text ?? "").not.toMatch(/kcal|kg|uyku|öğün|1\. dönem|2\. dönem/i);
});

test("CUSTOM text share preserves privacy-filtered labels and excludes hidden data", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        (
          window as Window & {
            __customTextShare?: { text: string | null; fileCount: number };
          }
        ).__customTextShare = {
          text: data.text ?? null,
          fileCount: data.files?.length ?? 0,
        };
      },
    });
  });

  await openHistory(page, 390, 844, "light");
  await configureCustomComparison(page);
  await assertCustomComparisonReady(page);
  await page.getByRole("button", { name: "Karşılaştırmayı paylaş" }).click();

  const dialog = page.getByRole("dialog", { name: "Geçmiş paylaşım önizlemesi" });
  await dialog.getByRole("button", { name: "Yazı olarak paylaş" }).click();

  const previewText = await dialog.locator("pre").innerText();
  expect(previewText).toContain("Diewish özel karşılaştırmam");
  expect(previewText).toContain("1. dönem");
  expect(previewText).toContain("2. dönem");
  expect(previewText).not.toContain("PRIVATE_CUSTOM_AI_SENTINEL");
  expect(previewText).not.toContain("91,7 kg");
  expect(previewText).not.toContain("Ortalama Uyku Süresi");

  await dialog.getByRole("button", { name: "Yazıyı Paylaş" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __customTextShare?: unknown }).__customTextShare ?? null,
      ),
    )
    .not.toBeNull();

  const record = await page.evaluate(
    () =>
      (
        window as unknown as {
          __customTextShare: { text: string | null; fileCount: number };
        }
      ).__customTextShare,
  );
  expect(record.fileCount).toBe(0);
  expect(record.text).toContain("Diewish özel karşılaştırmam");
  expect(record.text ?? "").not.toMatch(/PRIVATE_CUSTOM_AI_SENTINEL|91[,.]7 kg|Ortalama Uyku/);
});
