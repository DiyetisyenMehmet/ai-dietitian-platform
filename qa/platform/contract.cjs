'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const ORIGIN = 'https://staging.diewish.com';
const AUTHORIZED_EMAIL_HASH = 'dfd85175029c6ee89c3ef83bf8a2dcc5b6f56a8b25e32f020cf50c24fe6574de';
const PLATFORMS = { web: ['chromium', 'webkit'], android: ['android-emulator', 'android-physical'], ios: ['ios-simulator', 'ios-physical'] };
class Blocked extends Error { constructor(code) { super(code); this.code = code; } }
function stagingOrigin(value = ORIGIN) {
  if (value !== ORIGIN) throw new Blocked('STAGING_ORIGIN_REQUIRED');
  return value;
}
function authorizedEmail(email, expectedHash = AUTHORIZED_EMAIL_HASH) {
  return typeof email === 'string' && crypto.createHash('sha256').update(email.toLowerCase()).digest('hex') === expectedHash;
}
function loginCredentials(env = process.env, expectedHash = AUTHORIZED_EMAIL_HASH) {
  if (!env.QA_EMAIL || !env.QA_PASSWORD) throw new Blocked('TEST_ACCOUNT_SECRETS_REQUIRED');
  if (!authorizedEmail(env.QA_EMAIL, expectedHash)) throw new Blocked('AUTHORIZED_QA_ACCOUNT_REQUIRED');
  if (env.QA_SYNTHETIC_ACCOUNT !== 'YES') throw new Blocked('SYNTHETIC_ACCOUNT_ATTESTATION_REQUIRED');
  return { email: env.QA_EMAIL, password: env.QA_PASSWORD, id: env.QA_ACCOUNT_ID || null };
}
function credentials(env = process.env, expectedHash = AUTHORIZED_EMAIL_HASH) {
  const user = loginCredentials(env, expectedHash);
  if (!user.id || !env.QA_ACCOUNT_HMAC_KEY) throw new Blocked('TEST_ACCOUNT_SECRETS_REQUIRED');
  if (env.QA_ACCOUNT_HMAC_KEY.length < 32) throw new Blocked('ACCOUNT_HMAC_KEY_TOO_SHORT');
  return user;
}
function accountAlias(id, key = process.env.QA_ACCOUNT_HMAC_KEY) {
  if (!id || !key || key.length < 32) throw new Blocked('ACCOUNT_HMAC_KEY_REQUIRED');
  return 'qa-' + crypto.createHmac('sha256', key).update(id).digest('hex').slice(0, 24);
}
function gitSha() { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); }
function safeName(s) { if (!/^[a-z0-9][a-z0-9_-]{0,100}$/.test(s)) throw new Error('INVALID_ARTIFACT_NAME'); return s; }
function createEvidence(platform, runtime, device) {
  if (!PLATFORMS[platform]?.includes(runtime)) throw new Error('INVALID_RUNTIME_CLASSIFICATION');
  const run = safeName(process.env.QA_RUN_ID || new Date().toISOString().replace(/[^0-9]/g, '') + '-' + crypto.randomBytes(4).toString('hex'));
  const dir = path.join(ROOT, '.qa-artifacts', run, platform, runtime);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const records = [];
  return {
    dir, run,
    record(scenario, status, { code = 'NONE', screenshot = null, alias = null, observed = null, appVersion = 'unknown', deployedGitSha = null, viewport = null, conversationId = null, direction = null } = {}) {
      safeName(scenario);
      if (!['PASS', 'FAIL', 'BLOCKED'].includes(status)) throw new Error('INVALID_STATUS');
      if (!/^[A-Z][A-Z0-9_]*$/.test(code)) throw new Error('UNSAFE_ERROR_CODE');
      if (alias !== null && !/^qa-[a-f0-9]{24}$/.test(alias)) throw new Error('UNSAFE_ACCOUNT_ALIAS');
      if (screenshot !== null && (!/^[a-z0-9_-]+\.png$/.test(screenshot) || !fs.existsSync(path.join(dir, screenshot)))) throw new Error('SCREENSHOT_MISSING_OR_UNSAFE');
      if (screenshot !== null && !require('./capture-guard.cjs').proven(path.join(dir,screenshot))) throw new Blocked('HEALTH_DATA_SCREENSHOT_GUARD_FAIL');
      if (deployedGitSha !== null && !/^[a-f0-9]{40}$/.test(deployedGitSha)) throw new Error('INVALID_DEPLOYED_SHA');
      if (typeof appVersion !== 'string' || !/^[a-zA-Z0-9._-]{1,80}$/.test(appVersion)) throw new Error('UNSAFE_APP_VERSION');
      if (observed !== null && typeof observed !== 'boolean') throw new Error('INVALID_OBSERVATION');
      if (viewport !== null && (!Number.isInteger(viewport.width) || !Number.isInteger(viewport.height))) throw new Error('INVALID_VIEWPORT');
      if (conversationId !== null && !/^[a-zA-Z0-9_-]{1,120}$/.test(conversationId)) throw new Error('UNSAFE_CONVERSATION_ID');
      if (direction !== null && !/^(web|android|ios)-to-(web|android|ios)$/.test(direction)) throw new Error('INVALID_SYNC_DIRECTION');
      const row = { schemaVersion: 1, platform, runtime, scenario, status, code, accountAlias: alias, observed,
        productVerdict: 'NOT_ASSESSED', conversationId, direction, timestamp: new Date().toISOString(), harnessGitSha: gitSha(), deployedGitSha,
        appVersion, device, viewport, screenshot, screenshotGuard: screenshot === null ? null : 'HEALTH_MASK_V1', log: scenario + '.json', stagingOrigin: ORIGIN };
      fs.writeFileSync(path.join(dir, scenario + '.json'), JSON.stringify(row, null, 2));
      records.push(row);
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ schemaVersion: 1, run, records }, null, 2));
      return row;
    },
  };
}
function errorCode(error) {
  if (error instanceof Blocked) return error.code;
  const message = String(error?.message || '');
  if (/ERR_CERT|certificate|TLS/i.test(message)) return 'TLS_CERTIFICATE_VALIDATION_FAILED';
  if (/Executable.*exist|browser.*install/i.test(message)) return 'BROWSER_EXECUTABLE_REQUIRED';
  if (/Host system is missing dependencies|shared libraries|cannot open shared object/i.test(message)) return 'HOST_RUNTIME_DEPENDENCIES_REQUIRED';
  if (/ERR_NAME_NOT_RESOLVED/i.test(message)) return 'STAGING_DNS_FAILED';
  if (/ERR_ABORTED|interrupted by another navigation/i.test(message)) return 'RUNTIME_NAVIGATION_INTERRUPTED';
  if (/Target.*closed|WebView.*closed/i.test(message)) return 'NATIVE_WEBVIEW_CLOSED';
  if (/Protocol error/i.test(message)) return 'NATIVE_WEBVIEW_PROTOCOL_ERROR';
  if (/socket|ECONNRESET|EPIPE/i.test(message)) return 'NATIVE_RUNTIME_CONNECTION_FAILED';
  if (/ERR_CONNECTION|ERR_PROXY|ECONNREFUSED/i.test(message)) return 'STAGING_NETWORK_UNREACHABLE';
  if (error?.name === 'TimeoutError') return 'RUNTIME_WAIT_TIMEOUT';
  if (error instanceof TypeError) return 'HARNESS_TYPE_ERROR';
  return 'RUNTIME_OPERATION_FAILED';
}
module.exports = { ROOT, ORIGIN, AUTHORIZED_EMAIL_HASH, authorizedEmail, PLATFORMS, Blocked, stagingOrigin, loginCredentials, credentials, accountAlias, gitSha, safeName, createEvidence, errorCode };
