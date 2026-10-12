import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "admin-password-setup.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "off",
    video: "off",
    screenshot: "off",
    launchOptions: process.env.ADMIN2_CHROMIUM_PATH
      ? {
          executablePath: process.env.ADMIN2_CHROMIUM_PATH,
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        }
      : {},
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000/admin/reset-password",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
