import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const origin = "http://127.0.0.1:3027";
const java = fs.readFileSync(
  path.join(__dirname, "../../android/app/src/main/java/com/diewish/app/MainActivity.java"),
  "utf8",
);
// Run the production Android predicate and observer in a real DOM, replacing
// only the production origin with the isolated test origin.
function javaStrings(source: string) {
  return (source.match(/"(?:\\.|[^"\\])*"/g) ?? []).map((part) => JSON.parse(part)).join("");
}
const predicate = javaStrings(
  java
    .split("private static final String LAUNCH_DOM_READY =")[1]
    .split("private void requestLaunchCoverDismissal")[0]
    .replace("JSONObject.quote(BuildConfig.WEB_BASE_URL)", JSON.stringify(JSON.stringify(origin))),
);
const watcher = javaStrings(
  java
    .split("private void watchLaunchPresentation(WebView view)")[1]
    .split("private void dismissLaunchCover")[0]
    .split("view.evaluateJavascript(")[1]
    .replaceAll("LAUNCH_DOM_READY", JSON.stringify(predicate)),
);
type Host = Window & {
  g2: {
    frames: { dark: boolean; scheme: string }[];
    calls: { preference: string; dark: boolean; classDark: boolean; scheme: string }[];
    releases: number;
  };
};
async function setup(page: Page, preference?: string) {
  await page.addInitScript(
    ({ preference, predicate }) => {
      if (!sessionStorage.getItem("g2-initialized")) {
        if (preference) localStorage.setItem("theme", preference);
        sessionStorage.setItem("g2-initialized", "true");
      }
      sessionStorage.setItem(
        "g2-document-loads",
        String(Number(sessionStorage.getItem("g2-document-loads") ?? "0") + 1),
      );
      const host = window as unknown as Host & { DiewishSystemUi: object };
      host.g2 = { frames: [], calls: [], releases: 0 };
      host.DiewishSystemUi = {
        setThemePreference(preference: string, dark: boolean) {
          host.g2.calls.push({
            preference,
            dark,
            classDark: document.documentElement.classList.contains("dark"),
            scheme: document.documentElement.style.colorScheme,
          });
        },
        setDarkTheme() {},
        onLaunchFrameReady() {
          if (new Function(`return (${predicate})`)()) host.g2.releases++;
        },
      };
      function frame() {
        const root = document.documentElement;
        if (
          document.body &&
          document.querySelector("[data-testid=diewish-brand]") &&
          host.g2.frames.length < 500
        )
          host.g2.frames.push({
            dark: root.classList.contains("dark"),
            scheme: root.style.colorScheme,
          });
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    },
    { preference, predicate },
  );
  await page.route(`${origin}/api/**`, (route) =>
    route.fulfill({ status: 401, json: { success: false, error: { code: "UNAUTHORIZED" } } }),
  );
}
async function themeIs(page: Page, dark: boolean) {
  await expect(page.locator("html")).toHaveAttribute(
    "data-diewish-theme-ready",
    dark ? "dark" : "light",
  );
  expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(dark);
}
async function choose(page: Page, value: "system" | "light" | "dark") {
  await page
    .getByRole("button", { name: /^Görünüm:/ })
    .first()
    .click();
  await page
    .getByRole("radio", {
      name: value === "system" ? /^Sistemle aynı/ : value === "dark" ? /^Koyu/ : /^Açık/,
    })
    .check();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
for (const width of [390, 412, 430])
  for (const system of ["light", "dark"] as const)
    for (const preference of ["system", "light", "dark"]) {
      test(`${width}px system=${system} saved=${preference}: cold frame, auth pages, reopen`, async ({
        page,
      }, info) => {
        const dark = (preference === "system" ? system : preference) === "dark";
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: system });
        await setup(page, preference);
        let release!: () => void;
        const pending = new Promise<void>((resolve) => {
          release = resolve;
        });
        await page.route(`${origin}/api/auth/refresh-token`, async (route) => {
          await pending;
          await route.fulfill({ status: 401, json: { success: false } });
        });
        try {
          await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
          await themeIs(page, dark);
          await expect(page.getByTestId("diewish-brand-splash")).toBeVisible();
          await page.evaluate(watcher);
          expect(await page.evaluate(() => (window as unknown as Host).g2.releases)).toBe(0);
          release();
          await expect(page).toHaveURL(/\/login$/);
          await expect(page.locator('[data-artwork-state="ready"]')).toBeVisible();
          await expect
            .poll(() => page.evaluate(() => (window as unknown as Host).g2.releases))
            .toBeGreaterThan(0);
          await themeIs(page, dark);
          const observed = await page.evaluate(() => (window as unknown as Host).g2);
          expect(observed.calls.length).toBeGreaterThan(0);
          for (const call of observed.calls)
            expect(call).toEqual({
              preference,
              dark,
              classDark: dark,
              scheme: dark ? "dark" : "light",
            });
          expect(observed.frames.length).toBeGreaterThan(0);
          expect(
            observed.frames.every((f) => f.dark === dark && f.scheme === (dark ? "dark" : "light")),
          ).toBe(true);
          for (const route of ["/register", "/reset-password", "/login"]) {
            await page.goto(route);
            await themeIs(page, dark);
            expect(
              await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            ).toBe(true);
          }
          await expect(
            page.locator('img[src="/brands/diewish-id-transparent-approved.png"]'),
          ).toBeVisible();
          await page.getByRole("button", { name: /^Görünüm:/ }).click();
          await expect(page.getByRole("radio")).toHaveCount(3);
          await expect(
            page.getByRole("radio", {
              name: preference === "system" ? /^Sistemle aynı/ : dark ? /^Koyu/ : /^Açık/,
            }),
          ).toBeChecked();
          await page.screenshot({ path: info.outputPath("theme-options.png") });
          await page.keyboard.press("Escape");
          await page.reload();
          await themeIs(page, dark);
          expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe(preference);
          await page.screenshot({ path: info.outputPath("reopened-login.png") });
        } finally {
          release();
        }
      });
    }
test("new install, live and frozen background changes, manual override and return to system", async ({
  page,
  context,
}) => {
  await setup(page);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");
  await themeIs(page, false);
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBeNull();
  const documents = await page.evaluate(() => sessionStorage.getItem("g2-document-loads"));
  await page.emulateMedia({ colorScheme: "dark" });
  await themeIs(page, true);
  await choose(page, "light");
  await themeIs(page, false);
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await themeIs(page, false);
  await choose(page, "system");
  await themeIs(page, true);
  const session = await context.newCDPSession(page);
  await session.send("Page.setWebLifecycleState", { state: "frozen" });
  await page.emulateMedia({ colorScheme: "light" });
  await session.send("Page.setWebLifecycleState", { state: "active" });
  await themeIs(page, false);
  expect(await page.evaluate(() => sessionStorage.getItem("g2-document-loads"))).toBe(documents);
  await page.reload();
  await themeIs(page, false);
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("system");
});
test("actual host predicate rejects unresolved and inconsistent DOM theme", async ({ page }) => {
  await setup(page, "dark");
  await page.goto("/login");
  await themeIs(page, true);
  await expect(page.locator('[data-artwork-state="ready"]')).toBeVisible();
  expect(
    await page.evaluate((expression) => new Function(`return (${expression})`)(), predicate),
  ).toBe(true);
  for (const scheme of ["", "light"])
    expect(
      await page.evaluate(
        ({ expression, scheme }) => {
          document.documentElement.style.colorScheme = scheme;
          return new Function(`return (${expression})`)();
        },
        { expression: predicate, scheme },
      ),
    ).toBe(false);
});
test("Management Center login remains independent of normal appearance sync", async ({ page }) => {
  await setup(page, "light");
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: "Management Center" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Görünüm:/ })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Host).g2.calls.length)).toBe(0);
});

for (const system of ["light", "dark"] as const)
  test(`login, dashboard, logout keep appearance (${system})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: system });
    await setup(page, "system");
    let authenticated = false;
    const user = {
      id: "theme-fixture",
      email: "theme@synthetic.invalid",
      fullName: "Tema Testi",
      role: "USER",
      isActive: true,
      emailVerified: true,
      onboardingCompleted: true,
      createdAt: "2026-01-01T00:00:00Z",
    };
    await page.route(`${origin}/api/**`, async (route) => {
      const request = route.request(),
        endpoint = new URL(request.url()).pathname.slice(4);
      if (endpoint === "/auth/login") authenticated = true;
      if (endpoint === "/auth/logout") authenticated = false;
      if (endpoint.startsWith("/auth/") && !authenticated && endpoint !== "/auth/logout")
        return route.fulfill({ status: 401, json: { success: false } });
      let data: unknown = {};
      if (endpoint.startsWith("/auth/"))
        data = {
          user,
          tokens: { accessToken: "synthetic-theme-fixture", tokenType: "Bearer", expiresIn: "15m" },
        };
      if (endpoint === "/legal/consents") data = { allMandatoryGranted: true, consents: [] };
      if (endpoint === "/legal/documents") data = { documents: [] };
      if (endpoint === "/onboarding")
        data = {
          profile: {
            age: 36,
            gender: "PREFER_NOT_TO_SAY",
            heightCm: 175,
            currentWeightKg: 70,
            targetWeightKg: 65,
            activityLevel: "MODERATE",
            dietaryPreference: "OMNIVORE",
            healthConditions: [],
            allergies: [],
            dailyWaterGoalMl: 2500,
            usualWakeTime: "07:00",
            usualSleepTime: "23:00",
            workScheduleType: "REGULAR",
          },
        };
      if (endpoint === "/account/dashboard-cards")
        data = {
          preferences: {
            order: ["food", "blood", "progress", "coach"],
            hidden: [],
            quickActionOrder: ["meal", "water", "activity", "weight"],
            hiddenQuickActionIds: [],
          },
        };
      if (endpoint.includes("notifications")) data = { notifications: [], unreadCount: 0 };
      if (endpoint.includes("tracking")) data = { logs: [] };
      if (endpoint === "/nutrition-plans") data = { plans: [] };
      if (endpoint === "/goals") data = { goals: [] };
      if (endpoint === "/ai/sessions") data = { sessions: [] };
      if (endpoint === "/blood-tests/analyses") data = { analyses: [] };
      await route.fulfill({ status: 200, json: { success: true, data } });
    });
    await page.goto("/login");
    await themeIs(page, system === "dark");
    await choose(page, system === "dark" ? "light" : "dark");
    const manualDark = system !== "dark";
    await page.getByLabel("E-posta").fill(user.email);
    await page.getByLabel("Şifre", { exact: true }).fill("SyntheticTheme123!");
    await page.getByRole("button", { name: "Giriş Yap", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await themeIs(page, manualDark);
    await expect(page.locator("[data-dashboard-greeting]")).toBeVisible();
    await choose(page, "system");
    await themeIs(page, system === "dark");
    await page.goto("/profile");
    await page.getByRole("button", { name: "Çıkış yap", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await themeIs(page, system === "dark");
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("system");
  });
