'use strict';
const c = require('./contract.cjs');
const { stage } = require('./android-stage.cjs');
async function closeDevices(devices) {
  await stage('DEVICE_CLOSE', 5000, () => Promise.all(devices.map(device => device.close())));
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
  const start = async () => {
    await stage('APP_LAUNCH', 20000, () => device.shell('am start -n com.diewish.app/.MainActivity'));
    const pid = await stage('APP_PROCESS_READY', 15000, async () => {
      const value = (await device.shell('pidof com.diewish.app')).toString().trim();
      if (!/^\d+$/.test(value)) throw new c.Blocked('ANDROID_APP_PROCESS_MISSING');
      return Number(value);
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
    await stage('STAGING_ORIGIN', 45000, () => page.waitForURL(url => url.origin === c.ORIGIN, { waitUntil: 'commit', timeout: 40000 }));
    await stage('PAGE_DOM_READY', 35000, () => page.waitForLoadState('domcontentloaded', { timeout: 30000 }));
    return page;
  };
  try {
    const page = await start();
    return { platform: 'android', runtime: emulator ? 'android-emulator' : 'android-physical', device: emulator ? 'Android-AVD' : 'Android-device', page,
      screenshot: file => stage('DEVICE_SCREENSHOT', 20000, () => device.screenshot({ path: file })), close,
      refresh: page => stage('PAGE_REFRESH', 35000, () => page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })),
      relaunch: async () => {
        await stage('APP_FORCE_STOP', 15000, () => device.shell('am force-stop com.diewish.app'));
        const page = await start();
        await stage('REOPEN_COACH', 35000, () => page.goto(c.ORIGIN + '/ai', { waitUntil: 'domcontentloaded', timeout: 30000 }));
        return page;
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
module.exports = { openAndroidRuntime, closeDevices };
