import { expect, test, type Page } from "@playwright/test";

const VIDEO = "/images/mascots/mirmir/approved-a4.mp4";
const mascot = (page: Page) => page.locator('[data-dashboard-coach-banner] [data-mascot="mirmir"]');

async function setup(page: Page, mascotId = "mirmir", animationEnabled = true) {
  let preferences = { mascotId, animationEnabled };
  const writes: { path: string; body: unknown }[] = [];
  // Only synthetic account responses. No staging account or API is touched.
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const headers = {
      "access-control-allow-origin": "http://127.0.0.1:3000",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type,authorization",
      "access-control-allow-methods": "GET,PATCH,POST,OPTIONS",
    };
    const ok = (data: unknown) => route.fulfill({ headers, json: { success: true, data } });
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (path.endsWith("/auth/refresh-token"))
      return ok({
        user: {
          id: "synthetic-mirmir",
          fullName: "Görünüm Testi",
          email: "mascot@example.invalid",
          role: "USER",
          onboardingCompleted: true,
        },
        tokens: { accessToken: "synthetic-only-token" },
      });
    if (path.endsWith("/account/mascot")) {
      if (route.request().method() === "PATCH") {
        const body = route.request().postDataJSON();
        writes.push({ path, body });
        preferences = { ...preferences, ...body };
      }
      return ok({ preferences });
    }
    if (route.request().method() !== "GET") writes.push({ path, body: route.request().postData() });
    if (path.endsWith("/legal/consents")) return ok({ allMandatoryGranted: true, items: [] });
    if (path.endsWith("/legal/documents")) return ok({ documents: [] });
    return route.fulfill({
      status: 503,
      headers,
      json: {
        success: false,
        error: { code: "UNUSED_FIXTURE", message: "Unused synthetic endpoint" },
      },
    });
  });
  return writes;
}

// The historical filename is retained for existing CI entry points. Video must never load.
const blinkState = (page: Page) => mascot(page).getAttribute("data-blinking");

for (const legacyValue of [true, false]) {
  test(`default blink ignores retired video preference (${legacyValue}) and retains original poses`, async ({
    page,
  }) => {
    const videos: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes(VIDEO)) videos.push(r.url());
    });
    await setup(page, "mirmir", legacyValue);
    await page.goto("/dashboard");
    const m = mascot(page);
    await m.scrollIntoViewIfNeeded();
    await expect(m).toHaveAttribute("data-blinking", "true");
    await expect(m.locator("video, svg, animate, feDisplacementMap")).toHaveCount(0);
    const images = m.locator("img");
    await expect(images).toHaveCount(2);
    expect(
      await images.evaluateAll((nodes) => nodes.map((n) => (n as HTMLImageElement).naturalWidth)),
    ).toEqual([512, 512]);
    // Blink every 3 seconds, retaining the brief (~140 ms) closed pose.
    expect(
      await m.evaluate((n) =>
        n.getAnimations({ subtree: true }).map((a) => a.effect!.getComputedTiming().duration),
      ),
    ).toEqual([3000, 3000]);
    const poses = () =>
      images.evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n).visibility));
    await expect.poll(poses).toEqual(["visible", "hidden"]);
    await expect.poll(poses, { timeout: 4000, intervals: [25] }).toEqual(["hidden", "visible"]);
    await expect.poll(poses, { timeout: 1500, intervals: [25] }).toEqual(["visible", "hidden"]);
    await page.goto("/ai");
    await expect(page.locator('header [data-mascot="mirmir"]')).toHaveAttribute(
      "data-blinking",
      "true",
    );
    await expect(page.getByLabel("Mesaj", { exact: true })).toBeVisible();
    expect(videos).toEqual([]);
  });
}

test("default blink stops for native background, hidden page, offscreen and reduced motion", async ({
  page,
}) => {
  const writes = await setup(page);
  await page.goto("/dashboard");
  const m = mascot(page);
  await m.scrollIntoViewIfNeeded();
  await expect(m).toHaveAttribute("data-blinking", "true");
  const stopped = async () => {
    await expect(m).toHaveAttribute("data-blinking", "false");
    expect(await m.evaluate((n) => n.getAnimations({ subtree: true }).length)).toBe(0);
    await expect(m.locator("img").first()).toBeVisible();
    await expect(m.locator("img").last()).toBeHidden();
  };
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("diewish:app-visibility", { detail: { active: false } })),
  );
  await stopped();
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("diewish:app-visibility", { detail: { active: true } })),
  );
  await expect(m).toHaveAttribute("data-blinking", "true");
  await m.evaluate((n) => {
    (n as HTMLElement).style.transform = "translateY(200vh)";
  });
  await stopped();
  await m.evaluate((n) => {
    (n as HTMLElement).style.removeProperty("transform");
  });
  await m.scrollIntoViewIfNeeded();
  await expect(m).toHaveAttribute("data-blinking", "true");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await stopped();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(m).toHaveAttribute("data-blinking", "true");
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await stopped();
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await expect(m).toHaveAttribute("data-blinking", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await stopped();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(m).toHaveAttribute("data-blinking", "true");
  expect(writes).toEqual([]);
});

test("retired movement control is absent; mascot selection writes only identity and preserves classic", async ({
  page,
}) => {
  const writes = await setup(page, "classic", false);
  const videos: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes(VIDEO)) videos.push(r.url());
  });
  await page.goto("/dashboard");
  await expect(mascot(page)).toHaveCount(0);
  await page.goto("/profile/mascot");
  await expect(page.getByRole("switch")).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByText("Maskot animasyonu", { exact: true })).toHaveCount(0);
  await page.getByRole("radio", { name: "Mırmır", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Mırmır", exact: true })).toBeChecked();
  await page.reload();
  await expect(page.getByRole("radio", { name: "Mırmır", exact: true })).toBeChecked();
  await page.goto("/dashboard");
  await mascot(page).scrollIntoViewIfNeeded();
  await expect.poll(() => blinkState(page)).toBe("true");
  await page.goto("/profile/mascot");
  await page.getByRole("radio", { name: "Diewish Klasik", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Diewish Klasik", exact: true })).toBeChecked();
  await page.goto("/dashboard");
  await expect(mascot(page)).toHaveCount(0);
  expect(writes.map((w) => w.body)).toEqual([{ mascotId: "mirmir" }, { mascotId: "classic" }]);
  expect(videos).toEqual([]);
});

test("failed closed-eye asset keeps the existing transparent PNG still", async ({ page }) => {
  await setup(page);
  await page.route("**/images/mascots/mirmir/eyes-closed.webp", (route) => route.abort());
  await page.goto("/dashboard");
  const m = mascot(page);
  await m.scrollIntoViewIfNeeded();
  await expect(m.locator("img").first()).toBeVisible();
  await expect(m).toHaveAttribute("data-blinking", "false");
  expect(await m.evaluate((n) => n.getAnimations({ subtree: true }).length)).toBe(0);
  await expect(m.locator("video")).toHaveCount(0);
});

test("both poses stay inside the banner in light/dark at 390, 412, 430 pixels", async ({
  page,
}, info) => {
  await setup(page);
  await page.goto("/dashboard");
  const m = mascot(page),
    banner = page.locator("[data-dashboard-coach-banner]");
  for (const width of [390, 412, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await banner.scrollIntoViewIfNeeded();
    await expect(m).toHaveAttribute("data-blinking", "true");
    const bounds = await m.boundingBox();
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => {
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(t);
      }, theme);
      const boxes = await m.evaluate((n) => {
        const b = n.closest("[data-dashboard-coach-banner]")!.getBoundingClientRect(),
          r = n.getBoundingClientRect();
        return {
          inside: r.left >= b.left && r.right <= b.right && r.top >= b.top && r.bottom <= b.bottom,
          noOverflow: document.documentElement.scrollWidth <= innerWidth,
        };
      });
      expect(boxes).toEqual({ inside: true, noOverflow: true });
      expect(await m.boundingBox()).toEqual(bounds);
      await banner.screenshot({ path: info.outputPath(`final-banner-${width}-${theme}.png`) });
    }
  }
});
