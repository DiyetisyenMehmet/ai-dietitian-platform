import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BloodTestCard } from "../src/presentation/components/dashboard/blood-test-card";
import {
  BLOOD_TEST_CARD_BASE,
  BLOOD_TEST_CARD_VIEWBOX,
  type BloodTestCardLocale,
  type BloodTestCardTheme,
} from "../src/presentation/components/dashboard/blood-test-card-contract";

const ROOT = process.cwd();
const SCREENSHOT_ROOT = join(ROOT, "test-results/blood-test-card");

const CASES = [
  { width: 390, height: 844 },
  { width: 412, height: 915 },
] as const;
const THEMES: BloodTestCardTheme[] = ["light", "dark"];
const LOCALES: BloodTestCardLocale[] = ["tr", "en"];

function baseDataUrl(theme: BloodTestCardTheme) {
  const filename = BLOOD_TEST_CARD_BASE[theme].split("/").at(-1);
  if (!filename) throw new Error(`Missing Blood Test base asset for ${theme}`);
  const bytes = readFileSync(join(ROOT, "public/images/dashboard", filename));
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function cardMarkup(locale: BloodTestCardLocale, theme: BloodTestCardTheme) {
  const markup = renderToStaticMarkup(
    React.createElement(BloodTestCard, {
      href: "/profile/blood-tests",
      locale,
      theme,
    }),
  ).replaceAll(BLOOD_TEST_CARD_BASE[theme], baseDataUrl(theme));

  return `<!doctype html>
  <html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}">
    <head>
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <style>
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; overflow-x: hidden; }
        body { background: ${theme === "dark" ? "#0d1714" : "#f9fcfb"}; }
        .fixture { width: calc(100vw - 32px); max-width: 672px; margin: 24px auto; }
        [data-blood-test-card] { position: relative; display: block; width: 100%; overflow: hidden; }
        [data-blood-test-card] > img,
        [data-blood-test-card] > svg { position: absolute; inset: 0; width: 100%; height: 100%; }
        [data-blood-test-card] > img { object-fit: fill; }
      </style>
    </head>
    <body><main class="fixture">${markup}</main></body>
  </html>`;
}

async function assertSvgGeometry(page: import("@playwright/test").Page, locale: BloodTestCardLocale) {
  const geometry = await page.locator("[data-blood-test-live-text]").evaluate((svg) => {
    const texts = Array.from(svg.querySelectorAll("text"));
    const title = texts[0];
    const rows = Array.from(svg.querySelectorAll("[data-blood-test-row]"));
    const textBoxes = texts.map((node) => {
      const box = (node as SVGGraphicsElement).getBBox();
      return { x: box.x, y: box.y, width: box.width, height: box.height, text: node.textContent ?? "" };
    });
    return {
      viewBox: svg.getAttribute("viewBox"),
      titleText: title?.textContent ?? "",
      titleTspans: title?.querySelectorAll("tspan").length ?? -1,
      rowYs: rows.map((row) => Array.from(row.querySelectorAll("text")).map((node) => node.getAttribute("y"))),
      valueXs: rows.map((row) => row.querySelectorAll("text")[1]?.getAttribute("x")),
      valueAnchors: rows.map((row) => row.querySelectorAll("text")[1]?.getAttribute("text-anchor")),
      textBoxes,
    };
  });

  expect(geometry.viewBox).toBe(`0 0 ${BLOOD_TEST_CARD_VIEWBOX.width} ${BLOOD_TEST_CARD_VIEWBOX.height}`);
  expect(geometry.titleTspans).toBe(0);
  if (locale === "en") expect(geometry.titleText).toBe("Blood Test Analysis");
  expect(geometry.rowYs).toHaveLength(5);
  for (const pair of geometry.rowYs) {
    expect(pair).toHaveLength(2);
    expect(pair[0]).toBe(pair[1]);
  }
  expect(new Set(geometry.valueXs).size).toBe(1);
  expect(new Set(geometry.valueAnchors)).toEqual(new Set(["end"]));

  for (const box of geometry.textBoxes) {
    expect(box.x, `${box.text} starts outside viewBox`).toBeGreaterThanOrEqual(0);
    expect(box.y, `${box.text} starts outside viewBox`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${box.text} clips horizontally`).toBeLessThanOrEqual(BLOOD_TEST_CARD_VIEWBOX.width);
    expect(box.y + box.height, `${box.text} clips vertically`).toBeLessThanOrEqual(BLOOD_TEST_CARD_VIEWBOX.height);
  }
}

test.beforeAll(() => mkdirSync(SCREENSHOT_ROOT, { recursive: true }));

for (const viewport of CASES) {
  for (const theme of THEMES) {
    for (const locale of LOCALES) {
      test(`${viewport.width}x${viewport.height} ${theme} ${locale} has no overflow or clipping`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.setContent(cardMarkup(locale, theme), { waitUntil: "load" });

        const card = page.locator("[data-blood-test-card]");
        await expect(card).toHaveCount(1);
        await expect(card.locator("img[data-blood-test-base-visual]")).toHaveCount(1);
        await expect(card.locator("svg[data-blood-test-live-text]")).toHaveCount(1);

        const pageMetrics = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(pageMetrics.scrollWidth).toBeLessThanOrEqual(pageMetrics.clientWidth);

        const box = await card.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeCloseTo(viewport.width - 32, 1);
        expect(box!.height).toBeCloseTo((box!.width * 413) / 1438, 1);

        await assertSvgGeometry(page, locale);

        await page.screenshot({
          path: join(SCREENSHOT_ROOT, `${viewport.width}x${viewport.height}-${theme}-${locale}.png`),
          fullPage: true,
        });
      });
    }
  }
}
