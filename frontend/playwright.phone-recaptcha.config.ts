import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "phone-password-recaptcha.spec.ts",
  workers: 1,
  projects: [
    { name: "web-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "android-browser", use: { ...devices["Pixel 7"] } },
  ],
  use: { baseURL: "http://127.0.0.1:3105", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3105",
    url: "http://127.0.0.1:3105/phone-auth",
    timeout: 120000,
    env: { NEXT_PUBLIC_API_BASE_URL: "/api" },
  },
});
