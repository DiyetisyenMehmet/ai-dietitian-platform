import { expect, test, type Locator } from "@playwright/test";

async function expectTransparentWordmark(image: Locator) {
  await expect(image).toBeVisible();
  const style = await image.evaluate((element) => {
    const css = getComputedStyle(element);
    return {
      background: css.backgroundColor,
      backgroundImage: css.backgroundImage,
      boxShadow: css.boxShadow,
      radius: css.borderRadius,
      padding: [css.paddingTop, css.paddingRight, css.paddingBottom, css.paddingLeft],
    };
  });
  expect(style).toEqual({
    background: "rgba(0, 0, 0, 0)",
    backgroundImage: "none",
    boxShadow: "none",
    radius: "0px",
    padding: ["0px", "0px", "0px", "0px"],
  });
}

// Presentation-only acceptance: no real accounts, credentials or provider calls.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 401,
      json: { success: false, error: { code: "UNAUTHORIZED", message: "Synthetic guest" } },
    }),
  );
});

for (const width of [320, 390, 412, 430, 1024, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`approved login and site branding fits ${width}px ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
      for (const path of ["/login", "/"]) {
        await page.goto(path);
        const header = page.locator("header").first();
        const brand = header.getByTestId("diewish-brand");
        await expect(brand).toBeVisible();
        await expect(brand.getByAltText("Diewish", { exact: true })).toBeVisible();
        await expectTransparentWordmark(brand.getByAltText("Diewish", { exact: true }));
        await expect(brand.getByText("Sağlığın için, her zaman yanında.")).toBeVisible();
        await expect(header.locator("svg.lucide-leaf")).toHaveCount(0);
        const symbol = brand.locator('img[src="/brands/diewish-id-approved.webp"]');
        await expect(symbol).toBeVisible();
        await expect
          .poll(() =>
            brand.locator("img").evaluateAll((images) =>
              images.every((image) => {
                const img = image as HTMLImageElement;
                return img.complete && img.naturalWidth >= img.clientWidth * devicePixelRatio;
              }),
            ),
          )
          .toBe(true);
        const bounds = await brand.boundingBox();
        const headerBounds = await header.boundingBox();
        const toggle = await header.getByRole("button", { name: /temaya geç/ }).boundingBox();
        expect(bounds).not.toBeNull();
        expect(toggle).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(toggle!.x);
        expect(bounds!.y).toBeGreaterThanOrEqual(headerBounds!.y);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
          headerBounds!.y + headerBounds!.height,
        );
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        if (path === "/login") {
          await expect(
            page.getByRole("heading", { name: "Tekrar hoş geldiniz", exact: true }),
          ).toBeVisible();
          await expect(page.getByRole("button", { name: "Giriş Yap", exact: true })).toBeVisible();
        }
        await header.screenshot({
          path: testInfo.outputPath(path === "/login" ? "login-header.png" : "site-header.png"),
          animations: "disabled",
        });
      }
    });
  }
}

for (const theme of ["light", "dark"] as const) {
  test(`waiting wordmark stays transparent ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/auth/refresh-token", async (route) => {
      await gate;
      await route.fulfill({
        status: 401,
        json: { success: false, error: { code: "UNAUTHORIZED" } },
      });
    });
    try {
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      const splash = page.getByTestId("diewish-brand-splash");
      const wordmark = splash.getByAltText("Diewish", { exact: true });
      await expectTransparentWordmark(wordmark);
      await splash
        .locator("img")
        .evaluateAll((images) =>
          Promise.all(images.map((image) => (image as HTMLImageElement).decode())),
        );
      await splash.screenshot({
        path: testInfo.outputPath("waiting-wordmark.png"),
        animations: "disabled",
      });
    } finally {
      release();
    }
  });
}

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`startup is branded without rotation and guest routing completes (${reducedMotion})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/auth/refresh-token", async (route) => {
      await gate;
      await route.fulfill({
        status: 401,
        json: { success: false, error: { code: "UNAUTHORIZED" } },
      });
    });
    try {
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      const splash = page.getByTestId("diewish-brand-splash");
      await expect(splash).toBeVisible();
      await expect(splash).toHaveAttribute("role", "status");
      await expect(splash.locator("svg, .animate-spin")).toHaveCount(0);
      const icon = splash.locator('img[src="/brands/diewish-id-original.jpg"]');
      await expect
        .poll(() => icon.evaluate((element) => (element as HTMLImageElement).naturalWidth))
        .toBe(1536);
      expect(await icon.evaluate((element) => element.getBoundingClientRect().width)).toBe(144);
      expect(await icon.evaluate((element) => getComputedStyle(element).animationName)).toBe(
        "none",
      );
      release();
      await expect(page).toHaveURL(/\/login$/);
      await expect(splash).toHaveCount(0);
      await expect(page.locator("header").getByTestId("diewish-brand")).toBeVisible();
    } finally {
      release();
    }
  });
}
