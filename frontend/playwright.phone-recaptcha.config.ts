import { defineConfig } from "@playwright/test";
const baseURL = process.env.PHONE_RECAPTCHA_TEST_URL || "http://127.0.0.1:3109";
if (!["127.0.0.1", "localhost"].includes(new URL(baseURL).hostname)) {
  throw new Error("Phone lifecycle fixtures may run only on a local app.");
}
export default defineConfig({
  testDir: "./e2e", testMatch: "phone-recaptcha-lifecycle.spec.js",
  workers: 1, timeout: 45_000, reporter: "list",
  outputDir: process.env.PHONE_RECAPTCHA_BASELINE === "1"
    ? "test-results/phone-recaptcha-baseline" : "test-results/phone-recaptcha",
  webServer: {
    command: `npm run dev -- -H 127.0.0.1 -p ${new URL(baseURL).port || "3109"}`,
    cwd: process.env.PHONE_RECAPTCHA_APP_DIRECTORY || process.cwd(),
    env: { NEXT_PUBLIC_API_BASE_URL: "/api", NEXT_TELEMETRY_DISABLED: "1" },
    url: `${baseURL}/phone-auth`, timeout: 120_000, reuseExistingServer: false,
  },
  use: {
    baseURL, headless: true, viewport: { width: 390, height: 844 },
    launchOptions: process.env.PHONE_RECAPTCHA_CHROMIUM_PATH
      ? { executablePath: process.env.PHONE_RECAPTCHA_CHROMIUM_PATH } : {},
  },
});
