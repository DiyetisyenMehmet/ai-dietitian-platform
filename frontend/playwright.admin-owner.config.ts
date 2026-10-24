import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "admin-owner-center.spec.ts",
    "admin-shell.spec.js",
    "admin-users.spec.js",
    "admin-subscription.spec.js",
    "admin-entitlement-operations.spec.js",
    "admin-user-operations.spec.js",
  ],
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://127.0.0.1:3042",
    screenshot: "only-on-failure",
    timezoneId: "Europe/Istanbul",
    launchOptions: {
      executablePath: process.env.ADMIN_BROWSER_EXECUTABLE,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3042",
    env: { NEXT_PUBLIC_API_BASE_URL: "/api", NEXT_TELEMETRY_DISABLED: "1" },
    url: "http://127.0.0.1:3042/admin/login",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
