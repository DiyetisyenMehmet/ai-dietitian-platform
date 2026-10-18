import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "phone-sms-recovery.spec.ts",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3104", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3104",
    url: "http://127.0.0.1:3104/phone-password-recovery",
    timeout: 120000,
    env: { NEXT_PUBLIC_API_BASE_URL: "/api" },
  },
});
