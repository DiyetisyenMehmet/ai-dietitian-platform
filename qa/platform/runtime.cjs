'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const c = require('./contract.cjs');
const pw = createRequire(path.join(c.ROOT, 'frontend/package.json'))('playwright');
const scenarios = require('./scenarios.json');
const { navigate } = require('./navigation.cjs');
const { openAndroidRuntime } = require('./android-runtime.cjs');
const { stage: androidStage } = require('./android-stage.cjs');
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
  return openAndroidRuntime(pw);
}
async function login(page, step = (_name, _ms, operation) => operation()) {
  const user = c.credentials();
  await step('AUTH_LOGIN_NAVIGATION', 35000, () => page.goto(c.ORIGIN + '/login', { waitUntil: 'domcontentloaded' }));
  await step('AUTH_FORM_FILL', 35000, async () => {
    await page.getByLabel('E-posta', { exact: true }).fill(user.email);
    await page.getByLabel('Şifre', { exact: true }).fill(user.password);
  });
  const result = page.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/login' && r.request().method() === 'POST', { timeout: 45000 });
  result.catch(() => {}); // A failed click must not leave an unhandled response waiter.
  await step('AUTH_FORM_SUBMIT', 35000, () => page.getByRole('button', { name: 'Giriş Yap', exact: true }).click());
  const response = await step('AUTH_RESPONSE', 50000, () => result);
  if (!response.ok()) throw new c.Blocked('LOGIN_OR_STAGING_ACCESS_DENIED');
  const payload = await response.json();
  if (payload?.data?.user?.id !== user.id) throw new c.Blocked('TEST_ACCOUNT_ID_MISMATCH');
  if (!c.authorizedEmail(payload?.data?.user?.email)) throw new c.Blocked('AUTHORIZED_QA_ACCOUNT_REQUIRED');
  await step('AUTH_DASHBOARD_REDIRECT', 50000, () => page.waitForURL(c.ORIGIN + '/dashboard', { timeout: 45000 }));
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
async function waitForStableFrame(page) {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity);
    const animationWait = Promise.all(finite.map(animation => animation.finished.catch(() => {})));
    const fontWait = document.fonts?.ready?.catch(() => {});
    await Promise.race([
      Promise.all([animationWait, fontWait]),
      new Promise(resolve => setTimeout(resolve, 3000)),
    ]);
  });
}
async function capture(runtime, evidence, name) {
  const page = runtime.page;
  const step = runtime.platform === 'android' ? androidStage : (_name, _ms, operation) => operation();
  if (new URL(page.url()).origin !== c.ORIGIN) throw new c.Blocked('UNTRUSTED_SCREENSHOT_ORIGIN');
  await step('CREDENTIAL_SCREENSHOT_GUARD', 10000, () => assertCredentialScreenshotSafe(page));
  if (runtime.platform === 'android') {
    await step('FRAME_STABLE', 12000, async () => {
      const settled = await page.evaluate(async () => Promise.race([
        Promise.all([document.fonts.ready, ...document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))]).then(() => true),
        new Promise(resolve => setTimeout(() => resolve(false), 10000)),
      ]));
      if (!settled) throw new c.Blocked('ANDROID_FRAME_STABLE_TIMEOUT');
    });
  } else await waitForStableFrame(page);
  // Evidence-only settling: don't measure private values while the screen's
  // ordinary fetches are still completing. A timeout refuses capture.
  await step('EVIDENCE_NETWORK_IDLE',15000,()=>page.waitForLoadState('networkidle',{timeout:12000}));
  const file = name + '-' + runtime.runtime + '.png';
  await step('HEALTH_DATA_SCREENSHOT_GUARD', 30000, () => require('./capture-guard.cjs').guardedCapture(page,path.join(evidence.dir,file), () => runtime.platform==='web' ? page.screenshot({caret:'initial'}) : runtime.screenshot()));
  return file;
}
async function main() {
  const platform = process.argv[2] || 'web';
  const engine = process.argv[3] || 'chromium';
  const step = platform === 'android' ? androidStage : (_name, _ms, operation) => operation();
  let runtime;
  let phase = 'RUNTIME_OPEN';
  const fallback = platform === 'android' ? 'android-emulator' : engine;
  const evidence = c.createEvidence(platform, fallback, platform === 'web' ? 'browser-390x844' : 'Android-AVD');
  try {
    runtime = await openRuntime(platform, engine);
    const activeEvidence = runtime.runtime === fallback ? evidence : c.createEvidence(platform, runtime.runtime, runtime.device);
    const page = runtime.page;
    page.setDefaultTimeout(30000);
    phase = 'LOGIN_NAVIGATION';
    await step('LOGIN_SCREEN_NAVIGATION', 95000, () => navigate(page, c.ORIGIN + '/login'));
    await step('LOGIN_SCREEN_READY', 35000, () => page.getByRole('button', { name: 'Giriş Yap', exact: true }).waitFor());
    phase = 'LOGIN_CAPTURE';
    const screenshot = await capture(runtime, activeEvidence, 'login');
    const version = platform === 'android' ? await page.evaluate(() => navigator.userAgent.match(/DiewishAndroid\/([^ ]+)/)?.[1] || 'unknown') : 'unknown';
    activeEvidence.record('login-surface', 'PASS', { screenshot, appVersion: version, viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })) });
    let alias;
    phase = 'AUTHENTICATED_LOGIN';
    try { alias = await login(page, step); }
    catch (error) { activeEvidence.record('authenticated-smoke', 'BLOCKED', { code: c.errorCode(error) }); process.exitCode = process.env.QA_AUTHENTICATED_REQUIRED === 'NO' && error instanceof c.Blocked && error.code === 'TEST_ACCOUNT_SECRETS_REQUIRED' ? 0 : 2; return; }
    for (const s of scenarios) {
      try {
        phase = s.name.replace(/-/g, '_').toUpperCase();
        await step(phase + '_NAVIGATION', 35000, () => page.goto(c.ORIGIN + s.path, { waitUntil: 'domcontentloaded' }));
        await step(phase + '_READY', 95000, async () => {
          await page.waitForURL(c.ORIGIN + s.path);
          await page.locator(s.anchor).first().waitFor({ state: 'visible' });
          if (s.title) await page.getByText(s.title, { exact: true }).first().waitFor({ state: 'visible' });
          if (s.openCoachList) await openList(page);
        });
        activeEvidence.record(s.name, 'PASS', { alias, appVersion: version, screenshot: await capture(runtime, activeEvidence, s.name), viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })) });
      } catch (error) { activeEvidence.record(s.name, 'FAIL', { code: c.errorCode(error), alias }); process.exitCode = 1; }
    }
    phase = 'SESSION_RELAUNCH';
    runtime.page = await step('SESSION_RELAUNCH', 180000, () => runtime.relaunch());
    await step('SESSION_REOPEN_READY', 80000, async () => {
      await runtime.page.waitForURL(c.ORIGIN + '/ai', { timeout: 45000 });
      await runtime.page.getByLabel('Mesaj', { exact: true }).waitFor();
    });
    activeEvidence.record('session-relaunch', 'PASS', { alias, screenshot: await capture(runtime, activeEvidence, 'session-relaunch') });
  } catch (error) {
    const code = c.errorCode(error); console.error(code, 'RUNTIME_PHASE_' + phase);
    let screenshot;
    if (platform === 'android' && runtime && phase === 'SESSION_RELAUNCH' && error.androidFailurePage) {
      runtime.page = error.androidFailurePage;
      try { screenshot = await capture(runtime, evidence, 'session-reopen-failure'); }
      catch { console.log('ANDROID_STAGE', 'SESSION_FAILURE_EVIDENCE', 'FAIL'); }
    }
    evidence.record('runtime-start', error instanceof c.Blocked ? 'BLOCKED' : 'FAIL', { code: code === 'RUNTIME_OPERATION_FAILED' ? phase + '_FAILED' : code, ...(screenshot ? { screenshot } : {}) }); process.exitCode = 1;
  }
  finally {
    if (runtime) {
      try { await runtime.close(); }
      catch (error) {
        if (platform !== 'android') throw error;
        evidence.record('runtime-cleanup', 'FAIL', { code: c.errorCode(error) });
        process.exitCode = 1;
      }
    }
  }
}
if (require.main === module) main().then(() => {
  // The Android CLI owns the Playwright driver; no IPC/timer can keep it alive
  // after bounded resource cleanup. Preserve the real test result on exit.
  if ((process.argv[2] || 'web') === 'android') process.exit(process.exitCode || 0);
}).catch(() => {
  process.exitCode = 1;
  if (process.argv[2] === 'android') process.exit(1);
});
module.exports = { openRuntime, login, logout, openList, capture, assertCredentialScreenshotSafe, waitForStableFrame, navigate };
