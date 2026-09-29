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

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 412, height: 915 },
] as const;
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
  const markup = renderToStaticMarkup(
    React.createElement(DashboardLiveFeatureCard, { kind, href, locale, theme }),
  ).replaceAll(DASHBOARD_LIVE_FEATURE_CARD_BASE[kind][theme], baseDataUrl(kind, theme));

  return `<!doctype html>
  <html lang="${locale}">
    <head>
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <style>
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; overflow-x: hidden; }
        body { background: ${theme === "dark" ? "#0d1714" : "#f9fcfb"}; }
        .fixture { width: calc(100vw - 32px); max-width: 672px; margin: 24px auto; }
        [data-dashboard-live-feature-card] {
          position: relative;
          display: block;
          width: 100%;
          overflow: hidden;
        }
        [data-dashboard-live-feature-card] > img,
        [data-dashboard-live-feature-card] > svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }
        [data-dashboard-live-feature-card] > img { object-fit: fill; }
      </style>
    </head>
    <body><main class="fixture">${markup}</main></body>
  </html>`;
}

test.beforeAll(() => mkdirSync(SCREENSHOT_ROOT, { recursive: true }));

for (const viewport of VIEWPORTS) {
  for (const kind of KINDS) {
    for (const theme of THEMES) {
      for (const locale of LOCALES) {
        test(`${viewport.width}x${viewport.height} ${kind} ${theme} ${locale} is locked and unclipped`, async ({
          page,
        }) => {
          await page.setViewportSize(viewport);
          await page.setContent(cardMarkup(kind, locale, theme), { waitUntil: "load" });

          const card = page.locator("[data-dashboard-live-feature-card]");
          await expect(card).toHaveCount(1);
          await expect(card.locator("img[data-dashboard-live-feature-base]")).toHaveCount(1);
          await expect(card.locator("svg[data-dashboard-live-feature-text]")).toHaveCount(1);

          const box = await card.boundingBox();
          expect(box).not.toBeNull();
          expect(box!.width).toBeCloseTo(viewport.width - 32, 1);
          expect(box!.height).toBeCloseTo(box!.width / 3, 1);

          const geometry = await card.locator("svg").evaluate((svg) => {
            const texts = Array.from(svg.querySelectorAll("text"));
            return {
              viewBox: svg.getAttribute("viewBox"),
              boxes: texts.map((node) => {
                const box = (node as SVGGraphicsElement).getBBox();
                return {
                  x: box.x,
                  y: box.y,
                  width: box.width,
                  height: box.height,
                  text: node.textContent ?? "",
                };
              }),
            };
          });

          expect(geometry.viewBox).toBe(
            `0 0 ${DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX.width} ${DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX.height}`,
          );

          for (const textBox of geometry.boxes) {
            expect(textBox.x).toBeGreaterThanOrEqual(0);
            expect(textBox.y).toBeGreaterThanOrEqual(0);
            expect(textBox.x + textBox.width, `${textBox.text} overlaps artwork safe zone`).toBeLessThanOrEqual(
              DASHBOARD_LIVE_FEATURE_CARD_LAYOUT[kind].safeTextRight,
            );
            expect(textBox.y + textBox.height).toBeLessThanOrEqual(
              DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX.height,
            );
          }

          await page.screenshot({
            path: join(
              SCREENSHOT_ROOT,
              `${viewport.width}x${viewport.height}-${kind}-${theme}-${locale}.png`,
            ),
            fullPage: true,
          });
        });
      }
    }
  }
}
