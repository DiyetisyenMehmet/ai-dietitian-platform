import { expect, test, type Page } from "@playwright/test";

const VIDEO = "/images/mascots/mirmir/approved-a4.mp4";
const mascot = (page: Page) => page.locator('[data-dashboard-coach-banner] [data-mascot="mirmir"]');

async function setup(page: Page, mascotId = "mirmir", animationEnabled = true) {
  let preferences = { mascotId, animationEnabled };
  const writes: string[] = [];
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
      if (route.request().method() === "PATCH")
        preferences = { ...preferences, ...route.request().postDataJSON() };
      return ok({ preferences });
    }
    if (route.request().method() !== "GET") writes.push(path);
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

test("real footage plays, loops and releases the player on native/background/offscreen/reduced motion", async ({
  page,
}, info) => {
  const writes = await setup(page);
  await page.goto("/dashboard");
  const m = mascot(page);
  await m.scrollIntoViewIfNeeded();
  await expect(m).toHaveAttribute("data-moving", "true");
  const video = m.locator("video");
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeGreaterThan(1);
  const playback = await video.evaluate((node) => {
    const v = node as HTMLVideoElement;
    const q = v.getVideoPlaybackQuality();
    return {
      muted: v.muted,
      inline: v.playsInline,
      loop: v.loop,
      controls: v.controls,
      width: v.videoWidth,
      height: v.videoHeight,
      totalFrames: q.totalVideoFrames,
      droppedFrames: q.droppedVideoFrames,
    };
  });
  expect(playback).toMatchObject({
    muted: true,
    inline: true,
    loop: true,
    controls: false,
    width: 1280,
    height: 720,
  });
  expect(playback.totalFrames).toBeGreaterThan(0);
  await expect(m.locator("svg, animate, feDisplacementMap")).toHaveCount(0);
  const bounds = await m.boundingBox();
  await video.evaluate((v) => {
    (v as HTMLVideoElement).currentTime = 9.85;
  });
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeLessThan(2);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(value);
    }, theme);
    await page
      .locator("[data-dashboard-coach-banner]")
      .screenshot({ path: info.outputPath(`banner-${theme}.png`) });
    expect((await m.boundingBox())?.width).toBe(bounds?.width);
  }
  await info.attach("video-playback", {
    body: JSON.stringify(playback),
    contentType: "application/json",
  });
  // Retain old DOM references to prove removal also pauses/releases decoders.
  await video.evaluate((v) => {
    (window as unknown as { oldMirmirPlayer: HTMLVideoElement }).oldMirmirPlayer =
      v as HTMLVideoElement;
  });
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("diewish:app-visibility", { detail: { active: false } })),
  );
  await expect(video).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const v = (window as unknown as { oldMirmirPlayer: HTMLVideoElement }).oldMirmirPlayer;
      return v.paused && !v.getAttribute("src");
    }),
  ).toBe(true);
  await expect(m.locator("img")).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("diewish:app-visibility", { detail: { active: true } })),
  );
  await expect(m).toHaveAttribute("data-moving", "true");
  await m.evaluate((v) => {
    (v as HTMLElement).style.transform = "translateY(200vh)";
  });
  await expect(video).toHaveCount(0);
  await m.evaluate((v) => {
    (v as HTMLElement).style.removeProperty("transform");
  });
  await m.scrollIntoViewIfNeeded();
  await expect(m).toHaveAttribute("data-moving", "true");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(video).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(m).toHaveAttribute("data-moving", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(video).toHaveCount(0);
  await expect(m.locator("img")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(m).toHaveAttribute("data-moving", "true");
  await page.goto("/ai");
  await expect(page.locator('header [data-mascot="mirmir"]')).toHaveAttribute(
    "data-moving",
    "true",
  );
  await expect(page.getByLabel("Mesaj", { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});

for (const condition of ["classic", "disabled", "reduced"] as const) {
  test(`${condition} makes no video request and preserves static layout`, async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes(VIDEO)) requests.push(r.url());
    });
    await setup(page, condition === "classic" ? "classic" : "mirmir", condition !== "disabled");
    if (condition === "reduced") await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/dashboard");
    const banner = page.locator("[data-dashboard-coach-banner]");
    await banner.scrollIntoViewIfNeeded();
    if (condition === "classic") await expect(mascot(page)).toHaveCount(0);
    else {
      await expect(mascot(page)).toHaveAttribute("data-video-state", "still");
      await expect(mascot(page).locator("img")).toBeVisible();
    }
    await expect(banner.locator("video")).toHaveCount(0);
    expect(requests).toEqual([]);
    for (const width of [390, 412, 430]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  });
}

test("broken media falls back to the transparent PNG; preference off/on and classic still work", async ({
  page,
}) => {
  await setup(page);
  await page.route(`**${VIDEO}`, (route) => route.abort());
  await page.goto("/dashboard");
  const m = mascot(page);
  await m.scrollIntoViewIfNeeded();
  await expect(m).toHaveAttribute("data-video-state", "fallback");
  await expect(m.locator("img")).toBeVisible();
  await expect(m.locator("video")).toHaveCount(0);
  await page.unroute(`**${VIDEO}`);
  await page.goto("/profile/mascot");
  const toggle = page.getByRole("switch", { name: "Maskot animasyonu" });
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.goto("/dashboard");
  await m.scrollIntoViewIfNeeded();
  await expect(m).toHaveAttribute("data-video-state", "still");
  await page.goto("/profile/mascot");
  await toggle.click();
  await expect(toggle).toBeChecked();
  await page.goto("/dashboard");
  await m.scrollIntoViewIfNeeded();
  await expect(m).toHaveAttribute("data-moving", "true");
  await page.goto("/profile/mascot");
  await page.getByRole("radio", { name: "Diewish Klasik", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Diewish Klasik", exact: true })).toBeChecked();
  await page.goto("/dashboard");
  await expect(m).toHaveCount(0);
});
