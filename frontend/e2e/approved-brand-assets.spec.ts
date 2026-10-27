import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const before = process.env.APPROVED_BRAND_PHASE === "before";
const evidence = process.env.APPROVED_BRAND_EVIDENCE_DIR;
if (!evidence) throw new Error("Set APPROVED_BRAND_EVIDENCE_DIR for real render evidence");
const icon = "/brands/diewish-id-transparent-approved.png";
const darkName = "/brands/diewish-wordmark-dark-approved.png";
const lightName = "/brands/diewish-wordmark-approved.png";

async function guest(page: Page, theme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
  // All API responses are synthetic. Never start a provider login or call a host.
  await page.route("https://**", (route) => route.abort());
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 401, json: { success: false, error: { code: "UNAUTHORIZED" } } }),
  );
}

for (const width of [390, 412, 430]) {
  for (const theme of ["light", "dark"] as const) {
    test(`${width}px ${theme}: approved artwork, stable handoff and theme switch`, async ({
      page,
    }) => {
      await fs.mkdir(evidence, { recursive: true });
      await page.setViewportSize({ width, height: 900 });
      await guest(page, theme);
      let release!: () => void;
      const session = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/api/auth/refresh-token", async (route) => {
        await session;
        await route.fulfill({ status: 401, json: { success: false } });
      });
      const requests: string[] = [];
      page.on("request", (request) => {
        if (request.url().includes("/brands/")) requests.push(request.url());
      });
      const key = `${width}-${theme}`;
      const phase = before ? "before" : "after";
      try {
        await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
        const splash = page.getByTestId("diewish-brand-splash");
        await expect(splash).toBeVisible();
        const waiting = splash.getByTestId("diewish-brand");
        await expect(waiting).toHaveAttribute("data-artwork-state", "ready");
        const waitingName = await waiting.getByAltText("Diewish", { exact: true }).boundingBox();
        await page.screenshot({ path: path.join(evidence, `${phase}-${key}-waiting.png`) });
        release();
        await expect(page).toHaveURL(/\/login$/);
        const header = page.locator("header").first();
        const brand = header.getByTestId("diewish-brand");
        await expect(brand).toHaveAttribute("data-artwork-state", "ready");
        await page.evaluate(() => document.fonts.ready);
        await page
          .locator("main")
          .evaluate((element) =>
            Promise.all(
              element.getAnimations({ subtree: true }).map((animation) => animation.finished),
            ),
          );
        const name = brand.getByAltText("Diewish", { exact: true });
        const rects = {
          brand: (await brand.boundingBox())!,
          name: (await name.boundingBox())!,
          form: (await page.locator("form").boundingBox())!,
          toggle: (await header.getByRole("button", { name: /Görünüm:|temaya geç/ }).boundingBox())!,
        };
        if (!before) {
          const old = JSON.parse(
            await fs.readFile(path.join(evidence, `before-${key}.json`), "utf8"),
          ) as typeof rects;
          await expect(brand.locator(`img[src="${icon}"]`)).toHaveCount(1);
          await expect(name).toHaveAttribute("src", lightName);
          const night = brand.locator(`img[src="${darkName}"]`);
          await expect(night).toHaveCount(1);
          await expect(name).toHaveCSS("opacity", theme === "dark" ? "0" : "1");
          await expect(night).toHaveCSS("opacity", theme === "dark" ? "1" : "0");
          await expect(night).toHaveCSS("filter", "none");
          const images = await brand.locator("img").evaluateAll((items) =>
            items.every((item) => {
              const image = item as HTMLImageElement;
              return image.complete && image.naturalWidth > 0;
            }),
          );
          expect(images).toBe(true);
          for (const value of ["x", "y", "width", "height"] as const) {
            expect(rects.name[value]).toBeCloseTo(waitingName![value], 1);
            expect(rects.name[value]).toBeCloseTo(old.name[value], 1);
          }
          expect(rects.form.y).toBeCloseTo(old.form.y, 1);
          expect(rects.brand.height).toBeCloseTo(old.brand.height, 1);
          expect(rects.brand.x + rects.brand.width + 12).toBeLessThanOrEqual(rects.toggle.x);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
        }
        await fs.writeFile(
          path.join(evidence, `${phase}-${key}.json`),
          JSON.stringify(rects, null, 2),
        );
        await page.screenshot({
          path: path.join(evidence, `${phase}-${key}-login.png`),
          fullPage: true,
          animations: "disabled",
        });
        await header.screenshot({
          path: path.join(evidence, `${phase}-${key}-header.png`),
          animations: "disabled",
        });
        if (!before) {
          const count = requests.length;
          await header.getByRole("button", { name: /Görünüm:/ }).click();
          await page.getByRole("radio", { name: theme === "dark" ? /^Açık/ : /^Koyu/ }).check();
          await expect(page.locator("html")).toHaveClass(
            new RegExp(theme === "dark" ? "light" : "dark"),
          );
          await expect(brand.locator(`img[src="${darkName}"]`)).toHaveCSS(
            "opacity",
            theme === "dark" ? "0" : "1",
          );
          await expect(name).toHaveCSS("opacity", theme === "dark" ? "1" : "0");
          await expect(brand).toHaveAttribute("data-artwork-state", "ready");
          expect(await name.boundingBox()).toEqual(rects.name);
          expect(requests.length).toBe(count);
          await expect(page.getByRole("button", { name: "Giriş Yap", exact: true })).toBeEnabled();
        }
      } finally {
        release();
      }
    });
  }
}

test("delayed dark wordmark cannot reveal a partial brand", async ({ page }) => {
  test.skip(before, "Capture the accepted baseline only");
  await guest(page, "dark");
  let release!: () => void;
  const image = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**${darkName}`, async (route) => {
    await image;
    await route.continue();
  });
  try {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const brand = page.locator("header").getByTestId("diewish-brand");
    await expect(brand).toHaveAttribute("data-artwork-state", "loading");
    await expect(
      brand.getByText("Sağlığın için, her zaman yanında.", { exact: true }),
    ).toBeHidden();
    for (const item of await brand.locator("img").all()) await expect(item).toBeHidden();
    release();
    await expect(brand).toHaveAttribute("data-artwork-state", "ready");
    await expect(brand.locator(`img[src="${darkName}"]`)).toHaveCSS("opacity", "1");
  } finally {
    release();
  }
});

for (const failed of [icon, lightName, darkName]) {
  test(`failed approved artwork keeps one fallback and usable login: ${failed}`, async ({
    page,
  }) => {
    test.skip(before, "Capture the accepted baseline only");
    await guest(page, "dark");
    await page.route(`**${failed}`, (route) => route.abort());
    await page.goto("/login");
    const brand = page.locator("header").getByTestId("diewish-brand");
    await expect(brand).toHaveAttribute("data-artwork-state", "fallback");
    await expect(brand.locator("[data-brand-fallback]")).toBeVisible();
    for (const image of await brand.locator("img").all()) await expect(image).toBeHidden();
    await expect(page.getByRole("button", { name: "Giriş Yap", exact: true })).toBeEnabled();
  });
}
