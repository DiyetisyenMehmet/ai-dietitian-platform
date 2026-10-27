import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "system-theme.spec.ts",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3027",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    launchOptions: { executablePath: process.env.G2_CHROMIUM_EXECUTABLE },
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3027",
    env: { NEXT_PUBLIC_API_BASE_URL: "/api", NEXT_TELEMETRY_DISABLED: "1" },
    url: "http://127.0.0.1:3027/login",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
