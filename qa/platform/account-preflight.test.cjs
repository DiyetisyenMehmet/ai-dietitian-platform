'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('./contract.cjs');
const { preflight } = require('./account-preflight.cjs');
const fixtureEmail = 'synthetic@example.invalid';
const expectedHash = require('node:crypto').createHash('sha256').update(fixtureEmail).digest('hex');
const { command } = require('./authenticated-run.cjs');
function fixture(overrides = {}, cleanupOK = true) {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/logout')) return { ok: cleanupOK };
    return { ok: true, headers: { getSetCookie: () => ['refresh=fixture; HttpOnly; Secure'] }, json: async () => ({ data: { user: { id: 'fixture-account', email: fixtureEmail, onboardingCompleted: true, ...overrides } } }) };
  };
  return { calls, request };
}
const env = () => ({ QA_EMAIL: fixtureEmail, QA_PASSWORD: 'fixture-password', QA_SYNTHETIC_ACCOUNT: 'YES' });
test('derive identity and random key only from verified login, then revoke own session', async () => {
  const state = env(), f = fixture();
  const alias = await preflight({ env: state, request: f.request, expectedHash });
  assert.equal(state.QA_ACCOUNT_ID, 'fixture-account');
  assert.match(state.QA_ACCOUNT_HMAC_KEY, /^[a-f0-9]{64}$/);
  assert.equal(alias, c.accountAlias(state.QA_ACCOUNT_ID, state.QA_ACCOUNT_HMAC_KEY));
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].options.headers.cookie, 'refresh=fixture');
  const other = env(); await preflight({ env: other, request: fixture().request, expectedHash });
  assert.notEqual(state.QA_ACCOUNT_HMAC_KEY, other.QA_ACCOUNT_HMAC_KEY);
});
test('wrong account, incomplete onboarding, cleanup failure and configured ID mismatch fail closed', async () => {
  for (const [overrides, cleanupOK, expected] of [[{email:'other@example.invalid'}, true, null], [{onboardingCompleted:false}, true, null], [{}, false, null], [{}, true, 'different-id']]) {
    const state = env(); if (expected) state.QA_ACCOUNT_ID = expected;
    const f = fixture(overrides, cleanupOK);
    await assert.rejects(preflight({ env: state, request: f.request, expectedHash }), c.Blocked);
    assert.equal(state.QA_ACCOUNT_ID, expected || undefined);
    assert.equal(state.QA_ACCOUNT_HMAC_KEY, undefined);
    assert.equal(f.calls.length, 2);
  }
  const f = fixture(); await assert.rejects(preflight({env:{...env(),QA_EMAIL:'other@example.invalid'},request:f.request,expectedHash}), c.Blocked);
  assert.equal(f.calls.length, 0);
});
test('prepared entry point cannot run arbitrary commands or spoof native iOS with browser', () => {
  assert.throws(() => command(['shell', 'echo']), c.Blocked);
  assert.throws(() => command(['web', 'ios']), c.Blocked);
  assert.throws(() => command(['sync', 'ios', 'web']), c.Blocked);
  assert.deepEqual(command(['ios']), ['bash', ['qa/platform/ios-run.sh']]);
});
