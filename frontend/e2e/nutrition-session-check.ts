import { expect, type Frame, type Page, type Request, type Response } from "@playwright/test";

export type NutritionScreen = "/dashboard" | "/ai" | "/meals/plan";

const screenPaths = new Set([
  "/dashboard",
  "/ai",
  "/meals/plan",
  "/login",
  "/onboarding",
  "/consent",
]);
const responsePaths = new Set([
  "/api/auth/login",
  "/api/auth/refresh-token",
  "/api/nutrition-plans",
]);
type Event = { kind: "navigation" | "response" | "request-failed"; path: string; status?: number };

/** Test-only observer: never reads cookies, headers, bodies, storage or account data. */
export function nutritionSessionCheck(
  page: Page,
  web: string,
  {
    timeout = 20_000,
    report = (diagnostic: unknown) =>
      console.log("STAGING_NUTRITION_SESSION " + JSON.stringify(diagnostic)),
  }: { timeout?: number; report?: (diagnostic: unknown) => void } = {},
) {
  const origin = new URL(web).origin;
  const events: Event[] = [];
  let checking = false;
  let loginRedirected = false;
  const append = (event: Event) => {
    events.push(event);
    if (events.length > 80) events.shift();
  };
  const safePath = (raw: string, allowed: Set<string>) => {
    const url = new URL(raw);
    return url.origin === origin && allowed.has(url.pathname) ? url.pathname : "/other";
  };
  const navigation = (frame: Frame) => {
    if (frame !== page.mainFrame()) return;
    const path = safePath(frame.url(), screenPaths);
    if (checking && path === "/login") loginRedirected = true;
    append({ kind: "navigation", path });
  };
  const response = (result: Response) => {
    const path = safePath(result.url(), responsePaths);
    if (path !== "/other") append({ kind: "response", path, status: result.status() });
  };
  const requestFailed = (request: Request) => {
    const path = safePath(request.url(), responsePaths);
    if (path !== "/other") append({ kind: "request-failed", path });
  };
  page.on("framenavigated", navigation);
  page.on("response", response);
  page.on("requestfailed", requestFailed);

  const marker = (path: NutritionScreen) => {
    switch (path) {
      case "/dashboard":
        return page.getByRole("button", { name: "Ana ekranı düzenle", exact: true });
      case "/ai":
        return page.getByRole("textbox", { name: "Mesaj", exact: true });
      case "/meals/plan":
        return page.getByRole("heading", { name: "7 günlük kişisel plan", exact: true });
    }
  };

  async function check(path: NutritionScreen, navigate: boolean) {
    checking = true;
    loginRedirected = false;
    try {
      if (navigate) await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded", timeout });
      // The URL and absence of an error are both true during the auth splash.
      // Wait for content behind RouteGuard before another hard navigation can
      // interrupt the rotating refresh-cookie response. A login redirect stays
      // fatal even if another script subsequently returns to the target route.
      await expect
        .poll(
          async () =>
            !loginRedirected &&
            safePath(page.url(), screenPaths) === path &&
            (await marker(path).isVisible()) &&
            !(await page
              .getByRole("heading", { name: "Tekrar hoş geldiniz", exact: true })
              .isVisible()),
          { timeout, message: "Authenticated nutrition screen must finish loading" },
        )
        .toBe(true);
    } catch {
      const current = safePath(page.url(), screenPaths);
      report({ expected: path, current, loginRedirected, events: [...events] });
      // Do not rethrow raw browser/network errors: their URLs may contain secrets.
      throw new Error(
        `NUTRITION_SESSION_NOT_READY expected=${path} current=${current} loginRedirected=${loginRedirected}`,
      );
    } finally {
      checking = false;
    }
  }

  return {
    ready: (path: NutritionScreen) => check(path, false),
    visit: (path: NutritionScreen) => check(path, true),
    dispose() {
      page.off("framenavigated", navigation);
      page.off("response", response);
      page.off("requestfailed", requestFailed);
    },
  };
}
