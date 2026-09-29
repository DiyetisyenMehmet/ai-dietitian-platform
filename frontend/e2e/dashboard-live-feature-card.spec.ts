import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DashboardLiveFeatureCard } from "../src/presentation/components/dashboard/dashboard-live-feature-card";
import {
  DASHBOARD_LIVE_FEATURE_CARD_BASE,
  type DashboardLiveFeatureCardKind,
  type DashboardLiveFeatureCardLocale,
} from "../src/presentation/components/dashboard/dashboard-live-feature-card-contract";

const ROOT = process.cwd();
const KINDS: DashboardLiveFeatureCardKind[] = ["food", "progress"];
const LOCALES: DashboardLiveFeatureCardLocale[] = ["tr", "en"];

function baseDataUrl(kind: DashboardLiveFeatureCardKind, theme: "light" | "dark") {
  const filename = DASHBOARD_LIVE_FEATURE_CARD_BASE[kind][theme].split("/").at(-1);
  if (!filename) throw new Error(`Missing base asset for ${kind}/${theme}`);
  const bytes = readFileSync(join(ROOT, "public/images/dashboard", filename));
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function cardMarkup(kind: DashboardLiveFeatureCardKind, locale: DashboardLiveFeatureCardLocale) {
  const href = kind === "food" ? "/meals/scan" : "/progress";
  let markup = renderToStaticMarkup(
    React.createElement(DashboardLiveFeatureCard, { kind, href, locale }),
  );
  for (const theme of ["light", "dark"] as const) {
    markup = markup.replaceAll(
      DASHBOARD_LIVE_FEATURE_CARD_BASE[kind][theme],
      baseDataUrl(kind, theme),
    );
  }
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    *{box-sizing:border-box}
    html,body{margin:0}
    .fixture{width:358px;margin:16px}
    [data-dashboard-live-feature-card]{position:relative;display:block;width:100%;aspect-ratio:21/5;overflow:hidden;container-type:inline-size}
    [data-dashboard-live-feature-stage]{position:absolute;z-index:0}
    [data-dashboard-live-feature-stage][data-theme="dark"]{display:none}
    [data-dashboard-live-feature-link]{position:absolute;inset:0;display:block;z-index:10}
    [data-dashboard-live-feature-base]{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}
  </style></head><body><main class="fixture">${markup}</main></body></html>`;
}

for (const kind of KINDS) {
  for (const locale of LOCALES) {
    test(`${kind} ${locale} text and frame stay fixed while theme artwork can be aligned independently`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.setContent(cardMarkup(kind, locale), { waitUntil: "load" });

      const card = page.locator("[data-dashboard-live-feature-card]");
      const texts = card.locator("[data-dashboard-live-feature-text]");
      const chevron = card.locator("[data-dashboard-live-feature-chevron]");

      await expect(card.locator('[data-dashboard-live-feature-stage][data-theme="light"]')).toHaveCount(1);
      await expect(card.locator('[data-dashboard-live-feature-stage][data-theme="dark"]')).toHaveCount(1);
      await expect(texts).toHaveCount(3);
      await expect(chevron).toHaveCount(1);

      const before = await texts.evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        }),
      );
      const chevronBefore = await chevron.boundingBox();

      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await page.addStyleTag({ content: `
        html.dark [data-dashboard-live-feature-stage][data-theme="light"]{display:none}
        html.dark [data-dashboard-live-feature-stage][data-theme="dark"]{display:block}
      ` });

      const after = await texts.evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        }),
      );
      const chevronAfter = await chevron.boundingBox();

      before.forEach((box, index) => {
        expect(after[index].x).toBeCloseTo(box.x, 2);
        expect(after[index].y).toBeCloseTo(box.y, 2);
        expect(after[index].width).toBeCloseTo(box.width, 2);
        expect(after[index].height).toBeCloseTo(box.height, 2);
      });

      expect(chevronAfter!.x).toBeCloseTo(chevronBefore!.x, 2);
      expect(chevronAfter!.y).toBeCloseTo(chevronBefore!.y, 2);
      expect(chevronAfter!.width).toBeCloseTo(chevronBefore!.width, 2);
      expect(chevronAfter!.height).toBeCloseTo(chevronBefore!.height, 2);
    });
  }
}
