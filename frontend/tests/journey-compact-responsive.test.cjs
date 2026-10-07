const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { renderJourneyFixture } = require("./helpers/journey-compact-layout-fixture.cjs");

let browser;

before(async () => {
  browser = await chromium.launch({ headless: true });
  console.log(`Journey layout engine: Chromium ${browser.version()}`);
});

after(async () => {
  await browser?.close();
});

async function openFixture(width, height, theme, expanded) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: width < 768,
    hasTouch: width < 768,
    deviceScaleFactor: width < 768 ? 3 : 1,
  });
  const page = await context.newPage();
  await page.setContent(await renderJourneyFixture({ theme, expanded }), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

async function assertNoOverflow(page, expectedRows, expanded, textScale = 1) {
  const result = await page.evaluate(() => {
    const card = document.querySelector("[data-daily-journey-card]").getBoundingClientRect();
    const section = document.querySelector("[data-daily-journey-section]").getBoundingClientRect();
    const toggle = document.querySelector("[data-journey-details-toggle]");
    const rows = [...document.querySelectorAll("[data-journey-row]")].map((node) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    });
    const toggleBox = toggle?.getBoundingClientRect();
    return {
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
      card: { left: card.left, right: card.right, width: card.width, height: card.height },
      section: { left: section.left, right: section.right },
      rows,
      toggleHeight: toggleBox?.height ?? 0,
      ariaExpanded: toggle?.getAttribute("aria-expanded") ?? null,
      heading: document.querySelector("h3").textContent,
      headingFont: getComputedStyle(document.querySelector("h3")).fontSize,
      hintFont: getComputedStyle(document.querySelector("[data-journey-row] p")).fontSize,
      progressRight: document.querySelector("[data-journey-progress-area] [role=progressbar]").getBoundingClientRect().right,
      toggleLeft: toggleBox.left,
      footerTextPresent: document.body.textContent.includes("Tümünü göster"),
    };
  });

  assert.ok(result.pageOverflow <= 1, `horizontal overflow: ${result.pageOverflow}px`);
  assert.ok(result.card.left >= -1 && result.card.right <= (await page.evaluate(() => innerWidth)) + 1);
  assert.equal(result.rows.length, expectedRows);
  assert.ok(result.rows.every((row) => row.left >= result.card.left - 1 && row.right <= result.card.right + 1));
  assert.ok(result.toggleHeight >= 39.5, `toggle touch target: ${result.toggleHeight}px`);
  assert.equal(result.ariaExpanded, expanded ? "true" : "false");
  assert.equal(result.heading, "Bugünkü Yolculuğum");
  assert.equal(result.footerTextPresent, false);
  assert.ok(Math.abs(parseFloat(result.headingFont) - 16 * textScale) < 0.1, "heading font preserved");
  assert.ok(Math.abs(parseFloat(result.hintFont) - 12 * textScale) < 0.1, "task hint font preserved");
  assert.ok(result.toggleLeft >= result.progressRight, "detail control should follow the compact progress bar");
  return result.card.height;
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
    test(`${width}x${height} ${theme}: collapsed Journey is compact and expanded list stays safe`, async () => {
      const collapsed = await openFixture(width, height, theme, false);
      let collapsedHeight;
      try {
        collapsedHeight = await assertNoOverflow(collapsed.page, 1, false);
        assert.ok(collapsedHeight <= 300, `collapsed Journey card too tall: ${collapsedHeight}px`);
        if (width >= 390) assert.ok(collapsedHeight <= 220, `compact Journey height: ${collapsedHeight}px`);
      } finally {
        await collapsed.context.close();
      }

      const expanded = await openFixture(width, height, theme, true);
      try {
        const expandedHeight = await assertNoOverflow(expanded.page, 4, true);
        assert.ok(
          expandedHeight >= collapsedHeight + 120,
          `expanded detail should be meaningfully taller: ${collapsedHeight} -> ${expandedHeight}`,
        );
      } finally {
        await expanded.context.close();
      }
    });
  }
}

for (const expanded of [false, true]) {
  test(`320px / 130% text: ${expanded ? "expanded" : "collapsed"} Journey has no horizontal overflow`, async () => {
    const { context, page } = await openFixture(320, 700, "light", expanded);
    try {
      await page.evaluate(() => {
        for (const node of document.querySelectorAll("[data-daily-journey-section] *")) {
          if (!(node instanceof HTMLElement)) continue;
          const size = parseFloat(getComputedStyle(node).fontSize);
          if (Number.isFinite(size) && size > 0) node.style.fontSize = `${size * 1.3}px`;
        }
      });
      await assertNoOverflow(page, expanded ? 4 : 1, expanded, 1.3);
    } finally {
      await context.close();
    }
  });
}
