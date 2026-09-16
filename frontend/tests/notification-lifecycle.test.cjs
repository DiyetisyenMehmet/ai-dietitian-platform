const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load() {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/infrastructure/notifications/notification-lifecycle.ts'),
    'utf8',
  );
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, console, require });
  return exports;
}

test('token rotation and account switch change the idempotency key', () => {
  const { notificationRegistrationKey } = load();
  assert.equal(notificationRegistrationKey('user-a', 'token-1'), 'user-a:token-1');
  assert.notEqual(
    notificationRegistrationKey('user-a', 'token-1'),
    notificationRegistrationKey('user-a', 'token-2'),
  );
  assert.notEqual(
    notificationRegistrationKey('user-a', 'token-1'),
    notificationRegistrationKey('user-b', 'token-1'),
  );
  assert.equal(notificationRegistrationKey('', 'token-1'), '');
  assert.equal(notificationRegistrationKey('user-a', '   '), '');
});

test('pending notification target waits for auth and rejects arbitrary routes', () => {
  const { resolvePendingNotificationTarget } = load();
  assert.equal(resolvePendingNotificationTarget('/meals', false), null);
  assert.equal(resolvePendingNotificationTarget('/meals', true), '/meals');
  assert.equal(resolvePendingNotificationTarget('/profile/blood-tests', true), '/profile/blood-tests');
  assert.equal(resolvePendingNotificationTarget('https://evil.invalid', true), '/dashboard');
  assert.equal(resolvePendingNotificationTarget('/admin', true), '/dashboard');
  assert.equal(resolvePendingNotificationTarget('', true), null);
});

test('logout cleanup runs even when server unregister fails', async () => {
  const { releaseNotificationDevice } = load();
  const events = [];

  await releaseNotificationDevice(
    ' token-1 ',
    async (token) => {
      events.push(`unregister:${token}`);
      throw new Error('offline');
    },
    () => events.push('cleanup'),
  );

  assert.deepEqual(events, ['unregister:token-1', 'cleanup']);
});

test('logout without a token skips unregister but still clears native state', async () => {
  const { releaseNotificationDevice } = load();
  let unregisterCalls = 0;
  let cleanupCalls = 0;

  await releaseNotificationDevice(
    ' ',
    async () => { unregisterCalls += 1; },
    () => { cleanupCalls += 1; },
  );

  assert.equal(unregisterCalls, 0);
  assert.equal(cleanupCalls, 1);
});
