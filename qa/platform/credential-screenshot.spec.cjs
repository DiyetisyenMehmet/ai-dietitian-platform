const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const c = require('./contract.cjs');
const pw = createRequire(path.join(c.ROOT, 'frontend/package.json'))('playwright');
const { assertCredentialScreenshotSafe } = require('./runtime.cjs');
test('unchecked checkbox default values do not block an empty login screenshot; populated credentials do', async () => {
  const engine = process.env.QA_BROWSER_ENGINE || 'chromium';
  const browser = await pw[engine].launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<input type="email"><input type="password"><input type="checkbox">');
    await assertCredentialScreenshotSafe(page);
    await page.locator('input[type="email"]').fill('synthetic@example.invalid');
    await assert.rejects(() => assertCredentialScreenshotSafe(page), { code: 'CREDENTIAL_SCREENSHOT_REFUSED' });
    await page.locator('input[type="email"]').fill('');
    await page.locator('input[type="password"]').fill('synthetic-test-value');
    await assert.rejects(() => assertCredentialScreenshotSafe(page), { code: 'CREDENTIAL_SCREENSHOT_REFUSED' });
  } finally { await browser.close(); }
});
