import { expect, test, type Page } from "@playwright/test";

// These scenarios target the mobile dialogs; the resize test switches to desktop explicitly.
test.use({ viewport: { width: 390, height: 844 } });
const base = process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3000";
const title = "Bugünkü öğünlerimi analiz eder misin lütfen ve günlük hedeflerimi değerlendir";
async function session(page: Page, area: string) {
  let preferences = {
    order: ["food", "blood", "progress", "coach"],
    hidden: [],
    quickActionOrder: ["meal", "water", "activity", "weight"],
    hiddenQuickActionIds: [],
  };
  let fail = false,
    delay = 0;
  const writes: unknown[] = [],
    operations: string[] = [];
  const conversations = [
    { id: "chat-a", title, pinnedAt: null as string | null, updatedAt: "2026-10-06T12:00:00Z" },
    {
      id: "chat-b",
      title: "Su tüketimimi nasıl artırırım?",
      pinnedAt: null as string | null,
      updatedAt: "2026-10-05T12:00:00Z",
    },
  ];
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text: string) => {
          (window as Window & { copied?: string }).copied = text;
        },
      },
      configurable: true,
    });
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname,
      method = route.request().method();
    const ok = (data: unknown) => route.fulfill({ status: 200, json: { success: true, data } });
    if (path.endsWith("/auth/refresh-token"))
      return ok({
        user: {
          id: "modal-test",
          fullName: "Modal Test",
          email: "modal@example.com",
          role: "USER",
          isActive: true,
          emailVerified: true,
          onboardingCompleted: true,
          createdAt: "2026-01-01T00:00:00Z",
        },
        tokens: { accessToken: "modal-test", tokenType: "Bearer", expiresIn: "15m" },
      });
    if (path.endsWith("/legal/consents")) return ok({ allMandatoryGranted: false, items: [] });
    if (path.endsWith("/account/dashboard-cards")) {
      if (method === "PUT") {
        writes.push(route.request().postDataJSON());
        if (delay) await new Promise((r) => setTimeout(r, delay));
        if (fail)
          return route.fulfill({
            status: 503,
            json: { success: false, error: { code: "TEST_FAILED", message: "Test failure" } },
          });
        preferences = route.request().postDataJSON();
      }
      return ok({ preferences });
    }
    if (path.endsWith("/ai-chat/conversations")) return ok({ conversations });
    const match = path.match(/\/ai-chat\/conversations\/(chat-[ab])(\/pin)?$/);
    if (match) {
      const conv = conversations.find((c) => c.id === match[1])!;
      if (method === "PATCH") {
        operations.push(match[2] ? "pin" : "rename");
        if (match[2])
          conv.pinnedAt = route.request().postDataJSON().pinned ? "2026-10-07T00:00:00Z" : null;
        else conv.title = route.request().postDataJSON().title;
      }
      if (method === "DELETE") {
        operations.push("delete");
        conversations.splice(conversations.indexOf(conv), 1);
        return ok({});
      }
      return ok({
        conversation: {
          ...conv,
          messages: [
            {
              id: "msg-a",
              role: "USER",
              content: "Öğünlerimi analiz eder misin?",
              createdAt: conv.updatedAt,
            },
          ],
        },
      });
    }
    return route.fulfill({
      status: 503,
      json: { success: false, error: { code: "TEST_UNUSED", message: "Unused in modal tests" } },
    });
  });
  await page.goto(`${base}/${area}`);
  await expect(
    page.getByRole("button", {
      name: area === "ai" ? "Sohbet geçmişi" : "Ana ekranı düzenle",
      exact: true,
    }),
  ).toBeVisible();
  if (area === "ai")
    await expect(page.getByText("Öğünlerimi analiz eder misin?", { exact: true })).toBeVisible();
  else
    await expect(page.locator("[data-dashboard-personalization]")).toHaveAttribute(
      "data-saving",
      "false",
    );
  return {
    writes,
    operations,
    fail: (v: boolean) => {
      fail = v;
    },
    delay: (v: number) => {
      delay = v;
    },
  };
}
const dash = (p: Page) => p.locator("[data-dashboard-exit-dialog]");
const opts = (p: Page) => p.locator("[data-coach-options]");
const drawer = (p: Page) => p.locator("[data-coach-drawer]");
const button = (p: Page, name: string) => p.getByRole("button", { name, exact: true });
async function dirty(p: Page) {
  await p.locator("[data-dashboard-edit-toggle]").click();
  await p.locator('[data-dashboard-card-slot="food"] [data-dashboard-card-hide]').click();
  await p.locator("[data-dashboard-edit-toggle]").click();
  await expect(dash(p)).toBeVisible();
}
// Exercise outside dismissal after presentation completes. Radix intentionally
// installs its outside listener after the opening pointer event.
async function presented(p: Page, selector: string) {
  await p.locator(selector).evaluate(async (node) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => {})));
  });
}
async function open(p: Page) {
  await button(p, "Sohbet geçmişi").click();
  await expect(drawer(p)).toBeVisible();
  await presented(p, "[data-coach-drawer]");
}
async function options(p: Page, name = title) {
  await button(p, `${name} sohbet seçenekleri`).click();
  await expect(opts(p)).toBeVisible();
  await presented(p, "[data-coach-options]");
}
async function fit(p: Page, selector: string) {
  await p.waitForTimeout(250);
  const g = await p.locator(selector).evaluate((n) => {
    const b = n.getBoundingClientRect();
    return {
      x: b.x + b.width / 2,
      y: b.y + b.height / 2,
      left: b.left,
      right: b.right,
      top: b.top,
      bottom: b.bottom,
      vw: innerWidth,
      vh: innerHeight,
      overflow: n.scrollWidth > n.clientWidth + 1,
    };
  });
  expect(g.x).toBeCloseTo(g.vw / 2, 0);
  expect(g.y).toBeCloseTo(g.vh / 2, 0);
  expect(g.left).toBeGreaterThanOrEqual(0);
  expect(g.right).toBeLessThanOrEqual(g.vw);
  expect(g.top).toBeGreaterThanOrEqual(0);
  expect(g.bottom).toBeLessThanOrEqual(g.vh);
  expect(g.overflow).toBe(false);
}
for (const theme of ["light", "dark"]) {
  test(`Dashboard direct Save, failed retry and duplicate guard ${theme}`, async ({ page }) => {
    const s = await session(page, "dashboard");
    await page.evaluate(
      (v) => document.documentElement.classList.toggle("dark", v === "dark"),
      theme,
    );
    await dirty(page);
    await expect(
      dash(page).getByRole("button", { name: "Düzenlemeye devam et", exact: true }),
    ).toBeFocused();
    s.fail(true);
    await dash(page).getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(dash(page).getByRole("alert")).toBeVisible();
    s.fail(false);
    s.delay(700);
    await dash(page)
      .getByRole("button", { name: "Kaydet", exact: true })
      .evaluate((n: HTMLButtonElement) => {
        n.click();
        n.click();
      });
    await expect(
      dash(page).getByRole("button", { name: "Düzenlemeye devam et", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dash(page)).toBeVisible();
    await expect(dash(page)).toHaveCount(0);
    expect(s.writes).toHaveLength(2);
    await expect(page.locator("[data-dashboard-personalization]")).toHaveAttribute(
      "data-editing",
      "false",
    );
    await page.reload();
    await expect(page.locator('[data-dashboard-card-slot="food"]')).toHaveCount(0);
  });
  test(`Dashboard Continue, dismiss, Discard and layout ${theme}`, async ({ page }, info) => {
    const s = await session(page, "dashboard");
    await page.evaluate(
      (v) => document.documentElement.classList.toggle("dark", v === "dark"),
      theme,
    );
    await dirty(page);
    await fit(page, "[data-dashboard-exit-dialog]");
    await page.screenshot({ path: info.outputPath(`dashboard-${theme}.png`) });
    await expect(page.locator("body")).toHaveAttribute("data-scroll-locked", "1");
    await button(page, "Düzenlemeye devam et").click();
    await expect(dash(page)).toHaveCount(0);
    await expect(page.locator("[data-dashboard-edit-toggle]")).toBeFocused();
    for (const dismiss of ["close", "escape", "outside"]) {
      await page.locator("[data-dashboard-edit-toggle]").click();
      if (dismiss === "close")
        await dash(page).getByRole("button", { name: "Kapat", exact: true }).click();
      else if (dismiss === "escape") await page.keyboard.press("Escape");
      else {
        await presented(page, "[data-dashboard-exit-dialog]");
        await page.mouse.click(3, 3);
      }
      await expect(dash(page)).toHaveCount(0);
      await expect(page.locator("[data-dashboard-personalization]")).toHaveAttribute(
        "data-editing",
        "true",
      );
    }
    await page.locator("[data-dashboard-edit-toggle]").click();
    await button(page, "Kaydetmeden çık").click();
    await expect(dash(page)).toHaveCount(0);
    await expect(page.locator('[data-dashboard-card-slot="food"]')).toBeVisible();
    expect(s.writes).toHaveLength(0);
    await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked", "1");
  });
  test(`Coach geometry, keyboard and nested focus ${theme}`, async ({ page }, info) => {
    await session(page, "ai");
    await page.evaluate(
      (v) => document.documentElement.classList.toggle("dark", v === "dark"),
      theme,
    );
    await open(page);
    await expect(page.getByRole("navigation", { name: "Sohbetler", exact: true })).toHaveCount(1);
    await expect(drawer(page).locator('[data-diewish-semantic-icon="coach-avatar"]')).toBeVisible();
    await page.waitForTimeout(250);
    await page.screenshot({ path: info.outputPath(`coach-drawer-${theme}.png`) });
    await page.keyboard.press("Escape");
    await expect(drawer(page)).toHaveCount(0);
    await expect(button(page, "Sohbet geçmişi")).toBeFocused();
    await open(page);
    await options(page);
    await fit(page, "[data-coach-options]");
    const t = await page.locator("[data-conversation-option-title]").evaluate((n) => ({
      whiteSpace: getComputedStyle(n).whiteSpace,
      ellipsis: getComputedStyle(n).textOverflow,
      width: n.getBoundingClientRect().width,
      headerWidth: n.parentElement!.getBoundingClientRect().width,
    }));
    expect(t.whiteSpace).toBe("nowrap");
    expect(t.ellipsis).toBe("ellipsis");
    expect(t.width).toBeCloseTo(t.headerWidth, 0);
    await page.screenshot({ path: info.outputPath(`coach-options-${theme}.png`) });
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      expect(await opts(page).evaluate((n) => n.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(opts(page)).toHaveCount(0);
    await expect(drawer(page)).toBeVisible();
    await expect(button(page, `${title} sohbet seçenekleri`)).toBeFocused();
    await drawer(page).getByRole("button", { name: "Kapat", exact: true }).click();
    await expect(drawer(page)).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked", "1");
    await open(page);
    await page.mouse.click(388, 400);
    await expect(drawer(page)).toHaveCount(0);
  });
  test(`Coach pin rename share safe delete new chat ${theme}`, async ({ page }) => {
    const s = await session(page, "ai");
    await page.evaluate(
      (v) => document.documentElement.classList.toggle("dark", v === "dark"),
      theme,
    );
    await open(page);
    await options(page);
    await opts(page).getByRole("button", { name: "Sabitle", exact: true }).click();
    await expect(opts(page)).toHaveCount(0);
    await expect(page.getByText("Sabitlenenler", { exact: true })).toBeVisible();
    await options(page);
    await opts(page).getByRole("button", { name: "Yeniden adlandır", exact: true }).click();
    const rename = page.getByRole("dialog", { name: "Sohbeti yeniden adlandır", exact: true });
    await expect(rename.getByRole("textbox", { name: "Sohbet adı", exact: true })).toBeFocused();
    await rename.getByRole("textbox", { name: "Sohbet adı", exact: true }).fill("Yeni sohbet adı");
    await rename.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(rename).toHaveCount(0);
    await options(page, "Yeni sohbet adı");
    await opts(page).getByRole("button", { name: "Sohbeti paylaş", exact: true }).click();
    const share = page.getByRole("dialog", { name: "Sohbeti paylaş", exact: true });
    await share.getByRole("button", { name: "Panoya kopyala", exact: true }).click();
    await expect(share).toHaveCount(0);
    expect(await page.evaluate(() => (window as Window & { copied?: string }).copied)).toContain(
      "Öğünlerimi analiz eder misin?",
    );
    await options(page, "Yeni sohbet adı");
    await opts(page).getByRole("button", { name: "Sohbeti sil", exact: true }).click();
    const remove = page.getByRole("dialog", { name: "Sohbet silinsin mi?", exact: true });
    await remove.getByRole("button", { name: "Vazgeç", exact: true }).click();
    expect(s.operations).not.toContain("delete");
    await options(page, "Yeni sohbet adı");
    await opts(page).getByRole("button", { name: "Sohbeti sil", exact: true }).click();
    await remove.getByRole("button", { name: "Sohbeti Sil", exact: true }).click();
    await expect(remove).toHaveCount(0);
    expect(s.operations).toEqual(["pin", "rename", "delete"]);
    await expect(button(page, "Yeni sohbet adı sohbet seçenekleri")).toHaveCount(0);
    await button(page, "Yeni Sohbet").click();
    await expect(drawer(page)).toHaveCount(0);
  });
}
test("Centered entrance exit and reduced motion", async ({ page }) => {
  await session(page, "dashboard");
  await dirty(page);
  const sample = async (time: number) =>
    dash(page).evaluate((n, t) => {
      const a = n.getAnimations()[0];
      a.pause();
      a.currentTime = t;
      const b = n.getBoundingClientRect();
      return {
        name: getComputedStyle(n).animationName,
        x: b.x + b.width / 2,
        y: b.y + b.height / 2,
        vw: innerWidth,
        vh: innerHeight,
      };
    }, time);
  const entrance = await sample(90);
  expect(entrance.name).toBe("modal-center-in");
  expect(entrance.x).toBeCloseTo(entrance.vw / 2, 0);
  expect(entrance.y).toBeCloseTo(entrance.vh / 2, 0);
  await dash(page).evaluate((n) => n.getAnimations().forEach((a) => a.finish()));
  await button(page, "Düzenlemeye devam et").click();
  const exit = await sample(70);
  expect(exit.name).toBe("modal-center-out");
  expect(exit.x).toBeCloseTo(exit.vw / 2, 0);
  expect(exit.y).toBeCloseTo(exit.vh / 2, 0);
  await dash(page).evaluate((n) => n.getAnimations().forEach((a) => a.finish()));
  await expect(dash(page)).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("[data-dashboard-edit-toggle]").click();
  await expect(dash(page)).toBeVisible();
  expect(
    await dash(page).evaluate((n) => parseFloat(getComputedStyle(n).animationDuration)),
  ).toBeLessThanOrEqual(0.001);
  await page.keyboard.press("Escape");
  await expect(dash(page)).toHaveCount(0);
});
for (const width of [320, 412, 430, 768])
  test(`Mobile fit ${width}px at 130% text`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await session(page, "dashboard");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "130%";
    });
    await dirty(page);
    await fit(page, "[data-dashboard-exit-dialog]");
    await page.keyboard.press("Escape");
    await session(page, "ai");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "130%";
    });
    await open(page);
    await options(page);
    await fit(page, "[data-coach-options]");
  });
test("Resize to desktop releases scroll and avoids duplicates", async ({ page }) => {
  await session(page, "ai");
  await open(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(drawer(page)).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked", "1");
  await expect(page.getByRole("navigation", { name: "Sohbetler", exact: true })).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("navigation", { name: "Sohbetler", exact: true })).toHaveCount(0);
  await open(page);
});

test("Coach panel motion, reduced motion and option close controls", async ({ page }) => {
  await session(page, "ai");
  await open(page);
  expect(await drawer(page).evaluate((node) => getComputedStyle(node).animationName)).toBe(
    "panel-left-in",
  );
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    expect(await drawer(page).evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  for (const dismiss of ["close", "outside"]) {
    await options(page);
    if (dismiss === "close")
      await opts(page).getByRole("button", { name: "Kapat", exact: true }).click();
    else await page.mouse.click(3, 3);
    await expect(opts(page)).toHaveCount(0);
    await expect(drawer(page)).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(drawer(page)).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  expect(
    await drawer(page).evaluate((node) => parseFloat(getComputedStyle(node).animationDuration)),
  ).toBeLessThanOrEqual(0.001);
  await options(page);
  expect(
    await opts(page).evaluate((node) => parseFloat(getComputedStyle(node).animationDuration)),
  ).toBeLessThanOrEqual(0.001);
  await page.keyboard.press("Escape");
  await expect(opts(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(drawer(page)).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked", "1");
});
