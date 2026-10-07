import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch:
    /(?:notification-(?:preferences|categories|alerts|durability)|water-reminder-preferences)\.spec\.ts/,
  workers: 1,
  timeout: 60000,
  reporter: "list",
  use: {
    headless: true,
    timezoneId: "UTC",
    viewport: { width: 390, height: 844 },
    launchOptions: process.env.NOTIFICATION_CHROMIUM_PATH
      ? { executablePath: process.env.NOTIFICATION_CHROMIUM_PATH }
      : {},
  },
});
