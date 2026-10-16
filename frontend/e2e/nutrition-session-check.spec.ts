import { expect, test, type Page } from "@playwright/test";
import { nutritionSessionCheck, type NutritionScreen } from "./nutrition-session-check";

// No app server, accounts, AI requests or real cookies. Every request is
// fulfilled/aborted locally, including when staging environment variables exist.
const web = "http://127.0.0.1:32179";
const screens: NutritionScreen[] = ["/dashboard", "/ai", "/meals/plan"];
const markers = {
  "/dashboard": "<button>Ana ekranı düzenle</button>",
  "/ai": '<textarea aria-label="Mesaj"></textarea>',
  "/meals/plan": "<h2>7 günlük kişisel plan</h2>",
};
const login = "<h1>Tekrar hoş geldiniz</h1><button>Giriş Yap</button>";

async function fixture(
  page: Page,
  {
    status = 200,
    pending = Promise.resolve(),
    noMarker = false,
    abort = false,
    redirect = "/login",
  }: {
    status?: number;
    pending?: Promise<void>;
    noMarker?: boolean;
    abort?: boolean;
    redirect?: string;
  } = {},
) {
  const requests: string[] = [];
  let refreshStarted!: () => void;
  const refreshing = new Promise<void>((resolve) => {
    refreshStarted = resolve;
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    // Only paths are retained even in this disposable fixture.
    requests.push(url.pathname);
    if (url.origin !== web) return route.abort();
    if (url.pathname === "/api/auth/refresh-token") {
      refreshStarted();
      await pending;
      if (abort) return route.abort();
      return route.fulfill({
        status,
        contentType: "application/json",
        // Deliberate canaries: the observer must never read this data.
        body: JSON.stringify({
          private: "BODY_SECRET",
          email: "EMAIL_SECRET",
          token: "TOKEN_SECRET",
        }),
        headers: { "x-private-value": "HEADER_SECRET" },
      });
    }
    if (!screens.includes(url.pathname as NutritionScreen)) {
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: login });
    }
    const marker = markers[url.pathname as NutritionScreen];
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<main><div role="status">Yükleniyor</div></main><script>
        fetch('/api/auth/refresh-token', {method: 'POST', body: 'REQUEST_SECRET'})
          .then(r => {
            if (!r.ok) return location.replace(${JSON.stringify(redirect)});
            ${noMarker ? "" : `document.querySelector('main').innerHTML = ${JSON.stringify(marker)};`}
          }).catch(() => location.replace('/login'));
      </script>`,
    });
  });
  return { requests, refreshing };
}

for (const screen of screens) {
  test(`waits for authenticated content after delayed refresh: ${screen}`, async ({ page }) => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = await fixture(page, { pending });
    const reports: unknown[] = [];
    const check = nutritionSessionCheck(page, web, {
      timeout: 5_000,
      report: (value) => reports.push(value),
    });
    let finished = false;
    const visiting = check.visit(screen).then(() => {
      finished = true;
    });
    await f.refreshing;
    await expect(page.getByRole("status")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(screen);
    expect(finished).toBe(false); // A matching URL alone cannot pass.
    release();
    await visiting;
    expect(finished).toBe(true);
    expect(reports).toEqual([]);
    expect(f.requests).not.toContain("/api/auth/login");
    check.dispose();
  });

  test(`session loss fails without recovery login: ${screen}`, async ({ page }) => {
    const f = await fixture(page, { status: 401 });
    const reports: unknown[] = [];
    const check = nutritionSessionCheck(page, web, {
      timeout: 2_000,
      report: (value) => reports.push(value),
    });
    await expect(check.visit(screen)).rejects.toThrow("current=/login loginRedirected=true");
    expect(f.requests.filter((path) => path === "/api/auth/refresh-token")).toHaveLength(1);
    expect(f.requests).not.toContain("/api/auth/login");
    expect(reports).toEqual([
      expect.objectContaining({
        expected: screen,
        current: "/login",
        loginRedirected: true,
        events: expect.arrayContaining([
          { kind: "navigation", path: screen },
          { kind: "response", path: "/api/auth/refresh-token", status: 401 },
          { kind: "navigation", path: "/login" },
        ]),
      }),
    ]);
    check.dispose();
  });
}

test("all three hard navigations wait; deliberate relogin readiness uses the same gate", async ({
  page,
}) => {
  const f = await fixture(page);
  const check = nutritionSessionCheck(page, web);
  for (const screen of screens) await check.visit(screen);
  // Simulates only the already-completed login return, without creating/logging in an account.
  await page.goto(web + "/dashboard");
  await check.ready("/dashboard");
  await check.visit("/meals/plan");
  expect(f.requests.filter((path) => screens.includes(path as NutritionScreen))).toEqual([
    ...screens,
    "/dashboard",
    "/meals/plan",
  ]);
  expect(f.requests).not.toContain("/api/auth/login");
  check.dispose();
});

test("correct URL and successful refresh cannot pass a loading-only screen", async ({ page }) => {
  await fixture(page, { noMarker: true });
  const reports: unknown[] = [];
  const check = nutritionSessionCheck(page, web, {
    timeout: 500,
    report: (value) => reports.push(value),
  });
  await expect(check.visit("/dashboard")).rejects.toThrow("NUTRITION_SESSION_NOT_READY");
  expect(reports).toEqual([
    expect.objectContaining({ current: "/dashboard", loginRedirected: false }),
  ]);
  check.dispose();
});

test("a failed refresh records only its safe result, never secrets or dynamic URLs", async ({
  page,
}) => {
  await fixture(page, {
    status: 503,
    redirect: "/EMAIL_SECRET?token=QUERY_SECRET#FRAGMENT_SECRET",
  });
  const reports: unknown[] = [];
  const check = nutritionSessionCheck(page, web, {
    timeout: 2_000,
    report: (value) => reports.push(value),
  });
  await expect(check.visit("/meals/plan")).rejects.toThrow("current=/other");
  const output = JSON.stringify(reports);
  expect(output).toContain('"status":503');
  expect(output).not.toMatch(/SECRET|127\.0\.0\.1|http:|cookie|authorization/i);
  expect(reports).toEqual([
    expect.objectContaining({
      events: expect.arrayContaining([{ kind: "navigation", path: "/other" }]),
    }),
  ]);
  check.dispose();
});

test("an interrupted refresh is recorded without the browser error or request contents", async ({
  page,
}) => {
  await fixture(page, { abort: true });
  const reports: unknown[] = [];
  const check = nutritionSessionCheck(page, web, {
    timeout: 2_000,
    report: (value) => reports.push(value),
  });
  await expect(check.visit("/ai")).rejects.toThrow("NUTRITION_SESSION_NOT_READY");
  expect(reports).toEqual([
    expect.objectContaining({
      events: expect.arrayContaining([{ kind: "request-failed", path: "/api/auth/refresh-token" }]),
    }),
  ]);
  expect(JSON.stringify(reports)).not.toMatch(/SECRET|net::|REQUEST_SECRET/);
  check.dispose();
});

test("an observed login redirect cannot be hidden by returning to a ready screen", async ({
  page,
}) => {
  await fixture(page, { status: 401 });
  const reports: unknown[] = [];
  const check = nutritionSessionCheck(page, web, {
    timeout: 3_000,
    report: (value) => reports.push(value),
  });
  const visiting = check.visit("/dashboard");
  // Install the rejection expectation before the fixture can redirect.
  const failed = expect(visiting).rejects.toThrow("loginRedirected=true");
  await page.waitForURL(web + "/login");
  await page.route(web + "/dashboard", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: markers["/dashboard"],
    }),
  );
  await page.goto(web + "/dashboard");
  await failed;
  expect(reports).toEqual([expect.objectContaining({ loginRedirected: true })]);
  check.dispose();
});
