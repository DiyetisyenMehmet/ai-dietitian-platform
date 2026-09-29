import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DashboardLiveFeatureCard } from "../src/presentation/components/dashboard/dashboard-live-feature-card";
import {
  DASHBOARD_LIVE_FEATURE_CARD_BASE,
  DASHBOARD_LIVE_FEATURE_CARD_LAYOUT,
  DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX,
  type DashboardLiveFeatureCardKind,
  type DashboardLiveFeatureCardLocale,
  type DashboardLiveFeatureCardTheme,
} from "../src/presentation/components/dashboard/dashboard-live-feature-card-contract";

const ROOT = process.cwd();
const SCREENSHOT_ROOT = join(ROOT, "test-results/dashboard-live-feature-card");
const VIEWPORTS = [{ width: 390, height: 844 }, { width: 412, height: 915 }] as const;
const THEMES: DashboardLiveFeatureCardTheme[] = ["light", "dark"];
const LOCALES: DashboardLiveFeatureCardLocale[] = ["tr", "en"];
const KINDS: DashboardLiveFeatureCardKind[] = ["food", "progress"];

function baseDataUrl(kind: DashboardLiveFeatureCardKind, theme: DashboardLiveFeatureCardTheme) {
  const filename = DASHBOARD_LIVE_FEATURE_CARD_BASE[kind][theme].split("/").at(-1);
  if (!filename) throw new Error(`Missing base asset for ${kind}/${theme}`);
  const bytes = readFileSync(join(ROOT, "public/images/dashboard", filename));
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function cardMarkup(
  kind: DashboardLiveFeatureCardKind,
  locale: DashboardLiveFeatureCardLocale,
  theme: DashboardLiveFeatureCardTheme,
) {
  const href = kind === "food" ? "/meals/scan" : "/progress";
  let markup = renderToStaticMarkup(
    React.createElement(DashboardLiveFeatureCard, { kind, href, locale }),
  );

  for (const baseTheme of THEMES) {
    markup = markup.replaceAll(
      DASHBOARD_LIVE_FEATURE_CARD_BASE[kind][baseTheme],
      baseDataUrl(kind, baseTheme),
    );
  }

  return `<!doctype html>
  <html lang="${locale}" class="${theme === "dark" ? "dark" : ""}">
    <head>
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <style>
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; overflow-x: hidden; }
        .fixture { width: calc(100vw - 32px); max-width: 672px; margin: 24px auto; }
        [data-dashboard-live-feature-card] {
          position: relative;
          display: block;
          width: 100%;
          aspect-ratio: 1536 / 512;
          overflow: hidden;
          container-type: inline-size;
        }
        [data-dashboard-live-feature-base] {
          position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill;
        }
        [data-dashboard-live-feature-base][data-theme="dark"] { display: none; }
        html.dark [data-dashboard-live-feature-base][data-theme="light"] { display: none; }
        html.dark [data-dashboard-live-feature-base][data-theme="dark"] { display: block; }
      </style>
    </head>
    <body><main class="fixture">${markup}</main></body>
  </html>`;
}

test.beforeAll(() => mkdirSync(SCREENSHOT_ROOT, { recursive: true }));

for (const viewport of VIEWPORTS) {
  for (const kind of KINDS) {
    for (const locale of LOCALES) {
      test(`${viewport.width}x${viewport.height} ${kind} ${locale} keeps HTML text fixed across themes`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.setContent(cardMarkup(kind, locale, "light"), { waitUntil: "load" });

        const card = page.locator("[data-dashboard-live-feature-card]");
        await expect(card).toHaveAttribute("data-text-layer", "html");
        await expect(card.locator("[data-dashboard-live-feature-text]")).toHaveCount(3);
        await expect(card.locator("svg")).toHaveCount(0);

        const box = await card.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeCloseTo(box!.width / 3, 1);

        const before = await card.locator("[data-dashboard-live-feature-text]").evaluateAll((nodes) =>
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

        for (const text of before) {
          expect(text.userSelect).toBe("text");
          expect(text.pointerEvents).not.toBe("none");
          expect(text.x - box!.x).toBeGreaterThanOrEqual(0);
          expect(text.x + text.width - box!.x).toBeLessThanOrEqual(
            (box!.width * DASHBOARD_LIVE_FEATURE_CARD_LAYOUT[kind].safeTextRight) /
              DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX.width +
              1,
          );
        }

        await page.evaluate(() => document.documentElement.classList.add("dark"));
        const after = await card.locator("[data-dashboard-live-feature-text]").evaluateAll((nodes) =>
          nodes.map((node) => {
            const box = node.getBoundingClientRect();
            return { x: box.x, y: box.y, width: box.width, height: box.height };
          }),
        );

        before.forEach((text, index) => {
          expect(after[index].x).toBeCloseTo(text.x, 2);
          expect(after[index].y).toBeCloseTo(text.y, 2);
          expect(after[index].width).toBeCloseTo(text.width, 2);
          expect(after[index].height).toBeCloseTo(text.height, 2);
        });

        await page.screenshot({
          path: join(SCREENSHOT_ROOT, `${viewport.width}x${viewport.height}-${kind}-${locale}-html.png`),
          fullPage: true,
        });
      });
    }
  }
}
