/* eslint-disable @typescript-eslint/no-require-imports -- Node's built-in runner loads this CommonJS test. */
// Real Dashboard + AppShell in mobile Chromium. API data is synthetic and local;
// this suite verifies layout and interactions, not authenticated Android runtime.
// Run after: NEXT_PUBLIC_API_BASE_URL=/api npm run build
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const artifacts = process.env.DASHBOARD_VIEWPORT_ARTIFACTS;
const longName = "Mehmet123456789123456789123456789";
const navSelector = 'nav[aria-label="Ana gezinme"]';
const measurements = [];
let browser, server, origin;

before(async () => {
  assert.ok(fs.existsSync(path.join(root, ".next/BUILD_ID")), "Build the frontend first");
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: root,
      stdio: "ignore",
    },
  );
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      ready = (await fetch(`${origin}/login`)).ok;
    } catch {
      /* starting */
    }
    if (ready) break;
    if (server.exitCode !== null) throw new Error("Local frontend server exited");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, "Local frontend server must be ready");
  const dashboardBundle = fs
    .readFileSync(path.join(root, ".next/server/app/dashboard.html"), "utf8")
    .match(/app\/dashboard\/page-[0-9a-f]+\.js/)[0];
  assert.ok(
    (await (await fetch(`${origin}/dashboard`)).text()).includes(dashboardBundle),
    "Server must serve the current build; clear .next and rebuild if a stale runtime route cache remains",
  );
  browser = await chromium.launch({ headless: true });
  console.log(`Dashboard layout engine: Chromium ${browser.version()}`);
  if (artifacts) fs.mkdirSync(artifacts, { recursive: true });
});

after(async () => {
  await browser?.close();
  server?.kill("SIGTERM");
  if (artifacts)
    fs.writeFileSync(
      path.join(artifacts, "measurements.json"),
      JSON.stringify(measurements, null, 2),
    );
});

async function openDashboard({
  width = 390,
  height = 844,
  theme = "light",
  name = longName,
  textScale = 1,
} = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: width < 768,
    hasTouch: true,
    timezoneId: "Europe/Istanbul",
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-10-11T00:10:00Z"));
  let preferences = {
    order: ["food", "blood", "progress", "coach"],
    hidden: ["blood"],
    quickActionOrder: ["meal", "water", "activity", "weight"],
    hiddenQuickActionIds: ["meal"],
  };
  // Intercept only this local test server. No staging access, credentials or storage injection.
  await page.route(`${origin}/api/**`, async (route) => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname.slice(4);
    let data;
    if (endpoint.startsWith("/auth/"))
      data = {
        user: {
          id: "viewport-fixture",
          email: "layout@example.com",
          fullName: name,
          role: "USER",
          isActive: true,
          emailVerified: true,
          onboardingCompleted: true,
          createdAt: "2026-01-01T00:00:00Z",
        },
        tokens: { accessToken: "local-layout-fixture", tokenType: "Bearer", expiresIn: "15m" },
      };
    if (endpoint === "/legal/consents") data = { allMandatoryGranted: true, consents: [] };
    if (endpoint === "/legal/documents") data = { documents: [] };
    if (endpoint === "/onboarding")
      data = {
        profile: {
          age: 36,
          gender: "PREFER_NOT_TO_SAY",
          heightCm: 175,
          currentWeightKg: 79,
          targetWeightKg: 65,
          activityLevel: "MODERATE",
          dietaryPreference: "OMNIVORE",
          healthConditions: [],
          allergies: [],
          dailyWaterGoalMl: 2500,
          usualWakeTime: "07:00",
          usualSleepTime: "23:00",
          workScheduleType: "REGULAR",
        },
      };
    if (endpoint === "/account/dashboard-cards") {
      if (request.method() === "PUT") preferences = request.postDataJSON();
      data = { preferences };
    }
    if (endpoint === "/notifications") data = { notifications: [], unreadCount: 25 };
    if (["/tracking/water", "/tracking/meals", "/tracking/weight"].includes(endpoint))
      data = { logs: [] };
    if (endpoint === "/tracking/water/goal") data = { dailyWaterGoalMl: 2500 };
    if (endpoint === "/tracking/water/recommendation")
      data = {
        recommendation: {
          text: "Suyu gün boyunca düzenli iç.",
          source: "RULE_BASED_FALLBACK",
          todayMl: 0,
          dailyGoalMl: 2500,
          sevenDayAverageMl: 0,
          generatedAt: "2026-10-11T00:10:00Z",
        },
      };
    if (endpoint === "/tracking/weight/check-in")
      data = {
        checkIn: {
          active: false,
          intervalDays: 7,
          required: false,
          lastLoggedAt: null,
          nextDueAt: null,
          overdueDays: 0,
        },
      };
    if (endpoint === "/activity") data = { activities: [] };
    if (endpoint === "/sleep") data = { sleeps: [] };
    if (endpoint === "/sleep/daily-assessment")
      data = {
        assessment: {
          date: "2026-10-11",
          totalDurationMinutes: 0,
          averageQuality: null,
          entries: 0,
          status: "NO_DATA",
          assessment: "Henüz kayıt yok.",
        },
      };
    if (endpoint === "/nutrition-plans") data = { plans: [] };
    if (endpoint === "/goals") data = { goals: [] };
    if (endpoint === "/blood-tests/analyses") data = { analyses: [] };
    if (endpoint === "/ai/sessions") data = { sessions: [] };
    await route.fulfill({
      status: data ? 200 : 503,
      contentType: "application/json",
      body: JSON.stringify(
        data
          ? { success: true, data }
          : { success: false, error: { code: "LOCAL_LAYOUT_FIXTURE", message: "No fixture data" } },
      ),
    });
  });
  try {
    await page.goto(`${origin}/dashboard`);
    await page.locator("[data-dashboard-greeting]").waitFor();
    await page.waitForFunction(
      () => document.querySelectorAll("[data-dashboard-card-slot]").length === 3,
    );
    await page.waitForFunction(() =>
      document.querySelector("[data-dashboard-greeting]").textContent.startsWith("İyi geceler"),
    );
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      theme === "dark",
    );
    if (textScale !== 1) {
      // Computed-font scaling exercises actual text layout, not pixel density/zoom.
      // It is not an emulation of Android's system textZoom implementation.
      await page.evaluate((factor) => {
        const sizes = [...document.querySelectorAll("body *")]
          .filter((node) => node instanceof HTMLElement)
          .map((node) => [node, parseFloat(getComputedStyle(node).fontSize)]);
        for (const [node, size] of sizes) node.style.fontSize = `${size * factor}px`;
      }, textScale);
    }
    await page.waitForFunction(() => {
      const nav = document.querySelector('nav[aria-label="Ana gezinme"]');
      return (
        Math.abs(
          parseFloat(nav.parentElement.style.getPropertyValue("--bottom-navigation-height")) -
            nav.getBoundingClientRect().height,
        ) < 0.1
      );
    });
    return { context, page };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function measure(page) {
  return page.evaluate((selector) => {
    const box = (node) => {
      const r = node.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    const nav = document.querySelector(selector);
    const main = document.querySelector("main");
    const shell = document.querySelector("[data-app-shell]");
    const greeting = document.querySelector("[data-dashboard-greeting]");
    const actions = document.querySelector("[data-dashboard-header-actions]");
    const links = [...nav.querySelectorAll("a")].map((link) => {
      const r = link.getBoundingClientRect();
      return {
        ...box(link),
        clickable: link.contains(
          document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2),
        ),
      };
    });
    return {
      innerWidth,
      innerHeight,
      clientWidth: document.documentElement.clientWidth,
      htmlWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      scrollX,
      scrollY: main.scrollTop,
      documentScrollY: scrollY,
      documentHeight: document.scrollingElement.scrollHeight,
      shell: box(shell),
      shellPosition: getComputedStyle(shell).position,
      main: box(main),
      mainClientHeight: main.clientHeight,
      mainScrollHeight: main.scrollHeight,
      mainScrollWidth: main.scrollWidth,
      mainOverflowY: getComputedStyle(main).overflowY,
      mainScrollLeft: main.scrollLeft,
      visualWidth: visualViewport.width,
      visualHeight: visualViewport.height,
      nav: box(nav),
      navPosition: getComputedStyle(nav).position,
      links,
      greeting: greeting ? box(greeting) : null,
      actions: actions ? box(actions) : null,
      actionsClickable: actions
        ? [...actions.querySelectorAll("button, a")].every((target) => {
            const r = target.getBoundingClientRect();
            return target.contains(
              document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2),
            );
          })
        : null,
      contentBottom: document.querySelector("main > div")?.getBoundingClientRect().bottom,
      cards: [...document.querySelectorAll("[data-dashboard-card-slot]")].map(box),
      quick: [...document.querySelectorAll("[data-quick-action-slot]")].map(box),
      metrics: document.querySelectorAll("[data-dashboard-metrics] > div > div").length,
      mainPaddingBottom: parseFloat(getComputedStyle(document.querySelector("main")).paddingBottom),
      navPaddingBottom: parseFloat(getComputedStyle(nav).paddingBottom),
      rootOverflow: [
        getComputedStyle(document.documentElement).overflowX,
        getComputedStyle(document.body).overflowX,
      ],
    };
  }, navSelector);
}

async function assertViewport(page, width, height) {
  const result = await measure(page);
  assert.equal(result.clientWidth, width);
  assert.equal(
    result.innerWidth,
    width,
    `layout viewport must not be inflated by overflowing text: ${JSON.stringify(result)}`,
  );
  assert.ok(result.htmlWidth <= width, `html overflow ${result.htmlWidth - width}px`);
  assert.ok(result.bodyWidth <= width, `body overflow ${result.bodyWidth - width}px`);
  assert.equal(result.scrollX, 0);
  assert.ok(
    result.rootOverflow.every((value) => value !== "hidden" && value !== "clip"),
    "document overflow must not be masked",
  );
  assert.equal(result.shellPosition, "fixed");
  assert.equal(result.documentScrollY, 0, "the document must not own application scrolling");
  assert.equal(result.documentHeight, height, "document scrollbar must not extend behind the bar");
  assert.ok(
    Math.abs(result.main.bottom - result.nav.top) < 0.5,
    "content scrollport must end at navigation top",
  );
  assert.equal(result.mainScrollLeft, 0);
  assert.ok(result.mainScrollWidth <= result.main.width + 0.5, "no inner horizontal overflow");
  assert.ok(Math.abs(result.nav.left) < 0.5 && Math.abs(result.nav.right - width) < 0.5);
  assert.ok(
    Math.abs(result.nav.bottom - height) < 0.5,
    `nav bottom ${result.nav.bottom}, visible height ${height}`,
  );
  assert.ok(
    result.nav.top >= 0 &&
      result.links.length === 5 &&
      result.links.every((link) => link.clickable),
    "all five tabs must be visible and hittable",
  );
  if (result.greeting) {
    assert.ok(
      result.greeting.right <= result.actions.left,
      "greeting must have its own space before actions",
    );
    assert.ok(result.actions.right <= width - 16 + 0.5);
    if (result.scrollY === 0)
      assert.ok(result.actionsClickable, "theme and notification actions must remain hittable");
    assert.equal(result.metrics, 4);
    assert.equal(result.cards.length, 3);
    const expectedCardWidth = Math.min(width, 672) - 32;
    assert.ok(
      result.cards.every((card) => Math.abs(card.width - expectedCardWidth) < 1),
      "approved card width must be preserved",
    );
    assert.ok(
      Math.max(...result.quick.map((item) => item.width)) -
        Math.min(...result.quick.map((item) => item.width)) <
        1,
      "quick actions remain equal",
    );
  }
  return result;
}

for (const [width, height] of [
  [320, 700],
  [360, 800],
  [390, 844],
  [412, 915],
  [430, 932],
  [768, 1024],
]) {
  for (const theme of ["light", "dark"]) {
    for (const name of ["Mehmet", longName]) {
      for (const textScale of [1, 1.3]) {
        test(`${width}px ${theme}, ${name === longName ? "long unbroken" : "normal"} name, ${textScale * 100}% text: no overflow and stable bottom tabs`, async () => {
          const { page, context } = await openDashboard({ width, height, theme, name, textScale });
          try {
            const initial = await assertViewport(page, width, height);
            await page
              .getByRole("button", { name: "Detaylı günlük takibi göster", exact: true })
              .click();
            const states = [];
            for (const direction of [1, -1, 1, -1, 1]) {
              await page.evaluate(
                (d) =>
                  document.querySelector("[data-app-scroll]").scrollTo({
                    left: 100,
                    top: d > 0 ? document.querySelector("[data-app-scroll]").scrollHeight : 0,
                    behavior: "instant",
                  }),
                direction,
              );
              await page.evaluate(() => new Promise(requestAnimationFrame));
              const current = await assertViewport(page, width, height);
              assert.ok(
                Math.abs(current.nav.top - initial.nav.top) < 0.5,
                "scroll must not move the fixed navigation",
              );
              if (direction > 0) {
                assert.ok(current.scrollY > 0, "test must really scroll a long Dashboard");
                assert.ok(
                  current.contentBottom <= current.nav.top + 0.5,
                  `last content must remain above navigation: ${JSON.stringify(current)}`,
                );
              }
              states.push(current);
            }
            measurements.push({
              width,
              height,
              theme,
              name: name === longName ? "long" : "normal",
              textScale,
              initial,
              scrolled: states[states.length - 1],
            });
            if (artifacts && width === 390 && theme === "light" && textScale === 1) {
              if (name === longName)
                await page.screenshot({ path: path.join(artifacts, "after-long-bottom-390.png") });
              await page
                .getByRole("button", { name: "Detaylı günlük takibi gizle", exact: true })
                .click();
              await page.evaluate(() => document.querySelector("[data-app-scroll]").scrollTo(0, 0));
              await page.screenshot({
                path: path.join(
                  artifacts,
                  `after-${name === longName ? "long" : "normal"}-390.png`,
                ),
              });
            }
          } finally {
            await context.close();
          }
        });
      }
    }
  }
}

for (const textScale of [1, 1.3]) {
  test(`safe-area reserve and viewport height changes keep the final content clear at ${textScale * 100}% text`, async () => {
    const { page, context } = await openDashboard({ textScale });
    try {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { bottom: 34 } });
      await page.getByRole("button", { name: "Detaylı günlük takibi göster", exact: true }).click();
      for (const height of [844, 700, 915, 844]) {
        await page.setViewportSize({ width: 390, height });
        await page.waitForFunction((height) => {
          const nav = document.querySelector('nav[aria-label="Ana gezinme"]');
          const shell = nav.parentElement;
          return (
            Math.abs(shell.getBoundingClientRect().bottom - height) < 0.1 &&
            Math.abs(
              parseFloat(shell.style.getPropertyValue("--bottom-navigation-height")) -
                nav.getBoundingClientRect().height,
            ) < 0.1
          );
        }, height);
        await page.evaluate(() =>
          document.querySelector("[data-app-scroll]").scrollTo({
            left: 100,
            top: document.querySelector("[data-app-scroll]").scrollHeight,
            behavior: "instant",
          }),
        );
        await page.evaluate(() => new Promise(requestAnimationFrame));
        const result = await assertViewport(page, 390, height);
        assert.equal(result.navPaddingBottom, 34, "actual CSS env safe-area inset is exercised");
        if (textScale === 1)
          assert.equal(
            result.mainPaddingBottom + result.nav.height,
            130,
            "existing 96px reserve plus safe area",
          );
        assert.ok(
          result.mainPaddingBottom >= 19.9,
          "reserve must follow wrapped labels and safe-area changes",
        );
        assert.ok(
          result.contentBottom <= result.nav.top,
          "safe-area navigation must not cover final content",
        );
      }
    } finally {
      await context.close();
    }
  });
}

test("fixed tabs navigate all destinations; Dashboard personalization persists without changing geometry", async () => {
  const { page, context } = await openDashboard();
  try {
    for (const href of ["/meals", "/ai", "/progress", "/profile", "/dashboard"]) {
      await page.locator(`${navSelector} a[href="${href}"]`).click();
      await page.waitForURL(`${origin}${href}`);
      await page.locator(`${navSelector} a[aria-current="page"][href="${href}"]`).waitFor();
      if (href === "/dashboard")
        await page.waitForFunction(
          () => document.querySelectorAll("[data-dashboard-card-slot]").length === 3,
        );
      await assertViewport(page, 390, 844);
    }
    for (const theme of ["dark", "light"]) {
      const toggle = page.getByRole("button", { name: /^Görünüm:/ });
      for (let step = 0; step < 3 && await toggle.getAttribute("data-mode") !== theme; step++)
        await toggle.click();
      await page.waitForFunction(
        (dark) => document.documentElement.classList.contains("dark") === dark,
        theme === "dark",
      );
      await assertViewport(page, 390, 844);
    }
    await page.locator("[data-dashboard-header-actions] a").click();
    await page.waitForURL(`${origin}/notifications`);
    // Notification Center intentionally hides primary tabs; preserve that existing contract.
    assert.equal(await page.locator(navSelector).count(), 0);
    await page.locator("[data-diewish-web-back]").click();
    await page.waitForURL(`${origin}/dashboard`);
    await page.waitForFunction(
      () => document.querySelectorAll("[data-dashboard-card-slot]").length === 3,
    );
    await page.getByRole("button", { name: "Ana ekranı düzenle", exact: true }).click();
    await page.locator('[data-dashboard-card-drag-handle="coach"]').focus();
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url().endsWith("/account/dashboard-cards"),
    );
    await page.locator('[data-dashboard-card-drag-handle="coach"]').press("ArrowUp");
    await page.locator("[data-save-dashboard-layout]").click();
    assert.ok((await saved).ok());
    await page.waitForFunction(
      () => document.querySelector("[data-dashboard-personalization]").dataset.editing === "false",
    );
    await page.reload();
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("[data-dashboard-card-slot]")]
          .map((node) => node.dataset.dashboardCardSlot)
          .join(",") === "food,coach,progress",
    );
    await assertViewport(page, 390, 844);
  } finally {
    await context.close();
  }
});

// A2: exercise actual input scrolling, not only programmatic geometry changes.
for (const width of [320, 360, 390, 412, 430]) {
  for (const theme of ["light", "dark"]) {
    test(`${width}px ${theme}: wheel scrolling is contained above the always-hittable navigation`, async () => {
      const { page, context } = await openDashboard({ width, theme });
      try {
        await page
          .getByRole("button", { name: "Detaylı günlük takibi göster", exact: true })
          .click();
        await page.locator("[data-app-scroll]").evaluate((node) => node.scrollTo(0, 0));
        const initial = await assertViewport(page, width, 844);
        assert.equal(initial.mainOverflowY, "auto");
        assert.ok(initial.mainScrollHeight > initial.mainClientHeight);
        await page.mouse.move(width / 2, 400);
        await page.mouse.wheel(0, 500);
        await page.waitForFunction(
          () => document.querySelector("[data-app-scroll]").scrollTop > 100,
        );
        const scrolled = await assertViewport(page, width, 844);
        assert.equal(scrolled.nav.top, initial.nav.top);
        assert.equal(
          scrolled.main.bottom,
          initial.nav.top,
          "scroll indicator ends at the bar, not behind it",
        );
        await page
          .locator("[data-app-scroll]")
          .evaluate((node) => node.scrollTo(0, node.scrollHeight));
        await page.mouse.wheel(0, 1000);
        await page.evaluate(() => new Promise(requestAnimationFrame));
        const bottom = await assertViewport(page, width, 844);
        assert.ok(bottom.contentBottom <= bottom.nav.top);
        await page.mouse.move(width / 2, bottom.nav.top + 20);
        await page.mouse.wheel(0, 1000);
        await page.evaluate(() => new Promise(requestAnimationFrame));
        assert.equal(
          (await measure(page)).scrollY,
          bottom.scrollY,
          "wheel over navigation cannot scroll content",
        );
        await page.setViewportSize({ width, height: 650 });
        await page.waitForFunction(
          () => document.querySelector("[data-app-shell]").getBoundingClientRect().bottom === 650,
        );
        await assertViewport(page, width, 650);
        await page.setViewportSize({ width, height: 844 });
        await page.waitForFunction(
          () => document.querySelector("[data-app-shell]").getBoundingClientRect().bottom === 844,
        );
        await assertViewport(page, width, 844);
        await page.locator(`${navSelector} a[href="/profile"]`).click();
        await page.waitForURL(`${origin}/profile`);
        await assertViewport(page, width, 844);
      } finally {
        await context.close();
      }
    });
  }
}

test("visual-only viewport resize and pan keep Dashboard and Coach composer above the navigation", async () => {
  const { page, context } = await openDashboard();
  try {
    // Controlled viewport events exercise the keyboard resize-visual contract;
    // this is not a physical mobile keyboard or Android runtime assertion.
    await page.evaluate(() => {
      Object.defineProperty(visualViewport, "height", { configurable: true, get: () => 420 });
      Object.defineProperty(visualViewport, "offsetTop", { configurable: true, get: () => 40 });
      visualViewport.dispatchEvent(new Event("resize"));
      visualViewport.dispatchEvent(new Event("scroll"));
    });
    await page.waitForFunction(
      () => document.querySelector("[data-app-shell]").getBoundingClientRect().bottom === 460,
    );
    let result = await measure(page);
    assert.equal(
      result.innerHeight,
      844,
      "layout viewport remains tall while visual viewport shrinks",
    );
    assert.equal(result.shell.top, 40);
    assert.equal(result.nav.bottom, 460);
    assert.equal(result.main.bottom, result.nav.top);
    assert.ok(result.links.every((link) => link.clickable));
    await page.locator(`${navSelector} a[href="/ai"]`).click();
    await page.waitForURL(`${origin}/ai`);
    await page.locator("textarea").waitFor();
    await page.locator("textarea").focus();
    result = await measure(page);
    assert.equal(result.shell.top, 40);
    assert.equal(result.nav.bottom, 460);
    assert.equal(result.main.bottom, result.nav.top);
    assert.equal(
      result.mainScrollHeight,
      result.mainClientHeight,
      "fill mode does not add a competing scroll owner",
    );
    const composer = await page.locator("textarea").boundingBox();
    assert.ok(composer.y >= 40 && composer.y + composer.height <= result.nav.top);
    assert.ok(result.links.every((link) => link.clickable));
    await page.evaluate(() => {
      delete visualViewport.height;
      delete visualViewport.offsetTop;
      visualViewport.dispatchEvent(new Event("resize"));
    });
    await page.waitForFunction(
      () => document.querySelector("[data-app-shell]").getBoundingClientRect().bottom === 844,
    );
    await assertViewport(page, 390, 844);
    await page.getByRole("button", { name: "Sohbet geçmişi", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await assertViewport(page, 390, 844);
  } finally {
    await context.close();
  }
});

test("portalled edit dialog blocks the inner scroll region and restores navigation after closing", async () => {
  const { page, context } = await openDashboard();
  try {
    await page.getByRole("button", { name: "Ana ekranı düzenle", exact: true }).click();
    await page.locator('[data-dashboard-card-drag-handle="coach"]').focus();
    await page.locator('[data-dashboard-card-drag-handle="coach"]').press("ArrowUp");
    await page.getByRole("button", { name: "Ana ekran düzenlemeyi kapat", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    const before = await page.locator("[data-app-scroll]").evaluate((node) => node.scrollTop);
    await page.mouse.move(5, 5);
    await page.mouse.wheel(0, 700);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(
      await page.locator("[data-app-scroll]").evaluate((node) => node.scrollTop),
      before,
    );
    assert.equal(await page.evaluate(() => scrollY), 0);
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await assertViewport(page, 390, 844);
    await page.locator(`${navSelector} a[href="/meals"]`).click();
    await page.waitForURL(`${origin}/meals`);
    await assertViewport(page, 390, 844);
  } finally {
    await context.close();
  }
});
