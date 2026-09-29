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
    [data-dashboard-live-feature-link]{position:absolute;inset:0;display:block;z-index:0}
    [data-dashboard-live-feature-base]{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}
    [data-dashboard-live-feature-base][data-theme="dark"]{display:none}
  </style></head><body><main class="fixture">${markup}</main></body></html>`;
}

for (const kind of KINDS) {
  for (const locale of LOCALES) {
    test(`${kind} ${locale} selectable text lives in visible frame above artwork link`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.setContent(cardMarkup(kind, locale), { waitUntil: "load" });

      const card = page.locator("[data-dashboard-live-feature-card]");
      const stage = card.locator("[data-dashboard-live-feature-stage]");
      const texts = card.locator("[data-dashboard-live-feature-text]");

      await expect(card).toHaveAttribute("data-text-layer", "html-visible-frame");
      await expect(stage).toHaveCount(1);
      await expect(card.locator("[data-dashboard-live-feature-link]")).toHaveCount(1);
      await expect(texts).toHaveCount(3);

      const state = await texts.evaluateAll((nodes) =>
        nodes.map((node) => ({
          inAnchor: Boolean(node.closest("a")),
          inStage: Boolean(node.closest("[data-dashboard-live-feature-stage]")),
          parentIsCard: node.parentElement?.hasAttribute("data-dashboard-live-feature-card") ?? false,
          userSelect: getComputedStyle(node).userSelect,
          pointerEvents: getComputedStyle(node).pointerEvents,
          zIndex: getComputedStyle(node).zIndex,
        })),
      );

      for (const item of state) {
        expect(item.inAnchor).toBe(false);
        expect(item.inStage).toBe(false);
        expect(item.parentIsCard).toBe(true);
        expect(item.userSelect).toBe("text");
        expect(item.pointerEvents).not.toBe("none");
        expect(Number(item.zIndex)).toBeGreaterThan(0);
      }

      const selected = await texts.first().evaluate((node) => {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(node);
        selection?.removeAllRanges();
        selection?.addRange(range);
        return selection?.toString() ?? "";
      });
      expect(selected.trim().length).toBeGreaterThan(0);
    });
  }
}
