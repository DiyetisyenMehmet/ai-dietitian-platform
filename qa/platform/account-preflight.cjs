'use strict';
const c = require('./contract.cjs');
const { randomBytes } = require('node:crypto');
async function preflight({ env = process.env, request = fetch, expectedHash = c.AUTHORIZED_EMAIL_HASH } = {}) {
  const user = c.loginCredentials(env, expectedHash);
  c.stagingOrigin(env.QA_BASE_URL || c.ORIGIN);
  const key = env.QA_ACCOUNT_HMAC_KEY || randomBytes(32).toString('hex');
  if (key.length < 32) throw new c.Blocked('ACCOUNT_HMAC_KEY_TOO_SHORT');
  let cookie = null;
  let id;
  try {
    const response = await request(c.ORIGIN + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email, password: user.password }), redirect: 'error', signal: AbortSignal.timeout(30000) });
    cookie = response.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
    if (!response.ok) throw new c.Blocked('LOGIN_OR_STAGING_ACCESS_DENIED');
    if (!cookie) throw new c.Blocked('AUTH_COOKIE_REQUIRED');
    const body = await response.json();
    id = body?.data?.user?.id;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(id)) throw new c.Blocked('TRUSTED_ACCOUNT_ID_REQUIRED');
    if (!c.authorizedEmail(body?.data?.user?.email, expectedHash)) throw new c.Blocked('AUTHORIZED_QA_ACCOUNT_REQUIRED');
    if (user.id && id !== user.id) throw new c.Blocked('TEST_ACCOUNT_ID_MISMATCH');
    if (body?.data?.user?.onboardingCompleted !== true) throw new c.Blocked('PREPARED_TEST_ACCOUNT_REQUIRED');
  } finally {
    // Only this preflight session is revoked. Never revoke another runtime.
    if (cookie) {
      const response = await request(c.ORIGIN + '/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: '{}', redirect: 'error', signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new c.Blocked('PREFLIGHT_SESSION_CLEANUP_FAILED');
    }
  }
  // Publish only inside this process after both verification and session cleanup.
  env.QA_ACCOUNT_ID = id;
  env.QA_ACCOUNT_HMAC_KEY = key;
  return c.accountAlias(id, key);
}
if (require.main === module) preflight().then(alias => console.log('Verified synthetic account: ' + alias)).catch(error => { console.error(c.errorCode(error)); process.exitCode = 2; });
module.exports = { preflight };
