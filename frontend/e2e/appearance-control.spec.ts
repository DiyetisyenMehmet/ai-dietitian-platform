import { expect, test, type Page } from "@playwright/test";

const hintsKey = "diewish:appearance-hints:v1";
const toggle = (page: Page) => page.getByRole("button", { name: /^Görünüm:/ });
async function open(
  page: Page,
  theme = "system",
  counts?: Record<string, number>,
  entry = "/login",
) {
  await page.addInitScript(
    ({ theme, counts, hintsKey }) => {
      if (!sessionStorage.getItem("appearance-initialized")) {
        localStorage.setItem("theme", theme);
        if (counts) localStorage.setItem(hintsKey, JSON.stringify(counts));
        sessionStorage.setItem("appearance-initialized", "true");
      }
    },
    { theme, counts, hintsKey },
  );
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 401, json: { success: false } }),
  );
  await page.goto(entry);
  await expect(page).toHaveURL(/\/login$/);
  await expect(toggle(page)).toBeEnabled();
  await expect(page.locator("html")).toHaveAttribute("data-diewish-theme-ready", /light|dark/);
}
async function savedCounts(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), hintsKey);
}

test("short taps cycle immediately; each mode has exactly three independent two-second labels", async ({
  page,
}) => {
  await open(page);
  await page
    .locator("main")
    .evaluate((element) =>
      Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)),
    );
  const clockTime = new Date("2026-10-30T00:00:00Z");
  await page.clock.install({ time: clockTime });
  await page.clock.pauseAt(clockTime);
  const form = await page.locator("form").boundingBox();
  for (let turn = 1; turn <= 4; turn++) {
    for (const [mode, label] of [
      ["light", "Gündüz modu"],
      ["dark", "Gece modu"],
      ["system", "Sistem modu"],
    ]) {
      await toggle(page).evaluate((element) => (element as HTMLElement).click());
      await expect(toggle(page)).toHaveAttribute("data-mode", mode);
      expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe(mode);
      const hint = page.getByTestId("appearance-hint");
      if (turn <= 3) {
        await expect(hint).toHaveText(label);
        const hintBox = (await hint.boundingBox())!,
          buttonBox = (await toggle(page).boundingBox())!;
        expect(hintBox.x + hintBox.width).toBeLessThan(buttonBox.x);
        await page.clock.runFor(1999);
        await expect(hint).toBeVisible();
        await page.clock.runFor(1);
      }
      await expect(hint).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(await page.locator("form").boundingBox()).toEqual(form);
    }
    expect(await savedCounts(page)).toEqual({
      light: Math.min(turn, 3),
      dark: Math.min(turn, 3),
      system: Math.min(turn, 3),
    });
  }
});

test("limits persist on reopen; only short selection consumes the selected mode", async ({
  page,
}) => {
  await open(page, "system", { light: 3, dark: 1, system: 0 });
  await toggle(page).click();
  await expect(page.getByTestId("appearance-hint")).toHaveCount(0);
  await toggle(page).click();
  await expect(page.getByTestId("appearance-hint")).toHaveText("Gece modu");
  expect(await savedCounts(page)).toEqual({ light: 3, dark: 2, system: 0 });
  await page.reload();
  await expect(toggle(page)).toHaveAttribute("data-mode", "dark");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/register");
  await page.goto("/login");
  expect(await savedCounts(page)).toEqual({ light: 3, dark: 2, system: 0 });
  await expect(page.getByTestId("appearance-hint")).toHaveCount(0);
  await toggle(page).click();
  await expect(page.getByTestId("appearance-hint")).toHaveText("Sistem modu");
  expect(await savedCounts(page)).toEqual({ light: 3, dark: 2, system: 1 });
});

test("hover and keyboard descriptions remain after all labels expire; keyboard activates one step", async ({
  page,
}) => {
  await open(page, "light", { light: 3, dark: 3, system: 3 });
  await toggle(page).hover();
  await expect(page.getByRole("tooltip")).toHaveText("Gündüz: Diewish her zaman açık görünür");
  await page.getByRole("tooltip").hover();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.keyboard.press("Tab");
  await toggle(page).focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await expect(toggle(page)).toHaveAccessibleDescription("Gündüz: Diewish her zaman açık görünür");
  await page.keyboard.press("Space");
  await expect(toggle(page)).toHaveAttribute("data-mode", "dark");
  await expect(toggle(page)).toHaveAccessibleDescription("Gece: Diewish her zaman koyu görünür");
  await expect(page.getByTestId("appearance-hint")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  expect(await savedCounts(page)).toEqual({ light: 3, dark: 3, system: 3 });
});

for (const device of [
  {
    name: "phone",
    width: 390,
    height: 844,
    touch: true,
    ua: "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36",
    icon: "smartphone",
  },
  {
    name: "tablet",
    width: 820,
    height: 1180,
    touch: true,
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    icon: "tablet",
  },
  {
    name: "computer",
    width: 1280,
    height: 900,
    touch: false,
    ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
    icon: "monitor",
  },
]) {
  test(`system icon and long-press/help on ${device.name}`, async ({ browser }, info) => {
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:3027",
      viewport: { width: device.width, height: device.height },
      hasTouch: device.touch,
      isMobile: device.touch,
      userAgent: device.ua,
    });
    const page = await context.newPage();
    try {
      await open(page, "system", { light: 3, dark: 3, system: 3 });
      await expect(toggle(page)).toHaveAttribute("data-device", device.name);
      await expect(toggle(page).locator("svg")).toHaveClass(new RegExp(`lucide-${device.icon}`));
      const button = (await toggle(page).boundingBox())!;
      expect(button.width).toBeGreaterThanOrEqual(44);
      expect(button.height).toBeGreaterThanOrEqual(44);
      if (device.touch) {
        const session = await context.newCDPSession(page);
        const point = { x: button.x + button.width / 2, y: button.y + button.height / 2 };
        await session.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [point],
        });
        await expect(page.getByRole("tooltip")).toHaveText(
          "Sistem: Cihazın görünümünü otomatik takip eder.",
        );
        const helpBox = (await page.getByRole("tooltip").boundingBox())!;
        const headingBox = (await page
          .getByRole("heading", { name: "Tekrar hoş geldiniz" })
          .boundingBox())!;
        expect(helpBox.y + helpBox.height).toBeLessThanOrEqual(headingBox.y);
        await page.screenshot({ path: info.outputPath(`${device.name}-help.png`) });
        await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await expect(toggle(page)).toHaveAttribute("data-mode", "system");
        expect(await savedCounts(page)).toEqual({ light: 3, dark: 3, system: 3 });
        await page.touchscreen.tap(point.x, point.y);
        await expect(toggle(page)).toHaveAttribute("data-mode", "light");
      } else {
        await toggle(page).hover();
        await expect(page.getByRole("tooltip")).toBeVisible();
        await page.screenshot({ path: info.outputPath("computer-help.png") });
      }
    } finally {
      await context.close();
    }
  });
}

for (const system of ["light", "dark"] as const) {
  for (const preference of ["light", "dark"]) {
    test(`cold startup device=${system} app=${preference}; manual choice wins`, async ({
      page,
    }, info) => {
      await page.emulateMedia({ colorScheme: system });
      await page.addInitScript(() => {
        const frames: { dark: boolean; scheme: string }[] = [];
        (window as unknown as { appearanceFrames: typeof frames }).appearanceFrames = frames;
        const frame = () => {
          if (document.querySelector("[data-testid=diewish-brand]"))
            frames.push({
              dark: document.documentElement.classList.contains("dark"),
              scheme: document.documentElement.style.colorScheme,
            });
          if (frames.length < 300) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      await open(page, preference, undefined, "/dashboard");
      await expect(page.locator('[data-artwork-state="ready"]')).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-diewish-theme-ready", preference);
      const frames = await page.evaluate(
        () =>
          (window as unknown as { appearanceFrames: { dark: boolean; scheme: string }[] })
            .appearanceFrames,
      );
      expect(frames.length).toBeGreaterThan(0);
      expect(
        frames.every(
          (frame) => frame.dark === (preference === "dark") && frame.scheme === preference,
        ),
      ).toBe(true);
      const background = await page
        .locator("body")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(background).toBe(preference === "dark" ? "rgb(13, 22, 20)" : "rgb(252, 253, 252)");
      await page.emulateMedia({ colorScheme: system === "dark" ? "light" : "dark" });
      await expect(page.locator("html")).toHaveAttribute("data-diewish-theme-ready", preference);
      expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe(preference);
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-diewish-theme-ready", preference);
      await page.screenshot({ path: info.outputPath("manual-startup.png") });
      console.log(
        JSON.stringify({
          system,
          preference,
          navigation: await page.evaluate(() => ({
            domContentLoaded: performance
              .getEntriesByType("navigation")
              .map((n) => (n as PerformanceNavigationTiming).domContentLoadedEventEnd),
            ready: performance.now(),
          })),
        }),
      );
    });
  }
}

test("system follows live device changes without consuming labels", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await open(page, "system");
  for (const mode of ["dark", "light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: mode });
    await expect(page.locator("html")).toHaveAttribute("data-diewish-theme-ready", mode);
  }
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("system");
  expect(await savedCounts(page)).toEqual({});
});

test("unavailable or malformed hint storage cannot block a short theme change", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(
    (key) => localStorage.setItem(key, '{"light":-9,"dark":"bad","system":999}'),
    hintsKey,
  );
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("data-mode", "light");
  await expect(page.getByTestId("appearance-hint")).toHaveText("Gündüz modu");
  expect(await savedCounts(page)).toEqual({ light: 1, dark: 0, system: 3 });
  await page.evaluate(() => {
    Storage.prototype.getItem = () => {
      throw new Error("synthetic storage unavailable");
    };
    Storage.prototype.setItem = () => {
      throw new Error("synthetic storage unavailable");
    };
  });
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("data-mode", "dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
});

for (const width of [320, 390]) {
  test(`short label stays left, inside viewport and clear of content at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await open(page, "system");
    await page
      .locator("main")
      .evaluate((element) =>
        Promise.all(
          element.getAnimations({ subtree: true }).map((animation) => animation.finished),
        ),
      );
    for (const label of ["Gündüz modu", "Gece modu", "Sistem modu"]) {
      await toggle(page).click();
      const hint = page.getByTestId("appearance-hint");
      await expect(hint).toHaveText(label);
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      const h = (await hint.boundingBox())!,
        b = (await toggle(page).boundingBox())!;
      const brand = (await page.getByTestId("diewish-brand").boundingBox())!;
      const heading = (await page
        .getByRole("heading", { name: "Tekrar hoş geldiniz" })
        .boundingBox())!;
      expect(h.x).toBeGreaterThanOrEqual(0);
      expect(h.x + h.width).toBeLessThan(b.x);
      expect(h.x >= brand.x + brand.width || h.y >= brand.y + brand.height).toBe(true);
      expect(h.y + h.height).toBeLessThan(heading.y);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (label === "Gece modu")
        await page.screenshot({ path: info.outputPath("dark-short-label.png") });
    }
  });
}
