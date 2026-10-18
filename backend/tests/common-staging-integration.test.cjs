/* eslint-disable @typescript-eslint/no-require-imports -- The VM harness executes CommonJS-transpiled modules. */
const test = require('node:test');
const { Buffer } = require('node:buffer');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the merged modules at their dependency boundaries. No database,
// migration, provider, mailbox or live environment is used by these tests.
function load(file, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, Buffer, Date, require(name) {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (name.startsWith('node:') || name === 'zod' || name === 'jsonwebtoken') return require(name);
    throw Error(`Unexpected dependency: ${name}`);
  } });
  return exports;
}
const { ApiError } = load('utils/api-error.ts');
function repository(tx, onTransaction = work => work(tx)) {
  return load('modules/account/account.repository.ts', {
    '../../lib/prisma': { prisma: { $transaction: onTransaction } },
  }).accountRepository;
}
function writer(current, failRevocation = false) {
  const events = [];
  const tx = {
    $queryRaw: async () => { events.push('lock'); },
    user: {
      findUnique: async () => current,
      update: async ({ data }) => { events.push(['password', data]); },
    },
    refreshToken: { updateMany: async args => {
      events.push(['revoke', args]);
      if (failRevocation) throw Error('synthetic transaction failure');
    } },
  };
  return { tx, events };
}
test('#58 expected-state guard survives #54 provenance and #64 outer transaction', async () => {
  for (const expected of [{ passwordHash: 'old', authVersion: 2 }, { passwordHash: 'new', authVersion: 1 }]) {
    const f = writer({ passwordHash: 'new', authVersion: 2 });
    const repo = repository(f.tx, () => { throw Error('Nested transaction must not start'); });
    assert.equal(await repo.changePassword('user-a', 'replacement', expected, f.tx), false);
    assert.deepEqual(f.events, ['lock']);
  }
  const f = writer({ passwordHash: 'old', authVersion: 2 });
  const repo = repository(f.tx, () => { throw Error('Nested transaction must not start'); });
  assert.equal(await repo.changePassword('user-a', 'replacement', { passwordHash: 'old', authVersion: 2 }, f.tx), true);
  assert.equal(f.events[0], 'lock');
  assert.equal(f.events[1][1].hasUsablePassword, true);
  assert.equal(f.events[1][1].authVersion.increment, 1);
  assert.equal(f.events[2][1].where.userId, 'user-a');
});
test('#64 writer propagates revocation failure to its outer transaction without a fallback write', async () => {
  const f = writer({ passwordHash: 'old', authVersion: 2 }, true);
  const repo = repository(f.tx, () => { throw Error('Unexpected independent transaction'); });
  await assert.rejects(repo.changePassword('user-a', 'replacement', { passwordHash: 'old', authVersion: 2 }, f.tx), /synthetic transaction failure/);
  assert.equal(f.events.filter(e => e[0] === 'password').length, 1);
});
test('#49 email reset keeps #54 usable password plus version/revocation and guarded proof claim', async () => {
  const calls = [], now = Date.now();
  const tx = {
    $queryRaw: async () => {},
    user: { findUnique: async () => ({ role: 'USER', isActive: true, email: 'synthetic@example.invalid' }), update: async args => calls.push(['user', args]) },
    accountToken: { updateMany: async args => { calls.push(['proof', args]); return { count: 1 }; } },
    refreshToken: { updateMany: async args => calls.push(['refresh', args]) },
    passwordResetDelivery: { updateMany: async args => calls.push(['delivery', args]) },
  };
  assert.equal(await repository(tx).consumeTokenAndResetPassword('proof-a', 'user-a', 'replacement'), true);
  const claim = calls[0][1].where;
  assert.equal(claim.userId, 'user-a'); assert.equal(claim.usedAt, null);
  assert.equal(claim.type, 'PASSWORD_RESET'); assert.ok(claim.expiresAt.gt.getTime() >= now);
  assert.equal(calls[1][1].data.hasUsablePassword, true);
  assert.equal(calls[1][1].data.authVersion.increment, 1);
  assert.equal(calls[3][0], 'refresh'); assert.equal(calls[4][0], 'delivery');
});
test('merged authentication rejects a pre-reset access token before downstream notification access', async () => {
  const { authenticate } = load('middleware/authenticate.ts', {
    '../modules/auth/auth.repository': { authRepository: { findUserById: async () => ({ isActive: true, role: 'USER', authVersion: 3 }) } },
    '../utils/api-error': { ApiError },
    '../utils/jwt': { verifyAccessToken: () => ({ sub: 'user-a', email: 'synthetic@example.invalid', role: 'USER', authVersion: 2 }) },
  });
  const req = { headers: { authorization: 'Bearer synthetic' } }; let error;
  await authenticate(req, {}, value => { error = value; });
  assert.equal(error.statusCode, 401); assert.equal(req.user, undefined);
});
test('#49 provider check and #59 Admin guard both survive safe-linking routing', async () => {
  for (const safeLinking of [false, true]) {
    const calls = [], identity = { uid: 'synthetic-uid', signInProvider: 'google.com', providers: ['google.com'], googleSubject: 'subject-a', email: 'synthetic@example.invalid', emailVerified: true };
    const admin = { role: 'ADMIN', isActive: false, deactivatedAt: new Date(), email: identity.email };
    const env = { ACCOUNT_SAFE_LINKING_ENABLED: safeLinking };
    const prisma = {
      user: { updateMany: async () => { calls.push('reactivate'); }, update: async () => { calls.push('update'); } },
      accountIdentity: { findUnique: async () => ({ user: admin }) },
    };
    const policy = load('modules/identity/safe-linking.policy.ts', { '../../config/env': { env }, '../../utils/api-error': { ApiError } });
    const auth = { issueAuthSession: async () => calls.push('session') };
    const safeGoogle = load('modules/identity/safe-google.service.ts', {
      '../../lib/prisma': { prisma }, '../../utils/api-error': { ApiError },
      '../../utils/password': { hashPassword: async () => 'synthetic' }, '../auth/auth.service': auth,
      './account-identity.repository': { normalizeAccountIdentifier: (_, value) => value }, './safe-linking.policy': policy,
    });
    const deps = {
      '../../config/env': { env },
      '../../lib/prisma': { prisma },
      '../../utils/api-error': { ApiError }, '../../utils/password': { hashPassword: async () => 'synthetic' },
      '../auth/auth.repository': { authRepository: { findUserByEmail: async () => ({ role: 'ADMIN', isActive: false, deactivatedAt: new Date() }), updateLastLogin: async () => calls.push('lastLogin') } },
      './firebase-auth.provider': { firebaseAuthProvider: { verifyIdToken: async () => identity } },
      './phone-password.service': { phonePasswordEnabled: () => false, phonePasswordService: {} },
      './safe-google.service': safeGoogle,
      './safe-linking.policy': policy,
      '../auth/auth.service': auth,
    };
    const { externalLoginService } = load('modules/identity/external-login.service.ts', deps);
    const jwt = require('jsonwebtoken');
    const token = provider => jwt.sign({ sub: identity.uid, firebase: { sign_in_provider: provider } }, 'synthetic-test-only');
    await assert.rejects(externalLoginService.login(token('password'), {}), e => e.statusCode === 403);
    assert.deepEqual(calls, []); // Firebase password cannot bypass local reset, even with a Google-linked profile.
    await assert.rejects(externalLoginService.login(token('google.com'), {}), e => e.statusCode === 403);
    assert.deepEqual(calls, []);
  }
});
test('#58 UTF-8 bcrypt bound is shared by email reset and #64 SMS completion', () => {
  const account = load('modules/account/account.schemas.ts');
  const sms = load('modules/identity/sms-recovery.schemas.ts', {
    '../account/account.schemas': account,
    './phone-password.schemas': { phoneNumberSchema: require('zod').z.string() },
  });
  const allowed = 'Aa1!' + 'x'.repeat(68), tooLong = 'Aa1!' + 'ü'.repeat(35);
  assert.equal(Buffer.byteLength(allowed), 72); assert.equal(Buffer.byteLength(tooLong), 74);
  assert.ok(account.resetPasswordSchema.safeParse({ token: 'proof', newPassword: allowed }).success);
  assert.equal(account.changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: tooLong }).success, false);
  assert.equal(sms.smsRecoveryCompleteSchema.safeParse({ newPassword: tooLong, passwordConfirmation: tooLong }).success, false);
});
