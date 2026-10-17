import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "password-recovery.spec.ts",
  workers: 1,
  reporter: "line",
  use: { baseURL: "http://127.0.0.1:3000", trace: "off", video: "off", screenshot: "off" },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000/reset-password",
    timeout: 120000,
    reuseExistingServer: false,
  },
});
