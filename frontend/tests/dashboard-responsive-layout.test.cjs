const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");
const { renderFixture } = require("./helpers/dashboard-layout-fixture.cjs");

let browser;
before(async () => {
  browser = await chromium.launch({
    executablePath: process.env.DASHBOARD_CHROMIUM_PATH || undefined,
    headless: true,
  });
  console.log(`Layout engine: Chromium ${browser.version()}`);
});
after(async () => {
  await browser?.close();
});

// Text-only stress simulation, NOT an Android WebView emulator. In particular,
// deviceScaleFactor and page zoom alone do not exercise WebSettings.textZoom.
async function scaleText(page, multiplier) {
  await page.evaluate((scale) => {
    const nodes = [...document.querySelectorAll("main *")].filter((node) =>
      [...node.childNodes].some(
        (child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim(),
      ),
    );
    const sizes = nodes.map((node) => [node, parseFloat(getComputedStyle(node).fontSize)]);
    for (const [node, size] of sizes) node.style.fontSize = `${size * scale}px`;
  }, multiplier);
}

async function assertLayout(page) {
  const violations = await page.evaluate(() => {
    const failures = [];
    const visible = (node) =>
      node.getBoundingClientRect().width > 0 && getComputedStyle(node).visibility !== "hidden";
    const name = (node) =>
      `${node.tagName}.${node.className}: ${node.textContent.trim().slice(0, 55)}`;
    const contains = (outer, inner) =>
      inner.left >= outer.left - 1 &&
      inner.right <= outer.right + 1 &&
      inner.top >= outer.top - 1 &&
      inner.bottom <= outer.bottom + 1;
    const overlaps = (a, b) =>
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    if (document.documentElement.scrollWidth > innerWidth + 1)
      failures.push("Page has horizontal overflow");
    const textNodes = [...document.querySelectorAll("main *")].filter(
      (node) =>
        visible(node) &&
        [...node.childNodes].some(
          (child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim(),
        ),
    );
    for (const node of textNodes) {
      const box = node.getBoundingClientRect();
      const surface = node.closest("[data-dashboard-responsive-surface], [data-journey-row]");
      if (!surface) {
        failures.push(`Missing measured surface: ${name(node)}`);
        continue;
      }
      if (!contains(surface.getBoundingClientRect(), box))
        failures.push(`Outside surface: ${name(node)}`);
      if (node.scrollWidth > node.clientWidth + 1 && getComputedStyle(node).display !== "inline")
        failures.push(`Text horizontal overflow: ${name(node)}`);
      if (
        ["hidden", "clip"].includes(getComputedStyle(node).overflow) ||
        getComputedStyle(node).textOverflow === "ellipsis"
      )
        failures.push(`Clipped text: ${name(node)}`);
      for (const child of node.childNodes) {
        if (child.nodeType !== Node.TEXT_NODE || !child.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(child);
        for (const line of range.getClientRects()) {
          if (!contains(box, line)) failures.push(`Text glyphs outside own box: ${name(node)}`);
        }
      }
    }
    for (const selector of [
      ".dashboard-feature-card",
      ".dashboard-feature-body",
      ".dashboard-blood-body",
      ".dashboard-blood-heading",
      ".dashboard-blood-row",
      ".dashboard-coach-banner",
      ".dashboard-coach-body",
      ".dashboard-coach-action",
      "[data-journey-row]",
      "[data-journey-row] .flex-wrap",
    ]) {
      for (const parent of document.querySelectorAll(selector)) {
        if (!visible(parent)) continue;
        const children = [...parent.children].filter(
          (node) => visible(node) && getComputedStyle(node).position !== "absolute",
        );
        for (let i = 0; i < children.length; i++) {
          for (let j = i + 1; j < children.length; j++) {
            if (overlaps(children[i].getBoundingClientRect(), children[j].getBoundingClientRect()))
              failures.push(
                `Overlapping regions: ${selector} / ${name(children[i])} / ${name(children[j])}`,
              );
          }
        }
      }
    }
    return failures;
  });
  assert.deepEqual(violations, []);
}

async function fixturePage({ width, height, locale, theme, mobile = true }) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 3 : 1,
  });
  const page = await context.newPage();
  const html = await renderFixture(locale, theme);
  await page.route("http://layout.test/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/")
      return route.fulfill({ body: html, contentType: "text/html; charset=utf-8" });
    const file = pathname.startsWith("/_next/")
      ? path.join(__dirname, "../.next", pathname.slice("/_next/".length))
      : path.join(__dirname, "../public", pathname);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({ path: file });
    // Local-only navigation target, no real accounts or API requests.
    return route.fulfill({
      body: "<main>Destination</main>",
      contentType: "text/html; charset=utf-8",
    });
  });
  await page.goto("http://layout.test/");
  await page.evaluate(() => document.fonts.ready);
  if (process.env.DASHBOARD_PRODUCTION_FONTS === "1")
    assert.equal(await page.evaluate(() => document.fonts.check("16px Inter")), true);
  return { context, page };
}

const screens = [
  [320, 568],
  [360, 800],
  [390, 844],
  [412, 915],
  [480, 960],
  [768, 1024],
  [1024, 768],
  [1440, 900],
];
for (const [width, height] of screens) {
  for (const locale of ["tr", "en"]) {
    for (const theme of ["light", "dark"]) {
      test(`${width}x${height} ${locale} ${theme}: 100/130/150/200% text and 200% root font`, async () => {
        const { context, page } = await fixturePage({
          width,
          height,
          locale,
          theme,
          mobile: width < 1024,
        });
        try {
          for (const scale of [1, 1.3, 1.5, 2]) {
            if (scale !== 1) await page.reload();
            await page.evaluate(() => document.fonts.ready);
            await scaleText(page, scale);
            await assertLayout(page);
          }
          await page.reload();
          await page.evaluate(() => document.fonts.ready);
          await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
          await assertLayout(page);
        } finally {
          await context.close();
        }
      });
    }
  }
}

test("theme geometry, artwork loading, focus, touch hit targets and destinations", async () => {
  const { context, page } = await fixturePage({
    width: 390,
    height: 844,
    locale: "tr",
    theme: "light",
  });
  try {
    const boxes = () =>
      page.locator("[data-dashboard-responsive-surface]:visible").evaluateAll((nodes) =>
        nodes.map((node) => {
          const b = node.getBoundingClientRect();
          return [b.x, b.y, b.width, b.height];
        }),
      );
    const light = await boxes();
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    assert.deepEqual(await boxes(), light);
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    const assets = await page.locator("svg image").evaluateAll(async (nodes) =>
      Promise.all(
        nodes.map(
          (node) =>
            new Promise((resolve) => {
              const image = new Image();
              image.onload = () => resolve(true);
              image.onerror = () => resolve(false);
              image.src = node.getAttribute("href");
            }),
        ),
      ),
    );
    assert.ok(assets.length > 0 && assets.every(Boolean));
    for (const [selector, destination] of [
      ['[data-kind="food"] [data-dashboard-live-feature-link]', "/meals/scan"],
      ['[data-blood-test-card][data-theme="light"] [data-blood-test-link]', "/profile/blood-tests"],
      ['[data-kind="progress"] [data-dashboard-live-feature-link]', "/progress"],
      [".dashboard-coach-action", "/ai"],
    ]) {
      const link = page.locator(selector);
      await link.focus();
      assert.equal(await link.evaluate((node) => document.activeElement === node), true);
      const box = await link.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
      await Promise.all([page.waitForURL(`http://layout.test${destination}`), link.tap()]);
      assert.equal(new URL(page.url()).pathname, destination);
      await page.goto("http://layout.test/");
    }
    if (process.env.DASHBOARD_LAYOUT_ARTIFACTS) {
      const directory = process.env.DASHBOARD_LAYOUT_ARTIFACTS;
      fs.mkdirSync(directory, { recursive: true });
      await page.screenshot({
        path: path.join(directory, "dashboard-390-light.png"),
        fullPage: true,
        animations: "disabled",
      });
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await page.screenshot({
        path: path.join(directory, "dashboard-390-dark.png"),
        fullPage: true,
        animations: "disabled",
      });
      await page.evaluate(() => document.documentElement.classList.remove("dark"));
      await scaleText(page, 2);
      await page.screenshot({
        path: path.join(directory, "dashboard-390-text-200.png"),
        fullPage: true,
        animations: "disabled",
      });
    }
  } finally {
    await context.close();
  }
});
