import { expect, test, type Page } from "@playwright/test";

const base = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const defaults = () => ({
  order: ["food", "blood", "progress", "coach"],
  hidden: [] as string[],
  quickActionOrder: ["meal", "water", "activity", "weight"],
  hiddenQuickActionIds: [] as string[],
});
// Exercise the real application and HTTP boundary, without production/staging accounts.
async function session(page: Page, initialLoadFailure = false) {
  let owner = "account-a";
  const stored = new Map<string, ReturnType<typeof defaults>>();
  const writes: unknown[] = [];
  let fail = false;
  let delay = 0;
  let loadFailure = initialLoadFailure;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const ok = (data: unknown) => route.fulfill({ status: 200, json: { success: true, data } });
    if (path.endsWith("/auth/refresh-token") || path.endsWith("/auth/login"))
      return ok({
        user: {
          id: owner,
          fullName: "Dashboard Test",
          email: `${owner}@example.com`,
          role: "USER",
          isActive: true,
          emailVerified: true,
          onboardingCompleted: true,
          createdAt: "2026-01-01T00:00:00Z",
        },
        tokens: { accessToken: owner, tokenType: "Bearer", expiresIn: "15m" },
      });
    if (path.endsWith("/legal/consents")) return ok({ allMandatoryGranted: false, items: [] });
    if (path.endsWith("/account/dashboard-cards")) {
      if (loadFailure && route.request().method() === "GET") {
        return route.fulfill({ status: 503, json: { success: false, error: { code: "TEST_LOAD_FAILED", message: "Test load failure" } } });
      }
      const account = route.request().headers().authorization?.replace("Bearer ", "") || owner;
      if (route.request().method() === "PUT") {
        const input = route.request().postDataJSON();
        writes.push(input);
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        if (fail)
          return route.fulfill({
            status: 503,
            json: { success: false, error: { code: "TEST_SAVE_FAILED", message: "Test failure" } },
          });
        stored.set(account, input);
      }
      return ok({ preferences: stored.get(account) || defaults() });
    }
    return route.fulfill({
      status: 503,
      json: {
        success: false,
        error: { code: "TEST_UNUSED_API", message: "Unused in editor tests" },
      },
    });
  });
  await page.goto(`${base}/dashboard`);
  await expect(page.locator("[data-dashboard-edit-toggle]")).toBeVisible();
  await expect(page.locator("[data-dashboard-personalization]")).toHaveAttribute(
    "data-saving",
    "false",
  );
  return {
    writes,
    stored,
    loadFailure: (value: boolean) => { loadFailure = value; },
    fail: (value: boolean) => {
      fail = value;
    },
    delay: (value: number) => {
      delay = value;
    },
    owner: (value: string) => {
      owner = value;
    },
  };
}
const cards = (page: Page) => page.locator("[data-dashboard-card-slot]");
const actions = (page: Page) => page.locator("[data-quick-action-slot]");
const ids = (locator: ReturnType<typeof cards>) =>
  locator.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-personalize-item")));
const edit = (page: Page) => page.locator("[data-dashboard-edit-toggle]").click();
async function save(page: Page) {
  await page.locator("[data-save-dashboard-layout]").click();
  await expect(page.locator("[data-dashboard-personalization]")).toHaveAttribute(
    "data-editing",
    "false",
  );
}
async function drag(page: Page, from: string, to: string, axis: "x" | "y", touch = false) {
  await page.locator(from).evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
  await page.waitForTimeout(250);
  const a = (await page.locator(from).boundingBox())!;
  const b = (await page.locator(to).boundingBox())!;
  const x = a.x + a.width * 0.5,
    y = a.y + a.height * 0.5;
  expect(await page.evaluate(({ x, y, from }) => !!document.elementFromPoint(x, y)?.closest(from), { x, y, from })).toBe(true);
  const tx = axis === "x" ? b.x + b.width * 0.2 : x;
  const ty = axis === "y" ? b.y + b.height * 0.2 : y;
  let scrollBeforeDrag = await page.evaluate(() => scrollY);
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 1 }],
    });
    await page.waitForTimeout(190);
    // The hold stops inertia from the preceding native scroll. The intentional
    // drag must keep that settled viewport position throughout the move/drop.
    scrollBeforeDrag = await page.evaluate(() => scrollY);
    for (let i = 1; i <= 10; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + ((tx - x) * i) / 10, y: y + ((ty - y) * i) / 10, id: 1 }],
      });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(tx, ty, { steps: 10 });
    await page.mouse.up();
  }
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(scrollBeforeDrag, 0);
}

test("only Save persists; dirty exit, minimums, restore/reset drafts, failure and duplicate prevention", async ({
  page,
}) => {
  const api = await session(page);
  await edit(page);
  await edit(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(api.writes).toHaveLength(0);
  await edit(page);
  await page.locator('[data-dashboard-card-hide="blood"]').click();
  await page.locator('[data-quick-action-hide="weight"]').click();
  expect(api.writes).toHaveLength(0);
  await page.locator('[data-dashboard-card-hide="food"]').click();
  await page.locator('[data-quick-action-hide="meal"]').click();
  await expect(cards(page)).toHaveCount(3);
  await expect(actions(page)).toHaveCount(3);
  await edit(page);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Düzenlemeye devam et" }).click();
  await expect(cards(page)).toHaveCount(3);
  await edit(page);
  await page.getByRole("button", { name: "Kaydetmeden çık" }).click();
  await expect(cards(page)).toHaveCount(4);
  expect(api.writes).toHaveLength(0);
  await edit(page);
  await page.locator('[data-dashboard-card-hide="blood"]').click();
  api.fail(true);
  await page.locator("[data-save-dashboard-layout]").click();
  await expect(page.locator("[data-dashboard-personalization] [role=alert]")).toContainText(
    "Değişikliklerin korunuyor",
  );
  await expect(cards(page)).toHaveCount(3);
  await expect(page.locator("[data-dashboard-personalization]")).toHaveAttribute(
    "data-editing",
    "true",
  );
  api.fail(false);
  api.delay(250);
  await page.locator("[data-save-dashboard-layout]").evaluate((node: HTMLButtonElement) => {
    node.click();
    node.click();
  });
  await expect(page.locator("[data-dashboard-personalization]")).toHaveAttribute(
    "data-editing",
    "false",
  );
  expect(api.writes).toHaveLength(2);
  await page.reload();
  await expect(cards(page)).toHaveCount(3);
  await edit(page);
  await page.locator("[data-open-hidden-items]").click();
  const sheet = page.locator("[data-hidden-items-sheet]");
  await page.keyboard.press("Escape");
  await page.locator('[data-quick-action-hide="weight"]').click();
  await page.locator("[data-open-hidden-items]").click();
  await sheet.getByRole("tab", { name: "Hızlı İşlemler" }).click();
  await sheet.locator('[data-hidden-quick-action="weight"]').getByRole("button", { name: "Göster" }).click();
  await expect(actions(page)).toHaveCount(4);
  expect(api.writes).toHaveLength(2);
  await sheet.getByRole("tab", { name: "Kartlar" }).click();
  await sheet.locator('[data-hidden-card="blood"]').getByRole("button", { name: "Göster" }).click();
  await expect(cards(page)).toHaveCount(4);
  expect(api.writes).toHaveLength(2);
  await page.keyboard.press("Escape");
  await edit(page);
  await page.getByRole("button", { name: "Kaydetmeden çık" }).click();
  await expect(cards(page)).toHaveCount(3);
  await edit(page);
  await page.locator("[data-open-hidden-items]").click();
  await sheet.getByRole("button", { name: "Varsayılana Dön" }).click();
  await sheet
    .locator("[data-reset-confirmation]")
    .getByRole("button", { name: "Varsayılana Dön" })
    .click();
  await expect(cards(page)).toHaveCount(4);
  expect(api.writes).toHaveLength(2);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(cards(page)).toHaveCount(3);
  api.owner("account-b");
  await page.reload();
  await expect(cards(page)).toHaveCount(4);
  api.owner("account-a");
  await page.reload();
  await expect(cards(page)).toHaveCount(3);
});

test("full card/tile surfaces track movement, animate neighbors and drop; keyboard and saved navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await session(page);
  await edit(page);
  const food = page.locator('[data-dashboard-card-slot="food"]');
  const blood = page.locator('[data-dashboard-card-slot="blood"]');
  await blood.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
  await page.waitForTimeout(250);
  const a = (await blood.boundingBox())!,
    b = (await food.boundingBox())!;
  const x = a.x + a.width * 0.5,
    y = a.y + a.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 18, { steps: 3 });
  expect(await ids(cards(page))).toEqual(defaults().order);
  expect((await blood.boundingBox())!.y).toBeLessThan(a.y - 10);
  await page.mouse.move(x, b.y + b.height * 0.2, { steps: 8 });
  await expect.poll(() => ids(cards(page))).toEqual(["blood", "food", "progress", "coach"]);
  expect(await food.evaluate((node) => node.getAnimations().length)).toBeGreaterThan(0);
  await page.mouse.up();
  expect(await blood.evaluate((node) => node.getAnimations().length)).toBeGreaterThan(0);
  await drag(page, '[data-quick-action-slot="weight"]', '[data-quick-action-slot="meal"]', "x");
  expect(await ids(actions(page))).toEqual(["weight", "meal", "water", "activity"]);
  expect(api.writes).toHaveLength(0);
  await page.locator('[data-dashboard-card-drag-handle="coach"]').press("ArrowUp");
  expect(await ids(cards(page))).toEqual(["blood", "food", "coach", "progress"]);
  await page.locator('[data-quick-action-drag-handle="activity"]').press("ArrowLeft");
  expect(await ids(actions(page))).toEqual(["weight", "meal", "activity", "water"]);
  await save(page);
  expect(api.writes).toHaveLength(1);
  await page.reload();
  await expect.poll(() => ids(cards(page))).toEqual(["blood", "food", "coach", "progress"]);
  await food.locator("[data-dashboard-live-feature-link]").click();
  await expect(page).toHaveURL(/\/meals\/scan/);
});

test("native touch: immediate swipe scrolls, stationary hold drags both full surfaces", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    const api = await session(page);
    await edit(page);
    const food = page.locator('[data-dashboard-card-slot="food"]');
    await food.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
    const box = (await food.boundingBox())!;
    const cdp = await context.newCDPSession(page);
    const before = await page.evaluate(() => scrollY);
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 1 }],
    });
    for (let i = 1; i <= 8; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y + i * 15, id: 1 }],
      });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(before - 20);
    expect(await ids(cards(page))).toEqual(defaults().order);
    await drag(
      page,
      '[data-dashboard-card-slot="blood"]',
      '[data-dashboard-card-slot="food"]',
      "y",
      true,
    );
    await expect.poll(() => ids(cards(page))).toEqual(["blood", "food", "progress", "coach"]);
    await drag(
      page,
      '[data-quick-action-slot="weight"]',
      '[data-quick-action-slot="meal"]',
      "x",
      true,
    );
    await expect.poll(() => ids(actions(page))).toEqual(["weight", "meal", "water", "activity"]);
    expect(api.writes).toHaveLength(0);
  } finally {
    await context.close();
  }
});

for (const theme of ["light", "dark"])
  test(`${theme}: reference alignment, unchanged geometry/controls at 320–430px`, async ({
    page,
  }, testInfo) => {
    await session(page);
    for (const width of [320, 390, 412, 430]) {
      await page.setViewportSize({ width, height: 932 });
      await page.evaluate(
        (theme) => document.documentElement.classList.toggle("dark", theme === "dark"),
        theme,
      );
      const initial = await cards(page).evaluateAll((nodes) =>
        nodes.map((node) => ({
          width: node.getBoundingClientRect().width,
          height: node.getBoundingClientRect().height,
        })),
      );
      await edit(page);
      await expect(page.getByText("Kartları tutup sürükleyerek sıralayabilirsin")).toBeVisible();
      const checks = await cards(page).evaluateAll((nodes) =>
        nodes.map((node) => {
          const eye = node.querySelector("[data-dashboard-card-hide]")!.getBoundingClientRect();
          const arrow = Array.from(node.querySelectorAll("[data-dashboard-feature-chevron]")).find(
            (element) => element.getBoundingClientRect().width > 0,
          );
          const arrowBox = arrow?.getBoundingClientRect();
          const dots = node
            .querySelector("[data-dashboard-card-drag-handle] svg")!
            .getBoundingClientRect();
          return {
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
            transform: getComputedStyle(node).transform,
            eye: { x: eye.x, y: eye.y, width: eye.width, height: eye.height },
            arrow: arrowBox && {
              x: arrowBox.x,
              y: arrowBox.y,
              width: arrowBox.width,
              height: arrowBox.height,
            },
            dotsX: dots.x + dots.width / 2,
            arrowVisibility: arrow && getComputedStyle(arrow.querySelector("svg")!).visibility,
          };
        }),
      );
      for (let i = 0; i < checks.length; i++) {
        expect(checks[i].width).toBeCloseTo(initial[i].width, 2);
        expect(checks[i].height).toBeCloseTo(initial[i].height, 2);
        expect(checks[i].transform).toBe("none");
        expect(checks[i].dotsX).toBeLessThan(initial[i].width * 0.025 + 16);
        if (checks[i].arrow) {
          expect(checks[i].eye.x).toBeCloseTo(checks[i].arrow!.x, 0);
          expect(checks[i].eye.y).toBeCloseTo(checks[i].arrow!.y, 0);
          expect(checks[i].eye.width).toBeCloseTo(checks[i].arrow!.width, 0);
          expect(checks[i].arrowVisibility).toBe("hidden");
        }
      }
      const alignment = await actions(page).evaluateAll((nodes) =>
        nodes.map((node) => {
          const a = node.querySelector("[data-quick-action-drag-handle]")!.getBoundingClientRect();
          const b = node.querySelector("[data-quick-action-hide]")!.getBoundingClientRect();
          return Math.abs(a.y + a.height / 2 - b.y - b.height / 2);
        }),
      );
      alignment.forEach((delta) => expect(delta).toBeLessThan(1));
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(1);
      if (width === 390) {
        await page.setViewportSize({ width, height: 1500 });
        await page
          .locator("[data-dashboard-personalization]")
          .screenshot({ path: testInfo.outputPath(`dashboard-edit-${theme}.png`) });
      }
      await edit(page);
      await expect(page.locator("[data-dashboard-card-hide]")).toHaveCount(0);
      await expect(page.locator("[data-dashboard-feature-chevron] svg").first()).toBeVisible();
    }
  });


test("failed preference read blocks editing and preserves the account until retry", async ({ page }) => {
  const api = await session(page, true);
  await expect(page.getByText("Kaydedilmiş düzen yüklenemedi.")).toBeVisible();
  await edit(page);
  await expect(page.locator("[data-dashboard-personalization]")).toHaveAttribute("data-editing", "false");
  expect(api.writes).toHaveLength(0);
  api.loadFailure(false);
  await page.getByRole("button", { name: "Yeniden dene", exact: true }).click();
  await expect(page.getByText("Kaydedilmiş düzen yüklenemedi.")).toHaveCount(0);
  await edit(page);
  await expect(page.locator("[data-dashboard-personalization]")).toHaveAttribute("data-editing", "true");
});
