import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "approved-brand-assets.spec.ts",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3022", deviceScaleFactor: 3, trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3022",
    cwd: process.env.APPROVED_BRAND_APP_DIRECTORY || process.cwd(),
    env: { NEXT_PUBLIC_API_BASE_URL: "/api", NEXT_TELEMETRY_DISABLED: "1" },
    url: "http://127.0.0.1:3022/login",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
