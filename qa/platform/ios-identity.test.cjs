'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateIdentity } = require('./ios-identity.cjs');
test('manual native capture refuses another account or stale privacy readiness', () => {
  const alias = 'qa-' + 'a'.repeat(24);
  assert.throws(() => validateIdentity({ accountAlias: 'qa-other' }, alias), /IOS_RUNTIME_ACCOUNT_UNVERIFIED/);
  assert.throws(() => validateIdentity({ accountAlias: alias }, alias, true, 1000), /IOS_CAPTURE_GUARD_REQUIRED/);
  assert.throws(() => validateIdentity({ accountAlias: alias, captureReadyAt: 800 }, alias, true, 1000), /IOS_CAPTURE_GUARD_REQUIRED/);
  assert.throws(() => validateIdentity({ accountAlias: alias, captureReadyAt: 990 }, alias, true, 1000), /HEALTH_DATA_SCREENSHOT_GUARD_FAIL/);
  assert.doesNotThrow(() => validateIdentity({ accountAlias: alias, captureReadyAt: 990, screenshotGuard: 'HEALTH_MASK_V1' }, alias, true, 1000));
});
