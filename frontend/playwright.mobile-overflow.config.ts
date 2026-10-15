import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "mobile-nutrition-onboarding-overflow.spec.ts",
  workers: 1,
  timeout: 30000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    screenshot: "only-on-failure",
    launchOptions: process.env.NUTRITION_CHROMIUM_PATH
      ? { executablePath: process.env.NUTRITION_CHROMIUM_PATH }
      : {},
  },
  projects: [
    { name: "Android Chrome emulation", grep: /@mobile/, use: { ...devices["Pixel 7"] } },
    { name: "Desktop Chrome", grep: /@desktop/, use: { viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000/onboarding",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
