import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "phone-password-registration.spec.ts",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3103", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3103",
    url: "http://127.0.0.1:3103/phone-auth",
    timeout: 120000,
    env: { NEXT_PUBLIC_API_BASE_URL: "/api" },
  },
});
