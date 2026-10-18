const { test, expect } = require('@playwright/test');

// Real React page/router, synthetic Firebase boundary. No real captcha, SMS,
// backend identity, account or physical Android success is asserted by this suite.
const fixture = `
window.__phoneFixture = { verifiers: [], clears: 0, sent: 0, confirms: 0, mode: 'success' };
(function () {
  var state = window.__phoneFixture;
  var auth = function () { return { signInWithPhoneNumber: function (_, verifier) {
    state.sent++;
    state.lastVerifier = verifier;
    return new Promise(function (resolve, reject) {
      state.resolveSms = function () { resolve({ confirm: async function (code) {
        state.confirms++;
        if (code !== '123456') throw { code: 'auth/invalid-verification-code' };
        return { user: { getIdToken: async function () { return 'synthetic-firebase-identity'; } } };
      } }); };
      if (state.mode === 'failure') reject({ code: 'auth/captcha-check-failed' });
      else if (state.mode !== 'pending') state.resolveSms();
    });
  } }; };
  auth.RecaptchaVerifier = class {
    constructor(container, options) {
      this.options = options;
      this.host = typeof container === 'string' ? document.getElementById(container) : container;
      this.cleared = false;
      var badge = document.createElement('div');
      badge.dataset.testRecaptcha = 'synthetic-lifecycle-boundary';
      badge.textContent = 'TEST: reCAPTCHA lifecycle fixture';
      badge.style.cssText = 'width:256px;height:60px;border:1px solid #666;background:#fff;color:#111';
      this.host.appendChild(badge);
      state.verifiers.push(this);
    }
    clear() { if (!this.cleared) { this.cleared = true; state.clears++; } }
  };
  window.firebase = { apps: [{}], auth: auth };
})();`;

async function setup(page, mode = 'success') {
  await page.route('**/api/**', route => {
    // #57 chooses the legacy screen only after this public status succeeds.
    // Exercise the disabled-feature route explicitly; unavailable stays fail-closed.
    if (new URL(route.request().url()).pathname === '/api/identity/phone-password/status') {
      return route.fulfill({ json: { success: true, data: { enabled: false, pending: false } } });
    }
    if (new URL(route.request().url()).pathname === '/api/identity/firebase-config') {
      return route.fulfill({ json: { success: true, data: { configured: true, config: {
        apiKey: 'synthetic-key', authDomain: 'synthetic.invalid', projectId: 'synthetic-project', appId: 'synthetic-app',
      } } } });
    }
    return route.fulfill({ status: 401, json: { success: false, error: { code: 'UNAUTHORIZED' } } });
  });
  await page.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({
    contentType: 'application/javascript', body: route.request().url().includes('firebase-auth-compat')
      ? fixture + `window.__phoneFixture.mode = '${mode}';` : '',
  }));
  await page.route(/https:\/\/(?:www\.google\.com|identitytoolkit\.googleapis\.com)\//, route => route.abort());
  await page.goto('/phone-auth');
  await page.getByLabel('Telefon numarası', { exact: true }).fill('0555 111 22 33');
}

async function leavePhone(page) {
  const marker = await page.evaluate(() => { window.__phoneDocumentMarker = Math.random(); return window.__phoneDocumentMarker; });
  await page.locator('header a[href="/"]').click();
  await expect(page).toHaveURL(/:\d+\/$/);
  expect(await page.evaluate(() => window.__phoneDocumentMarker)).toBe(marker);
}

for (const platform of ['web', 'android-user-agent']) {
  test.describe(platform, () => {
    test.use({ userAgent: platform === 'web'
      ? 'Mozilla/5.0 Chrome/153.0.0.0 Safari/537.36'
      : 'Mozilla/5.0 (Linux; Android 16; Test) AppleWebKit/537.36 Version/4.0 Chrome/153.0.0.0 Mobile Safari/537.36 DiewishAndroid/fixture' });

    test('pending SMS view exit releases its verifier before late completion', async ({ page }) => {
      await setup(page, 'pending');
      await page.getByRole('button', { name: 'SMS kodu gönder', exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.__phoneFixture?.sent)).toBe(1);
      await leavePhone(page);
      const expected = process.env.PHONE_RECAPTCHA_BASELINE === '1' ? 0 : 1;
      await expect.poll(() => page.evaluate(() => window.__phoneFixture.clears)).toBe(expected);
      await page.evaluate(() => window.__phoneFixture.resolveSms());
      await expect(page.locator('#diewish-phone-recaptcha')).toHaveCount(0);
      expect(await page.evaluate(() => window.__phoneFixture.clears)).toBe(expected);
      expect(await page.evaluate(() => window.__phoneFixture.confirms)).toBe(0);
      console.info(JSON.stringify({ platform, baseline: process.env.PHONE_RECAPTCHA_BASELINE === '1',
        clearedVerifiers: expected, activeVerifiers: 1 - expected, lateConfirmCalls: 0 }));
      await expect(page.locator('[data-test-recaptcha]')).toHaveCount(0);
    });

    test('inline branding survives code entry and is cleaned on number change and navigation', async ({ page }) => {
      test.skip(process.env.PHONE_RECAPTCHA_BASELINE === '1', 'Baseline run demonstrates only the pending-verifier leak.');
      await setup(page);
      await page.getByRole('button', { name: 'SMS kodu gönder', exact: true }).click();
      await expect(page.getByLabel('SMS doğrulama kodu')).toBeVisible();
      await expect(page.locator('#diewish-phone-recaptcha [data-test-recaptcha]')).toBeVisible();
      expect(await page.evaluate(() => window.__phoneFixture.lastVerifier.options.badge)).toBe('inline');
      await page.getByLabel('SMS doğrulama kodu').fill('000000');
      await page.getByRole('button', { name: 'Telefonu doğrula ve devam et', exact: true }).click();
      await expect(page.getByRole('status').first()).toContainText('SMS kodu hatalı');
      await expect(page.locator('[data-test-recaptcha]')).toHaveCount(1);
      await page.getByRole('button', { name: 'Numarayı değiştir', exact: true }).click();
      await expect(page.locator('[data-test-recaptcha]')).toHaveCount(0);
      await page.getByRole('button', { name: 'SMS kodu gönder', exact: true }).click();
      await expect(page.locator('[data-test-recaptcha]')).toHaveCount(1);
      await leavePhone(page);
      await expect(page.locator('[data-test-recaptcha]')).toHaveCount(0);
    });

    test('security failure cleans the owned widget and allows a fresh request', async ({ page }) => {
      test.skip(process.env.PHONE_RECAPTCHA_BASELINE === '1', 'Baseline run demonstrates only the pending-verifier leak.');
      await setup(page, 'failure');
      await page.getByRole('button', { name: 'SMS kodu gönder', exact: true }).click();
      await expect(page.getByRole('status').first()).toContainText('Güvenlik doğrulaması tamamlanamadı');
      await expect(page.locator('[data-test-recaptcha]')).toHaveCount(0);
      await page.evaluate(() => window.__phoneFixture.mode = 'success');
      await page.getByRole('button', { name: 'SMS kodu gönder', exact: true }).click();
      await expect(page.getByLabel('SMS doğrulama kodu')).toBeVisible();
      await expect(page.locator('[data-test-recaptcha]')).toHaveCount(1);
    });
  });
}
