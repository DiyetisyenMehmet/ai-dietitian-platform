'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const c = require('./contract.cjs');
const pw = createRequire(path.join(c.ROOT, 'frontend/package.json'))('playwright');
const scenarios = require('./scenarios.json');
async function openRuntime(platform, engine = 'chromium') {
  c.stagingOrigin(process.env.QA_BASE_URL || c.ORIGIN);
  if (platform === 'web') {
    if (!['chromium', 'webkit'].includes(engine)) throw new c.Blocked('UNSUPPORTED_BROWSER_ENGINE');
    const opts = { headless: process.env.QA_HEADLESS !== 'NO' };
    if (process.env.QA_PROXY_URL) opts.proxy = { server: process.env.QA_PROXY_URL };
    if (engine === 'chromium' && process.env.QA_CHROMIUM_EXECUTABLE) opts.executablePath = process.env.QA_CHROMIUM_EXECUTABLE;
    const browser = await pw[engine].launch(opts);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: process.env.QA_TIMEZONE || 'Europe/Istanbul', locale: 'tr-TR', acceptDownloads: false });
    return { platform, runtime: engine, device: 'browser-390x844', page: await context.newPage(), screenshot: (p) => context.pages()[0].screenshot({ path: p }), close: () => browser.close(), refresh: (p) => p.reload(), relaunch: async () => { await context.pages()[0].close(); const page = await context.newPage(); await page.goto(c.ORIGIN + '/ai'); return page; }, offline: (v) => context.setOffline(v) };
  }
  if (platform !== 'android') throw new c.Blocked('IOS_REQUIRES_XCODE_UI_TEST_RUNNER');
  const devices = await pw._android.devices();
  const serial = process.env.QA_ANDROID_SERIAL;
  const device = serial ? devices.find(d => d.serial() === serial) : devices.length === 1 ? devices[0] : null;
  if (!device) throw new c.Blocked('ONE_ANDROID_DEVICE_REQUIRED');
  const emulator = device.serial().startsWith('emulator-');
  if (!emulator && process.env.QA_ALLOW_PHYSICAL !== 'YES') { await device.close(); throw new c.Blocked('PHYSICAL_DEVICE_OPT_IN_REQUIRED'); }
  device.setDefaultTimeout(45000);
  const start = async () => { await device.shell('am start -n com.diewish.app/.MainActivity'); return (await device.webView({ pkg: 'com.diewish.app' })).page(); };
  const page = await start();
  return { platform, runtime: emulator ? 'android-emulator' : 'android-physical', device: emulator ? 'Android-AVD' : 'Android-device', page,
    screenshot: (p) => device.screenshot({ path: p }), close: () => device.close(), refresh: (p) => p.reload(),
    relaunch: async () => { await device.shell('am force-stop com.diewish.app'); const page = await start(); await page.goto(c.ORIGIN + '/ai'); return page; },
    offline: async v => { await device.shell('svc wifi ' + (v ? 'disable' : 'enable')); await device.shell('svc data ' + (v ? 'disable' : 'enable')); } };
}
async function login(page) {
  const user = c.credentials();
  await page.goto(c.ORIGIN + '/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('E-posta', { exact: true }).fill(user.email);
  await page.getByLabel('Şifre', { exact: true }).fill(user.password);
  const result = page.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/login' && r.request().method() === 'POST', { timeout: 45000 });
  await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click();
  const response = await result;
  if (!response.ok()) throw new c.Blocked('LOGIN_OR_STAGING_ACCESS_DENIED');
  const payload = await response.json();
  if (payload?.data?.user?.id !== user.id) throw new c.Blocked('TEST_ACCOUNT_ID_MISMATCH');
  await page.waitForURL(c.ORIGIN + '/dashboard', { timeout: 45000 });
  return c.accountAlias(user.id);
}
async function logout(page) {
  await page.goto(c.ORIGIN + '/profile');
  await page.getByRole('button', { name: /Çıkış/i }).click();
  await page.waitForURL(c.ORIGIN + '/login');
}
async function openList(page) {
  const b = page.getByRole('button', { name: 'Sohbet geçmişi', exact: true });
  if (await b.isVisible()) await b.click();
  await page.locator('nav[aria-label="Sohbetler"]:visible').first().waitFor({ state: 'visible' });
  await page.getByText('Sohbetler yükleniyor...', { exact: true }).first().waitFor({ state: 'hidden' });
}
async function assertCredentialScreenshotSafe(page) {
  const values = await page.locator('input[type="email"],input[type="password"],input[name="email"],input[name="password"]').evaluateAll(nodes => nodes.some(n => n.value));
  if (values) throw new c.Blocked('CREDENTIAL_SCREENSHOT_REFUSED');
}
async function capture(runtime, evidence, name) {
  const page = runtime.page;
  if (new URL(page.url()).origin !== c.ORIGIN) throw new c.Blocked('UNTRUSTED_SCREENSHOT_ORIGIN');
  await assertCredentialScreenshotSafe(page);
  // Identity masking affects only the evidence capture, never persisted app data.
  const mask = page.getByText(process.env.QA_EMAIL || '__no_identity__', { exact: true });
  const file = name + '-' + runtime.runtime + '.png';
  if (runtime.platform === 'web') await page.screenshot({ path: path.join(evidence.dir, file), mask: [mask] });
  else {
    await page.evaluate(email => { document.querySelectorAll('p,span,div').forEach(n => { if (n.children.length === 0 && n.textContent === email) { n.dataset.qaMasked = n.textContent; n.textContent = '[QA identity]'; } }); }, process.env.QA_EMAIL || '__no_identity__');
    try { await runtime.screenshot(path.join(evidence.dir, file)); }
    finally { await page.evaluate(() => document.querySelectorAll('[data-qa-masked]').forEach(n => { n.textContent = n.dataset.qaMasked; delete n.dataset.qaMasked; })); }
  }
  return file;
}
async function main() {
  const platform = process.argv[2] || 'web';
  const engine = process.argv[3] || 'chromium';
  let runtime;
  const fallback = platform === 'android' ? 'android-emulator' : engine;
  const evidence = c.createEvidence(platform, fallback, platform === 'web' ? 'browser-390x844' : 'Android-AVD');
  try {
    runtime = await openRuntime(platform, engine);
    const activeEvidence = runtime.runtime === fallback ? evidence : c.createEvidence(platform, runtime.runtime, runtime.device);
    const page = runtime.page;
    page.setDefaultTimeout(30000);
    await page.goto(c.ORIGIN + '/login', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Giriş Yap', exact: true }).waitFor();
    const screenshot = await capture(runtime, activeEvidence, 'login');
    const version = platform === 'android' ? await page.evaluate(() => navigator.userAgent.match(/DiewishAndroid\/([^ ]+)/)?.[1] || 'unknown') : 'unknown';
    activeEvidence.record('login-surface', 'PASS', { screenshot, appVersion: version, viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })) });
    let alias;
    try { alias = await login(page); }
    catch (error) { activeEvidence.record('authenticated-smoke', 'BLOCKED', { code: c.errorCode(error) }); process.exitCode = process.env.QA_AUTHENTICATED_REQUIRED === 'NO' && error instanceof c.Blocked && error.code === 'TEST_ACCOUNT_SECRETS_REQUIRED' ? 0 : 2; return; }
    for (const s of scenarios) {
      try {
        await page.goto(c.ORIGIN + s.path, { waitUntil: 'domcontentloaded' });
        await page.waitForURL(c.ORIGIN + s.path);
        await page.locator(s.anchor).first().waitFor({ state: 'visible' });
        if (s.openCoachList) await openList(page);
        activeEvidence.record(s.name, 'PASS', { alias, appVersion: version, screenshot: await capture(runtime, activeEvidence, s.name), viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })) });
      } catch (error) { activeEvidence.record(s.name, 'FAIL', { code: c.errorCode(error), alias }); process.exitCode = 1; }
    }
    runtime.page = await runtime.relaunch();
    await runtime.page.waitForURL(c.ORIGIN + '/ai', { timeout: 45000 });
    await runtime.page.getByLabel('Mesaj', { exact: true }).waitFor();
    activeEvidence.record('session-relaunch', 'PASS', { alias, screenshot: await capture(runtime, activeEvidence, 'session-relaunch') });
  } catch (error) { console.error(c.errorCode(error)); evidence.record('runtime-start', error instanceof c.Blocked ? 'BLOCKED' : 'FAIL', { code: c.errorCode(error) }); process.exitCode = 1; }
  finally { if (runtime) await runtime.close(); }
}
if (require.main === module) main().catch(() => { process.exitCode = 1; });
module.exports = { openRuntime, login, logout, openList, capture, assertCredentialScreenshotSafe };
