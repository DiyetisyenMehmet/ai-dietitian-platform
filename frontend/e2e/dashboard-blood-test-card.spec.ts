import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BloodTestCard } from "../src/presentation/components/dashboard/blood-test-card";
import {
  BLOOD_TEST_CARD_BASE,
  type BloodTestCardLocale,
  type BloodTestCardTheme,
} from "../src/presentation/components/dashboard/blood-test-card-contract";

const ROOT = process.cwd();
const LOCALES: BloodTestCardLocale[] = ["tr", "en"];
const THEMES: BloodTestCardTheme[] = ["light", "dark"];

function baseDataUrl(theme: BloodTestCardTheme) {
  const filename = BLOOD_TEST_CARD_BASE[theme].split("/").at(-1);
  if (!filename) throw new Error(`Missing base asset for ${theme}`);
  const bytes = readFileSync(join(ROOT, "public/images/dashboard", filename));
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function cardMarkup(locale: BloodTestCardLocale, theme: BloodTestCardTheme) {
  const markup = renderToStaticMarkup(
    React.createElement(BloodTestCard, { href: "/profile/blood-tests", locale, theme }),
  ).replaceAll(BLOOD_TEST_CARD_BASE[theme], baseDataUrl(theme));

  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    *{box-sizing:border-box}
    html,body{margin:0}
    .fixture{width:358px;margin:16px}
    [data-blood-test-card]{position:relative;display:block;width:100%;aspect-ratio:21/5;overflow:hidden}
    [data-blood-test-stage]{position:absolute;container-type:inline-size}
    [data-blood-test-link]{position:absolute;inset:0;display:block}
    [data-blood-test-base-visual]{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}
  </style></head><body><main class="fixture">${markup}</main></body></html>`;
}

for (const theme of THEMES) {
  for (const locale of LOCALES) {
    test(`${theme} ${locale} blood frame is uniform and text is selectable outside anchor`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.setContent(cardMarkup(locale, theme), { waitUntil: "load" });

      const card = page.locator("[data-blood-test-card]");
      const texts = card.locator("[data-blood-test-live-text]");
      await expect(card).toHaveAttribute("data-frame-aspect", "21:5");
      await expect(card.locator("[data-blood-test-link]")).toHaveCount(1);
      await expect(texts).toHaveCount(15);

      const box = await card.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeCloseTo(box!.width / 4.2, 1);

      const state = await texts.evaluateAll((nodes) =>
        nodes.map((node) => ({
          inAnchor: Boolean(node.closest("a")),
          userSelect: getComputedStyle(node).userSelect,
          pointerEvents: getComputedStyle(node).pointerEvents,
        })),
      );
      for (const item of state) {
        expect(item.inAnchor).toBe(false);
        expect(item.userSelect).toBe("text");
        expect(item.pointerEvents).not.toBe("none");
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
