import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "notification-mark-all-read.spec.ts",
  workers: 1,
  timeout: 90000,
  reporter: "list",
  use: { headless: true, timezoneId: "Europe/Istanbul" },
  webServer: {
    command: "npm run dev -- -H 127.0.0.1 -p 3018",
    url: "http://127.0.0.1:3018/login",
    timeout: 120000,
    env: { NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:3018/api" },
  },
});
