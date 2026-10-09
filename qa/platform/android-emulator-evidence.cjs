'use strict';
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const c = require('./contract.cjs');
const { stage } = require('./android-stage.cjs');
async function adb(serial, args, timeout = 10000) {
  // Output stays private. adb never receives any credential in its arguments.
  return (await exec('adb', [...(serial ? ['-s', serial] : []), ...args], { timeout, maxBuffer: 1024 * 1024 })).stdout.trim();
}
async function main() {
  const serial = await stage('ADB_DEVICE_READY', 20000, async () => {
    const output = await adb(null, ['devices']);
    const ready = output.split('\n').map(line => line.trim().split(/\s+/)).filter(row => /^emulator-\d+$/.test(row[0]) && row[1] === 'device');
    const requested = process.env.QA_ANDROID_SERIAL;
    const row = requested ? ready.find(row => row[0] === requested) : ready.length === 1 ? ready[0] : null;
    if (!row) throw new c.Blocked('ONE_READY_ANDROID_EMULATOR_REQUIRED');
    await adb(row[0], ['wait-for-device'], 10000);
    return row[0];
  });
  await stage('BOOT_AND_PACKAGE_MANAGER_READY', 90000, async () => {
    const deadline = Date.now() + 80000;
    while (Date.now() < deadline) {
      const booted = await adb(serial, ['shell', 'getprop', 'sys.boot_completed']);
      const packageReady = await adb(serial, ['shell', 'pm', 'path', 'android']);
      if (booted === '1' && packageReady.startsWith('package:')) return;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new c.Blocked('ANDROID_BOOT_AND_PACKAGE_MANAGER_READY_TIMEOUT');
  });
  await stage('APK_INSTALL', 120000, async () => {
    const output = await adb(serial, ['install', '-r', 'android/app/build/outputs/apk/debug/app-debug.apk'], 110000);
    if (!/(^|\n)Success$/.test(output)) throw new c.Blocked('ANDROID_APK_INSTALL_FAILED');
  });
  await stage('NATIVE_ACTIVITY_READY', 30000, async () => {
    const output = await adb(serial, ['shell', 'am', 'start', '-W', '-n', 'com.diewish.app/.MainActivity'], 25000);
    if (!/Status:\s*ok/.test(output)) throw new c.Blocked('ANDROID_ACTIVITY_LAUNCH_FAILED');
    if (!/^\d+$/.test(await adb(serial, ['shell', 'pidof', 'com.diewish.app']))) throw new c.Blocked('ANDROID_APP_PROCESS_MISSING');
  });
  process.env.QA_ANDROID_SERIAL = serial;
  await require('./authenticated-run.cjs').main(['android']);
}
main().then(() => process.exit(process.exitCode || 0)).catch(error => { console.error(c.errorCode(error)); process.exit(2); });
