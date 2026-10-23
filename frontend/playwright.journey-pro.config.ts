import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "journey-pro.spec.ts",
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3029",
    timezoneId: "Europe/Istanbul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3029",
    env: { NEXT_PUBLIC_API_BASE_URL: "/api", NEXT_TELEMETRY_DISABLED: "1" },
    url: "http://127.0.0.1:3029/login",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
