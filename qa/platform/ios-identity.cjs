'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const c = require('./contract.cjs');
function validateIdentity(record, alias, capture = false, now = Date.now() / 1000) {
  if (record?.accountAlias !== alias) throw new c.Blocked('IOS_RUNTIME_ACCOUNT_UNVERIFIED');
  if (capture && (!Number.isFinite(record.captureReadyAt) || now - record.captureReadyAt > 120 || record.captureReadyAt > now)) {
    throw new c.Blocked('IOS_CAPTURE_GUARD_REQUIRED');
  }
  if (capture && record.screenshotGuard !== 'HEALTH_MASK_V1') throw new c.Blocked('HEALTH_DATA_SCREENSHOT_GUARD_FAIL');
}
function verifyIOSIdentity(alias, capture = false) {
  const udid = process.env.QA_IOS_UDID;
  if (process.platform !== 'darwin' || !/^[A-Fa-f0-9-]{36}$/.test(udid || '')) throw new c.Blocked('BOOTED_IOS_SIMULATOR_REQUIRED');
  try {
    const container = execFileSync('xcrun', ['simctl', 'get_app_container', udid, 'com.diewish.qa', 'data'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const record = JSON.parse(fs.readFileSync(path.join(container, 'tmp', 'qa-runtime-identity.json'), 'utf8'));
    validateIdentity(record, alias, capture);
  } catch (error) {
    if (error instanceof c.Blocked) throw error;
    throw new c.Blocked('IOS_RUNTIME_ACCOUNT_UNVERIFIED');
  }
}
module.exports = { validateIdentity, verifyIOSIdentity };
