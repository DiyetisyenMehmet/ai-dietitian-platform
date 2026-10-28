import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createDashboardSession } from "./dashboard-test-session";

let diagnosticDragAttempt = 0;
const api = process.env.E2E_API_BASE_URL || "http://127.0.0.1:4000/api";
const originalCards = ["food", "blood", "progress", "coach"];
const originalActions = ["meal", "water", "activity", "weight"];
const cardIds = (page: Page) =>
  page
    .locator("[data-dashboard-card-slot]")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-dashboard-card-slot")));
const actionIds = (page: Page) =>
  page
    .locator("[data-quick-action-slot]")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-quick-action-slot")));
const editor = (page: Page) => page.locator("[data-dashboard-personalization]");
async function open(page: Page) {
  const toggle = page.getByRole("button", { name: "Ana ekranı düzenle" });
  await expect(toggle).toBeEnabled({ timeout: 60_000 });
  await toggle.click();
  await expect(editor(page)).toHaveAttribute("data-editing", "true");
}
async function save(page: Page) {
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "PUT" &&
      new URL(candidate.url()).pathname.endsWith("/account/dashboard-cards"),
  );
  await page.locator("[data-save-dashboard-layout]").click();
  expect((await response).ok()).toBe(true);
  await expect(editor(page)).toHaveAttribute("data-editing", "false");
}
async function drag(page: Page, sourceSelector: string, targetSelector: string, axis: "x" | "y") {
  const source = page.locator(sourceSelector);
  await source.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
  await page.waitForTimeout(250);
  const from = (await source.boundingBox())!;
  const to = (await page.locator(targetSelector).boundingBox())!;
  const x = from.x + from.width / 2,
    y = from.y + from.height / 2;
  // Diagnostic only: sample the original point and condition in one evaluation.
  // Never serialize text, HTML, account data, requests, cookies or storage.
  const geometry = await page.evaluate(
    ({ x, y, selector, targetSelector, recordedFrom, recordedTo }) => {
      const allowedAttributes = [
        "data-dashboard-card-slot", "data-quick-action-slot", "data-app-scroll",
        "data-app-shell", "data-personalize-group", "data-personalize-item",
        "data-dashboard-card-drag-surface", "data-quick-action-drag-surface",
        "data-dashboard-card-hide", "data-dashboard-personalization-control",
        "data-save-dashboard-layout", "data-hidden-items-sheet",
      ];
      const rect = (element: Element | null) => {
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height,
          top: box.top, right: box.right, bottom: box.bottom, left: box.left,
          center: { x: box.left + box.width / 2, y: box.top + box.height / 2 } };
      };
      const describe = (element: Element | null) => {
        if (!element) return null;
        const style = getComputedStyle(element);
        return {
          tagName: element.tagName,
          classes: Array.from(element.classList).slice(0, 32),
          data: Object.fromEntries(allowedAttributes.filter((name) => element.hasAttribute(name))
            .map((name) => [name, element.getAttribute(name)])),
          rect: rect(element),
          pointerEvents: style.pointerEvents, zIndex: style.zIndex,
          transform: style.transform, visibility: style.visibility,
          display: style.display, opacity: style.opacity,
        };
      };
      const source = document.querySelector(selector);
      const target = document.querySelector(targetSelector);
      const top = document.elementFromPoint(x, y);
      // This is the original assertion's exact predicate at its original x/y.
      const matches = !!top?.closest(selector);
      const scroll = source?.closest("[data-app-scroll]") ?? null;
      const center = rect(source)?.center;
      const viewport = window.visualViewport;
      return {
        matches, point: { x, y }, recordedFrom, recordedTo,
        viewport: { width: innerWidth, height: innerHeight, devicePixelRatio,
          scrollX, scrollY, visual: viewport ? {
            width: viewport.width, height: viewport.height, scale: viewport.scale,
            offsetLeft: viewport.offsetLeft, offsetTop: viewport.offsetTop,
            pageLeft: viewport.pageLeft, pageTop: viewport.pageTop,
          } : null },
        source: describe(source), target: describe(target),
        currentCenterMatches: center
          ? !!document.elementFromPoint(center.x, center.y)?.closest(selector) : false,
        top: describe(top),
        nearestCard: describe(top?.closest("[data-dashboard-card-slot], [data-quick-action-slot]") ?? null),
        nearestScroll: describe(top?.closest("[data-app-scroll]") ?? null),
        scroll: scroll ? { element: describe(scroll), top: scroll.scrollTop,
          left: scroll.scrollLeft, height: scroll.scrollHeight, width: scroll.scrollWidth } : null,
        shell: describe(source?.closest("[data-app-shell]") ?? null),
        layers: document.elementsFromPoint(x, y).slice(0, 8).map(describe),
        measuredAtMs: performance.now(),
      };
    },
    { x, y, selector: sourceSelector, targetSelector, recordedFrom: from, recordedTo: to },
  );
  const sequence = String(++diagnosticDragAttempt).padStart(2, "0");
  await writeFile(test.info().outputPath(`hittest-${sequence}.json`), JSON.stringify({
    sourceSha: process.env.DIEWISH_DIAGNOSTIC_SOURCE_SHA,
    baselineSha: "905296a1d554f89157fb660d8e27008785bee9d2",
    sourceSelector, targetSelector, axis, ...geometry,
  }, null, 2));
  console.log("DASHBOARD_HITTEST", JSON.stringify({ sequence, sourceSelector,
    point: geometry.point, matches: geometry.matches,
    top: geometry.top, scroll: geometry.scroll, viewport: geometry.viewport }));
  expect(geometry.matches).toBe(true);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(
    axis === "x" ? to.x + to.width * 0.2 : x,
    axis === "y" ? to.y + to.height * 0.2 : y,
    { steps: 12 },
  );
  await page.mouse.up();
}
async function reorderAndHide(page: Page) {
  await drag(page, '[data-dashboard-card-slot="blood"]', '[data-dashboard-card-slot="food"]', "y");
  await expect.poll(() => cardIds(page)).toEqual(["blood", "food", "progress", "coach"]);
  await drag(page, '[data-quick-action-slot="weight"]', '[data-quick-action-slot="meal"]', "x");
  await expect.poll(() => actionIds(page)).toEqual(["weight", "meal", "water", "activity"]);
  await page.getByRole("button", { name: "İlerlememi Gör kartını gizle" }).click();
  await page.getByRole("button", { name: "Hareket hızlı işlemini gizle" }).click();
}
async function restore(page: Page) {
  await page.getByRole("button", { name: "Gizlenenleri Gör" }).click();
  const sheet = page.locator("[data-hidden-items-sheet]");
  // The panel remembers its last tab when reopened during the same edit session.
  await sheet.getByRole("tab", { name: "Kartlar", exact: true }).click();
  await sheet
    .locator('[data-hidden-card="progress"]')
    .getByRole("button", { name: "Göster" })
    .click();
  await sheet.getByRole("tab", { name: "Hızlı İşlemler" }).click();
  await sheet
    .locator('[data-hidden-quick-action="activity"]')
    .getByRole("button", { name: "Göster" })
    .click();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
}

test("Dashboard deployed runtime: explicit save, discard, reorder, hide/show, refresh and navigation", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const account = await createDashboardSession(page, request, {
    workScheduleType: "VARIABLE_SHIFT",
  });
  await expect(page.getByRole("button", { name: "Ana ekranı düzenle" })).toBeEnabled({
    timeout: 60_000,
  });
  await expect.poll(() => cardIds(page), { timeout: 20_000 }).toEqual(originalCards);
  let writes = 0;
  page.on("request", (req) => {
    if (req.method() === "PUT" && new URL(req.url()).pathname.endsWith("/account/dashboard-cards"))
      writes++;
  });
  const readSaved = async () => {
    const response = await request.get(`${api}/account/dashboard-cards`, {
      headers: { authorization: `Bearer ${account.token}` },
    });
    expect(response.ok()).toBe(true);
    return (await response.json()).data.preferences;
  };
  const food = page.locator('[data-dashboard-card-slot="food"]');
  const baselinePreferences = await readSaved();
  const arrow = food.locator("[data-dashboard-feature-chevron]");
  await open(page);
  await expect(arrow.locator("svg")).toBeHidden();
  const arrowBox = (await arrow.boundingBox())!;
  const eyeBox = (await food.locator("[data-dashboard-card-hide]").boundingBox())!;
  expect(eyeBox.x).toBeCloseTo(arrowBox.x, 0);
  expect(eyeBox.y).toBeCloseTo(arrowBox.y, 0);
  expect(await food.evaluate((node) => getComputedStyle(node).transform)).toBe("none");
  await page.setViewportSize({ width: 390, height: 1500 });
  await editor(page).screenshot({ path: testInfo.outputPath("dashboard-edit-runtime.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await reorderAndHide(page);
  expect(writes).toBe(0);
  const unchanged = await readSaved();
  expect(unchanged).toEqual(baselinePreferences);
  await page.getByRole("button", { name: "Ana ekran düzenlemeyi kapat" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Değişiklikleri kaydetmeden çıkmak istiyor musun?",
  );
  await page.getByRole("button", { name: "Düzenlemeye devam et" }).click();
  await expect(editor(page)).toHaveAttribute("data-editing", "true");
  await page.getByRole("button", { name: "Ana ekran düzenlemeyi kapat" }).click();
  await page.getByRole("button", { name: "Kaydetmeden çık" }).click();
  await expect.poll(() => cardIds(page)).toEqual(originalCards);
  expect(writes).toBe(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Ana ekranı düzenle" })).toBeEnabled({
    timeout: 60_000,
  });
  await expect.poll(() => actionIds(page), { timeout: 20_000 }).toEqual(originalActions);
  await open(page);
  await reorderAndHide(page);
  await save(page);
  expect(writes).toBe(1);
  await expect(arrow.locator("svg")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Ana ekranı düzenle" })).toBeEnabled({
    timeout: 60_000,
  });
  await expect.poll(() => cardIds(page), { timeout: 20_000 }).toEqual(["blood", "food", "coach"]);
  await expect
    .poll(() => actionIds(page), { timeout: 20_000 })
    .toEqual(["weight", "meal", "water"]);
  await open(page);
  await restore(page);
  await expect(page.locator("[data-dashboard-card-slot]")).toHaveCount(4);
  expect(writes).toBe(1);
  expect((await readSaved()).hidden).toEqual(["progress"]);
  await page.getByRole("button", { name: "Ana ekran düzenlemeyi kapat" }).click();
  await page.getByRole("button", { name: "Kaydetmeden çık" }).click();
  await expect(page.locator("[data-dashboard-card-slot]")).toHaveCount(3);
  await open(page);
  await restore(page);
  await save(page);
  expect(writes).toBe(2);
  await page.reload();
  await expect(page.getByRole("button", { name: "Ana ekranı düzenle" })).toBeEnabled({
    timeout: 60_000,
  });
  await expect(page.locator("[data-dashboard-card-slot]")).toHaveCount(4, { timeout: 20_000 });
  await expect(page.locator("[data-quick-action-slot]")).toHaveCount(4, { timeout: 20_000 });
  expect((await readSaved()).hidden).toEqual([]);
  await expect(food.locator("[data-dashboard-card-hide]")).toHaveCount(0);
  await food.locator("[data-dashboard-live-feature-link]").click();
  await expect(page).toHaveURL(/\/meals\/scan(?:$|\?)/);
});
