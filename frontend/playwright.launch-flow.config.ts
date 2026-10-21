import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "launch-flow.spec.ts",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3019",
    deviceScaleFactor: 3,
    video: "on",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3019",
    cwd: process.env.LAUNCH_APP_DIRECTORY || process.cwd(),
    env: { NEXT_PUBLIC_API_BASE_URL: "/api", NEXT_TELEMETRY_DISABLED: "1" },
    url: "http://127.0.0.1:3019/login",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
