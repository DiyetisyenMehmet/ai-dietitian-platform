const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const c = require('./contract.cjs');
test('production and lookalike origins fail closed', () => {
  for (const url of ['https://diewish.com', c.ORIGIN + '.evil', 'http://staging.diewish.com', c.ORIGIN + '/']) assert.throws(() => c.stagingOrigin(url));
  assert.equal(c.stagingOrigin(), c.ORIGIN);
});
test('credentials require synthetic attestation and all secret fields', () => {
  const env = { QA_EMAIL: 'synthetic@example.invalid', QA_PASSWORD: 'synthetic', QA_ACCOUNT_ID: 'id', QA_ACCOUNT_HMAC_KEY: 'x'.repeat(32), QA_SYNTHETIC_ACCOUNT: 'YES' };
  const hash = require('node:crypto').createHash('sha256').update(env.QA_EMAIL).digest('hex');
  assert.throws(() => c.credentials(env));
  assert.equal(c.credentials(env, hash).id, 'id');
  for (const field of Object.keys(env)) assert.throws(() => c.credentials({ ...env, [field]: '' }, hash));
});
test('same identity uses keyed alias across runtimes', () => {
  assert.equal(c.accountAlias('id', 'x'.repeat(32)), c.accountAlias('id', 'x'.repeat(32)));
  assert.notEqual(c.accountAlias('id', 'x'.repeat(32)), c.accountAlias('id', 'y'.repeat(32)));
  assert.match(c.accountAlias('id', 'x'.repeat(32)), /^qa-[a-f0-9]{24}$/);
});
test('browser WebKit cannot be mislabeled as iOS', () => { assert.throws(() => c.createEvidence('ios', 'webkit', 'test')); });
test('rejects path traversal, raw errors, identifiers and missing screenshots', () => {
  const e = c.createEvidence('web', 'chromium', 'browser-390x844');
  try {
    assert.throws(() => e.record('../escape', 'PASS'));
    assert.throws(() => e.record('login', 'PASS', { code: 'secret@example.invalid' }));
    assert.throws(() => e.record('login', 'PASS', { alias: 'raw-user-id' }));
    assert.throws(() => e.record('login', 'PASS', { screenshot: '../image.png' }));
    assert.throws(() => e.record('login', 'PASS', { screenshot: 'missing.png' }));
    e.record('login', 'BLOCKED', { code: 'TEST_ACCOUNT_SECRETS_REQUIRED', token: 'NEVER_SERIALIZE' });
    const data = fs.readFileSync(path.join(e.dir, 'manifest.json'), 'utf8');
    assert.ok(!data.includes('NEVER_SERIALIZE'));
    assert.ok(data.includes('NOT_ASSESSED'));
    assert.ok(!data.includes('raw-user-id'));
  } finally { fs.rmSync(path.join(c.ROOT, '.qa-artifacts', e.run), { recursive: true, force: true }); }
});
