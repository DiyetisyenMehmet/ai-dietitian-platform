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
const CASES = [{ width: 390, height: 844 }, { width: 412, height: 915 }] as const;
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
    React.createElement(BloodTestCard, { href: "/profile/blood-tests", locale, theme }),
  ).replaceAll(BLOOD_TEST_CARD_BASE[theme], baseDataUrl(theme));

  return `<!doctype html>
  <html lang="${locale}">
    <head>
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <style>
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; overflow-x: hidden; }
        .fixture { width: calc(100vw - 32px); max-width: 672px; margin: 24px auto; }
        [data-blood-test-card] {
          position: relative; display: block; width: 100%; overflow: hidden;
          aspect-ratio: 1438 / 413; container-type: inline-size;
        }
        [data-blood-test-base-visual] {
          position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill;
        }
      </style>
    </head>
    <body><main class="fixture">${markup}</main></body>
  </html>`;
}

test.beforeAll(() => mkdirSync(SCREENSHOT_ROOT, { recursive: true }));

for (const viewport of CASES) {
  for (const theme of THEMES) {
    for (const locale of LOCALES) {
      test(`${viewport.width}x${viewport.height} ${theme} ${locale} uses selectable HTML text`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.setContent(cardMarkup(locale, theme), { waitUntil: "load" });

        const card = page.locator("[data-blood-test-card]");
        await expect(card).toHaveAttribute("data-text-layer", "html");
        await expect(card.locator("svg")).toHaveCount(0);
        await expect(card.locator("[data-blood-test-live-text]")).toHaveCount(15);

        const box = await card.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeCloseTo(
          (box!.width * BLOOD_TEST_CARD_VIEWBOX.height) / BLOOD_TEST_CARD_VIEWBOX.width,
          1,
        );

        const textState = await card.locator("[data-blood-test-live-text]").evaluateAll((nodes) =>
          nodes.map((node) => {
            const box = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return {
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
              userSelect: style.userSelect,
              pointerEvents: style.pointerEvents,
            };
          }),
        );

        for (const text of textState) {
          expect(text.userSelect).toBe("text");
          expect(text.pointerEvents).not.toBe("none");
          expect(text.x - box!.x).toBeGreaterThanOrEqual(-1);
          expect(text.y - box!.y).toBeGreaterThanOrEqual(-1);
          expect(text.x + text.width - box!.x).toBeLessThanOrEqual(box!.width + 1);
          expect(text.y + text.height - box!.y).toBeLessThanOrEqual(box!.height + 1);
        }

        await page.screenshot({
          path: join(SCREENSHOT_ROOT, `${viewport.width}x${viewport.height}-${theme}-${locale}-html.png`),
          fullPage: true,
        });
      });
    }
  }
}
