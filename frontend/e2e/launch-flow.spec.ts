import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
const before = process.env.LAUNCH_PHASE === "before";
const evidence = process.env.LAUNCH_EVIDENCE_DIR;
if (!evidence) throw new Error("Set LAUNCH_EVIDENCE_DIR for recorded before/after evidence");

for (const width of [390, 412, 430]) {
  for (const theme of ["light", "dark"] as const) {
    test(`one stable lockup through startup ${width}px ${theme}`, async ({ page }, testInfo) => {
      await fs.mkdir(evidence, { recursive: true });
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
      await page.addInitScript(() => {
        const host = window as Window & {
          launchFrames?: number;
          DiewishSystemUi?: { onLaunchFrameReady: () => void };
        };
        host.launchFrames = 0;
        host.DiewishSystemUi = {
          onLaunchFrameReady: () => {
            host.launchFrames!++;
          },
        };
      });
      let releaseSession!: () => void;
      const session = new Promise<void>((resolve) => {
        releaseSession = resolve;
      });
      let releaseIcon!: () => void;
      const icon = new Promise<void>((resolve) => {
        releaseIcon = resolve;
      });
      await page.route("**/api/**", async (route) => {
        if (route.request().url().includes("/auth/refresh-token")) await session;
        await route.fulfill({
          status: 401,
          json: { success: false, error: { code: "UNAUTHORIZED" } },
        });
      });
      // The wordmark may arrive before the icon on a cold WebView cache.
      await page.route("**/brands/diewish-id-*", async (route) => {
        await icon;
        await route.continue();
      });
      const key = `${before ? "before" : "after"}-${width}-${theme}`;
      try {
        await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
        const splash = page.getByTestId("diewish-brand-splash");
        await expect(splash).toBeVisible();
        const slogan = splash.getByText("Sağlığın için, her zaman yanında.", { exact: true });
        const wordmark = splash.getByAltText("Diewish", { exact: true });
        await expect
          .poll(() => wordmark.evaluate((element) => (element as HTMLImageElement).naturalWidth))
          .toBe(1004);
        if (!before) {
          expect(
            await page.evaluate(() => (window as Window & { launchFrames?: number }).launchFrames),
          ).toBe(0);
          await expect(slogan).toBeHidden();
          await expect(wordmark).toBeHidden();
          await expect(splash.locator("svg, .animate-spin")).toHaveCount(0);
        }
        await page.screenshot({ path: path.join(evidence, `${key}-slow-icon.png`) });
        releaseIcon();
        await expect(slogan).toBeVisible();
        await splash
          .locator("img")
          .evaluateAll((images) =>
            Promise.all(images.map((image) => (image as HTMLImageElement).decode())),
          );
        if (!before)
          await expect
            .poll(() =>
              page.evaluate(() => (window as Window & { launchFrames?: number }).launchFrames ?? 0),
            )
            .toBeGreaterThan(0);
        const loading = await wordmark.boundingBox();
        await page.screenshot({ path: path.join(evidence, `${key}-waiting.png`) });
        releaseSession();
        await expect(page).toHaveURL(/\/login$/);
        await expect(splash).toHaveCount(0);
        const brand = page.locator("header").getByTestId("diewish-brand");
        const name = brand.getByAltText("Diewish", { exact: true });
        await expect(name).toBeVisible();
        if (!before) {
          await expect(brand).toHaveAttribute("data-artwork-state", "ready");
          const final = (await name.boundingBox())!;
          for (const value of ["x", "y", "width", "height"] as const)
            expect(final[value]).toBeCloseTo(loading![value], 1);
          await expect(page.getByTestId("diewish-brand")).toHaveCount(1);
          const toggle = (await page
            .locator("header")
            .getByRole("button", { name: /temaya geç/ })
            .boundingBox())!;
          const box = (await brand.boundingBox())!;
          expect(box.x + box.width + 12).toBeLessThanOrEqual(toggle.x);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
        }
        for (const label of ["Giriş Yap", "Google ile devam et", "Telefon numarası ile devam et"])
          await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
        await page.screenshot({
          path: path.join(evidence, `${key}-login.png`),
          fullPage: true,
          animations: "disabled",
        });
        await testInfo.attach(key, {
          path: path.join(evidence, `${key}-waiting.png`),
          contentType: "image/png",
        });
      } finally {
        releaseIcon();
        releaseSession();
      }
    });
  }
}

for (const failedAsset of ["diewish-id-approved.webp", "diewish-wordmark-approved.png"]) {
  test(`failed artwork does not hide login or leave a partial brand (${failedAsset})`, async ({
    page,
  }) => {
    test.skip(before, "New fallback behavior");
    await page.route("**/api/**", (route) =>
      route.fulfill({ status: 401, json: { success: false } }),
    );
    await page.route(`**/brands/${failedAsset}`, (route) => route.abort());
    await page.goto("/login");
    const brand = page.locator("header").getByTestId("diewish-brand");
    await expect(brand).toHaveAttribute("data-artwork-state", "fallback");
    await expect(brand.locator("[data-brand-fallback]")).toBeVisible();
    for (const image of await brand.locator("img").all()) await expect(image).toBeHidden();
    await expect(page.getByRole("button", { name: "Giriş Yap", exact: true })).toBeEnabled();
  });
}
