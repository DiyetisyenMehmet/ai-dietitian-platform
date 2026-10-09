'use strict';
const c = require('./contract.cjs');
const { stage } = require('./android-stage.cjs');
async function closeDevices(devices) {
  await stage('DEVICE_CLOSE', 5000, () => Promise.all(devices.map(device => device.close())));
}
function originClass(value) {
  try {
    const url = new URL(value);
    if (url.origin === c.ORIGIN) return 'STAGING';
    if (url.protocol === 'about:') return 'BLANK';
    if (url.protocol === 'chrome-error:') return 'NETWORK_ERROR';
    return 'OTHER';
  } catch { return 'UNKNOWN'; }
}
async function pageState(page, label) {
  console.log('ANDROID_STATE', label, 'FRAME', originClass(page.url()));
  const route = (() => { try { const url = new URL(page.url()); return url.origin === c.ORIGIN ? ({'/login':'LOGIN','/dashboard':'DASHBOARD','/ai':'COACH'}[url.pathname] || 'OTHER') : 'OTHER'; } catch { return 'UNKNOWN'; } })();
  console.log('ANDROID_STATE', label, 'ROUTE', route);
  const state = await stage('PAGE_STATE', 5000, () => page.evaluate(origin => ({
    origin: location.origin === origin ? 'STAGING' : location.protocol === 'about:' ? 'BLANK' : location.protocol === 'chrome-error:' ? 'NETWORK_ERROR' : 'OTHER',
    ready: document.readyState,
    online: navigator.onLine,
  }), c.ORIGIN));
  console.log('ANDROID_STATE', label, 'DOCUMENT', ['STAGING','BLANK','NETWORK_ERROR','OTHER'].includes(state.origin) ? state.origin : 'UNKNOWN',
    'READY', ['loading','interactive','complete'].includes(state.ready) ? state.ready.toUpperCase() : 'UNKNOWN', 'ONLINE', state.online === true ? 'YES' : 'NO');
}
async function openAndroidRuntime(pw) {
  const devices = await stage('DEVICE_DISCOVERY', 15000, () => pw._android.devices());
  const serial = process.env.QA_ANDROID_SERIAL;
  const device = serial ? devices.find(d => d.serial() === serial) : devices.length === 1 ? devices[0] : null;
  if (!device) {
    await closeDevices(devices).catch(() => {});
    throw new c.Blocked('ONE_ANDROID_DEVICE_REQUIRED');
  }
  const emulator = device.serial().startsWith('emulator-');
  const close = () => closeDevices(devices);
  if (!emulator && process.env.QA_ALLOW_PHYSICAL !== 'YES') {
    await close().catch(() => {});
    throw new c.Blocked('PHYSICAL_DEVICE_OPT_IN_REQUIRED');
  }
  device.setDefaultTimeout(30000);
  const start = async (reopened = false) => {
    await stage('APP_LAUNCH', 20000, () => device.shell('am start -W -n com.diewish.app/.MainActivity'));
    const pid = await stage('APP_PROCESS_READY', 15000, async () => {
      // ActivityManager start and process creation are asynchronous after a
      // force-stop. An empty immediate pidof is not a completed launch failure.
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const value = (await device.shell('pidof com.diewish.app')).toString().trim();
        if (/^\d+$/.test(value)) return Number(value);
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      throw new c.Blocked('ANDROID_APP_PROCESS_READY_TIMEOUT');
    });
    // A killed app's old WebView may remain in the Playwright discovery cache.
    // Only bind the socket owned by the currently running app process.
    const view = await stage('WEBVIEW_DISCOVERY', 45000, async () => {
      for (let attempt = 0; attempt < 160; attempt++) {
        const match = device.webViews().find(v => v.pkg() === 'com.diewish.app' && v.pid() === pid);
        if (match) return match;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      throw new c.Blocked('ANDROID_WEBVIEW_DISCOVERY_TIMEOUT');
    });
    const page = await stage('WEBVIEW_ATTACH', 45000, () => view.page());
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);
    if (reopened) page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === c.ORIGIN && url.pathname === '/api/auth/refresh' && response.request().method() === 'POST') {
        const status = response.status();
        console.log('ANDROID_AUTH', 'REOPEN_REFRESH', response.ok() ? 'SUCCESS' : 'FAIL', Number.isInteger(status) && status >= 100 && status <= 599 ? 'HTTP_' + status : 'HTTP_UNKNOWN');
      }
    });
    page.on('requestfailed', request => {
      if (!request.isNavigationRequest()) return;
      const code = request.failure()?.errorText;
      const allowed = ['net::ERR_NAME_NOT_RESOLVED','net::ERR_INTERNET_DISCONNECTED','net::ERR_CONNECTION_TIMED_OUT','net::ERR_CONNECTION_REFUSED','net::ERR_CONNECTION_RESET','net::ERR_CERT_AUTHORITY_INVALID','net::ERR_CERT_DATE_INVALID','net::ERR_CERT_COMMON_NAME_INVALID','net::ERR_NETWORK_CHANGED','net::ERR_ABORTED'];
      console.log('ANDROID_NETWORK', 'NAVIGATION_FAILED', allowed.includes(code) ? code.replace('net::','') : 'OTHER');
    });
    await pageState(page, 'ATTACHED');
    try {
      await stage('STAGING_ORIGIN', 45000, () => page.waitForURL(url => url.origin === c.ORIGIN, { waitUntil: 'commit', timeout: 40000 }));
    } catch (error) {
      await pageState(page, 'ORIGIN_TIMEOUT').catch(() => {});
      throw error;
    }
    await stage('PAGE_DOM_READY', 35000, () => page.waitForLoadState('domcontentloaded', { timeout: 30000 }));
    return page;
  };
  try {
    let page = await start();
    return { platform: 'android', runtime: emulator ? 'android-emulator' : 'android-physical', device: emulator ? 'Android-AVD' : 'Android-device', page,
      screenshot: file => stage('DEVICE_SCREENSHOT', 20000, () => device.screenshot({ path: file })), close,
      refresh: page => stage('PAGE_REFRESH', 35000, () => page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })),
      relaunch: async () => {
        await stage('APP_FORCE_STOP', 15000, () => device.shell('am force-stop com.diewish.app'));
        const reopenedPage = await start(true);
        page = reopenedPage;
        try {
          // Native onCreate opens Dashboard. Its DOM can be complete while the
          // ordinary auth/session recovery is still in flight. Do not interrupt
          // that recovery with a second full-document navigation.
          await stage('SESSION_RESTORE_DASHBOARD_READY', 60000, async () => {
            await reopenedPage.waitForURL(c.ORIGIN + '/dashboard', { timeout: 45000 });
            await reopenedPage.getByText('Bugünkü Yolculuğum', { exact: true }).waitFor({ state: 'visible', timeout: 45000 });
          });
        } catch (error) {
          await pageState(reopenedPage, 'SESSION_RESTORE_FAILED').catch(() => {});
          // Allow only an empty, trusted login surface to be captured by the
          // outer runner as failure evidence; never reauthenticate here.
          if (reopenedPage.url() === c.ORIGIN + '/login') {
            error.androidFailurePage = reopenedPage;
          }
          throw error;
        }
        await pageState(reopenedPage, 'SESSION_RESTORED');
        await stage('REOPEN_COACH', 35000, () => reopenedPage.goto(c.ORIGIN + '/ai', { waitUntil: 'domcontentloaded', timeout: 30000 }));
        return reopenedPage;
      },
      offline: async value => {
        await stage('NETWORK_CHANGE', 20000, async () => {
          await device.shell('svc wifi ' + (value ? 'disable' : 'enable'));
          await device.shell('svc data ' + (value ? 'disable' : 'enable'));
        });
      },
    };
  } catch (error) {
    // Resource ownership begins at discovery, not only after openRuntime returns.
    await close().catch(() => {});
    throw error;
  }
}
module.exports = { openAndroidRuntime, closeDevices, originClass };
