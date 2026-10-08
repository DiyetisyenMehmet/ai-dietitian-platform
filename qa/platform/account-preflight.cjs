'use strict';
const c = require('./contract.cjs');
async function preflight() {
  const user = c.credentials();
  c.stagingOrigin(process.env.QA_BASE_URL || c.ORIGIN);
  let cookie = null;
  try {
    const response = await fetch(c.ORIGIN + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email, password: user.password }), redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok()) throw new c.Blocked('LOGIN_OR_STAGING_ACCESS_DENIED');
    cookie = response.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
    if (!cookie) throw new c.Blocked('AUTH_COOKIE_REQUIRED');
    const body = await response.json();
    if (body?.data?.user?.id !== user.id) throw new c.Blocked('TEST_ACCOUNT_ID_MISMATCH');
    if (body?.data?.user?.onboardingCompleted !== true) throw new c.Blocked('PREPARED_TEST_ACCOUNT_REQUIRED');
    return c.accountAlias(user.id);
  } finally {
    // Only this preflight session is revoked. Never revoke another runtime.
    if (cookie) {
      const response = await fetch(c.ORIGIN + '/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: '{}', redirect: 'error', signal: AbortSignal.timeout(30000) });
      if (!response.ok()) throw new c.Blocked('PREFLIGHT_SESSION_CLEANUP_FAILED');
    }
  }
}
if (require.main === module) preflight().then(alias => console.log('Verified synthetic account: ' + alias)).catch(error => { console.error(c.errorCode(error)); process.exitCode = 2; });
module.exports = { preflight };
