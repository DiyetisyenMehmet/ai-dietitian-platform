import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "nutrition-plan-generation.spec.ts",
  workers: 1,
  timeout: 60000,
  reporter: "list",
  use: {
    headless: true,
    viewport: { width: 390, height: 844 },
    launchOptions: process.env.NUTRITION_CHROMIUM_PATH
      ? { executablePath: process.env.NUTRITION_CHROMIUM_PATH }
      : {},
  },
});
