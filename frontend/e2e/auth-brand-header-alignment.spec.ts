import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
const before = process.env.BRAND_HEADER_PHASE === "before";
const evidence = process.env.BRAND_HEADER_EVIDENCE_DIR;
if (!evidence) throw new Error("Set BRAND_HEADER_EVIDENCE_DIR for real before/after evidence");
for (const width of [390, 412, 430]) {
  for (const theme of ["light", "dark"] as const) {
    test(`auth header ${width}px ${theme}`, async ({ page }, testInfo) => {
      await fs.mkdir(evidence, { recursive: true });
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
      await page.route("**/api/**", (route) =>
        route.fulfill({
          status: 401,
          json: { success: false, error: { code: "UNAUTHORIZED", message: "Synthetic guest" } },
        }),
      );
      await page.route("https://www.gstatic.com/firebasejs/**", () => {
        throw new Error("Visual checks must never start provider authentication");
      });
      await page.goto("/login");
      await page.evaluate(() => document.fonts.ready);
      await page
        .locator("main")
        .evaluate((element) =>
          Promise.all(
            element.getAnimations({ subtree: true }).map((animation) => animation.finished),
          ),
        );
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      const header = page.locator("header").first();
      const brand = header.getByTestId("diewish-brand");
      const name = brand.getByAltText("Diewish", { exact: true });
      const symbol = brand.locator('img[src="/brands/diewish-id-transparent-approved.png"]');
      const tagline = brand.getByText("Sağlığın için, her zaman yanında.", { exact: true });
      await brand
        .locator("img")
        .evaluateAll((images) =>
          Promise.all(images.map((image) => (image as HTMLImageElement).decode())),
        );
      await expect(name).toHaveAttribute("src", "/brands/diewish-wordmark-approved.png");
      await expect(name).toBeVisible();
      await expect(tagline).toBeVisible();
      const rects = {
        header: (await header.boundingBox())!,
        brand: (await brand.boundingBox())!,
        name: (await name.boundingBox())!,
        symbol: (await symbol.boundingBox())!,
        tagline: (await tagline.boundingBox())!,
        toggle: (await header.getByRole("button", { name: /temaya geç/ }).boundingBox())!,
        form: (await page.locator("form").boundingBox())!,
      };
      expect(rects.brand.x + rects.brand.width + 12).toBeLessThanOrEqual(rects.toggle.x);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await expect(
        page.getByRole("heading", { name: "Tekrar hoş geldiniz", exact: true }),
      ).toBeVisible();
      for (const label of ["Giriş Yap", "Google ile devam et", "Telefon numarası ile devam et"])
        await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
      const key = `${width}-${theme}`;
      if (!before) {
        const previous = JSON.parse(
          await fs.readFile(path.join(evidence, `before-${key}.json`), "utf8"),
        ) as typeof rects;
        expect(rects.name.width).toBe(144);
        expect(rects.name.width).toBeLessThan(previous.name.width);
        expect(rects.name.width / rects.name.height).toBeCloseTo(1004 / 214, 2);
        expect(rects.symbol.width).toBe(previous.symbol.width);
        expect(rects.symbol.height).toBe(previous.symbol.height);
        expect(
          Math.abs(rects.name.y + rects.name.height / 2 - rects.symbol.y - rects.symbol.height / 2),
        ).toBeLessThan(1);
        expect(rects.name.x - rects.symbol.x - rects.symbol.width).toBe(8);
        expect(Math.abs(rects.tagline.x - rects.name.x)).toBeLessThan(1);
        expect(rects.tagline.y).toBeGreaterThan(rects.name.y + rects.name.height);
        expect(Math.abs(rects.brand.height - previous.brand.height)).toBeLessThan(1);
        expect(Math.abs(rects.form.y - previous.form.y)).toBeLessThan(1);
      }
      const phase = before ? "before" : "after";
      await fs.writeFile(
        path.join(evidence, `${phase}-${key}.json`),
        JSON.stringify(rects, null, 2),
      );
      const screenshot = path.join(evidence, `${phase}-${key}.png`);
      await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
      await header.screenshot({
        path: path.join(evidence, `${phase}-${key}-header.png`),
        animations: "disabled",
      });
      await testInfo.attach(`${phase}-${key}`, { path: screenshot, contentType: "image/png" });
    });
  }
}
