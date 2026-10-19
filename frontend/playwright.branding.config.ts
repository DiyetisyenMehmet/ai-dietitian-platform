import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "branding-startup.spec.ts",
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:3017",
    deviceScaleFactor: 3,
    screenshot: "only-on-failure",
    launchOptions: process.env.BRANDING_CHROMIUM_PATH
      ? { executablePath: process.env.BRANDING_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3017",
    env: { NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:3017/api" },
    url: "http://127.0.0.1:3017/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
