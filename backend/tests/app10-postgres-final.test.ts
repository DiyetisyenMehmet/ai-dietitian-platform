import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import { Client } from 'pg';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';
import { prisma } from '../src/lib/prisma';
import { createApp } from '../src/app';
import { hashToken } from '../src/utils/jwt';
import { hashPassword, verifyPassword } from '../src/utils/password';
import { ApiError } from '../src/utils/api-error';
import { accountRepository } from '../src/modules/account/account.repository';
import { accountService } from '../src/modules/account/account.service';
import { authRepository } from '../src/modules/auth/auth.repository';
import { authService } from '../src/modules/auth/auth.service';
import { firebaseAuthProvider, type VerifiedExternalIdentity } from '../src/modules/identity/firebase-auth.provider';
import { smsRecoveryService as sms } from '../src/modules/identity/sms-recovery.service';
import { phonePasswordService as a3 } from '../src/modules/identity/phone-password.service';
import { externalLoginService } from '../src/modules/identity/external-login.service';
import { proofEventHash } from '../src/modules/identity/safe-linking.policy';

const url = new URL(process.env.DATABASE_URL!);
assert.equal(process.env.APP10_DISPOSABLE_POSTGRES, '1');
assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/app10_final_test');
assert.equal(url.username, 'app10'); assert.equal(env.NODE_ENV, 'test');
const oldPassword = 'SyntheticOldPassword123!';
const emailPassword = 'SyntheticEmailPassword456!';
const smsPassword = 'SyntheticSmsPassword789!';
const input = (value: string) => ({ newPassword: value, passwordConfirmation: value });

test('APP10 final combined PostgreSQL boundaries only', { timeout: 90000 }, async t => {
  assert.equal(env.ACCOUNT_SAFE_LINKING_ENABLED, false);
  assert.equal(env.PHONE_PASSWORD_AUTH_ENABLED, false);
  assert.equal(env.PHONE_SMS_RECOVERY_ENABLED, false);
  // Only this isolated test process exercises gated services. No runtime config is changed.
  env.ACCOUNT_SAFE_LINKING_ENABLED = env.PHONE_PASSWORD_AUTH_ENABLED = env.PHONE_SMS_RECOVERY_ENABLED = true;
  const originalVerify = firebaseAuthProvider.verifyIdToken;
  const originalFetch = globalThis.fetch;
  const proofs = new Map<string, VerifiedExternalIdentity>();
  firebaseAuthProvider.verifyIdToken = async token => {
    const proof = proofs.get(token);
    if (!proof) throw ApiError.unauthorized('Synthetic provider boundary');
    return proof;
  };
  globalThis.fetch = (resource, init) => {
    const target = new URL(typeof resource === 'string' ? resource : resource instanceof URL ? resource.href : resource.url);
    assert.equal(target.hostname, '127.0.0.1', 'External network is forbidden in this acceptance harness');
    return originalFetch(resource, init);
  };
  const observer = new Client({ connectionString: url.toString() }); await observer.connect();
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const evidence: Record<string, unknown>[] = [];
  const runCase = (name: string, fn: () => Promise<void>): Promise<void> => {
    if (process.env.APP10_ACCEPTANCE_CASE && !String(name).startsWith(process.env.APP10_ACCEPTANCE_CASE)) return Promise.resolve();
    return t.test(name, fn);
  };
  t.after(async () => {
    firebaseAuthProvider.verifyIdToken = originalVerify; globalThis.fetch = originalFetch;
    env.ACCOUNT_SAFE_LINKING_ENABLED = env.PHONE_PASSWORD_AUTH_ENABLED = env.PHONE_SMS_RECOVERY_ENABLED = false;
    server.closeAllConnections(); await new Promise<void>(r => server.close(() => r()));
    await observer.end(); await prisma.$disconnect();
    fs.writeFileSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'app10-postgres-evidence.json'), JSON.stringify({ sourceHead: 'ea150dda608c9910f7e80c69cfa2a2dec8c6dc36', sourceTree: 'cd2d5d645ec478d4995115c7f36c5b5262bc521d', evidence }, null, 2));
  });
  const number = () => `+905${crypto.randomInt(100000000, 999999999)}`;
  async function user(extra = {}) {
    const phone = number();
    const row = await prisma.user.create({ data: {
      email: `${crypto.randomUUID()}@example.invalid`, passwordHash: await hashPassword(oldPassword),
      hasUsablePassword: true, ...extra,
    } });
    await prisma.accountIdentity.create({ data: { userId: row.id, kind: 'PHONE', identifier: phone, verifiedAt: new Date(Date.now() - 2000) } });
    return { ...row, phone };
  }
  function phoneProof(phone: string) {
    const token = crypto.randomBytes(32).toString('base64url');
    proofs.set(token, { uid: crypto.randomUUID(), phoneNumber: phone, phoneAuthenticationVerified: true,
      signInProvider: 'phone', providers: ['phone'], email: null, emailVerified: false, displayName: null,
      authTime: Math.floor(Date.now() / 1000) });
    return token;
  }
  async function smsProof(u: Awaited<ReturnType<typeof user>>) {
    const op = await sms.begin({ phoneNumber: u.phone }); const token = phoneProof(u.phone);
    await sms.verify(op.secret, { idToken: token }); return { ...op, token };
  }
  async function emailProof(userId: string) {
    const secret = crypto.randomBytes(32).toString('base64url');
    await prisma.accountToken.create({ data: { userId, type: 'PASSWORD_RESET', tokenHash: hashToken(secret), expiresAt: new Date(Date.now() + 60000) } });
    return secret;
  }
  async function securitySnapshot(userId: string, phone: string) {
    return JSON.stringify(await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: {
      refreshTokens: { orderBy: { id: 'asc' } }, accountTokens: { orderBy: { id: 'asc' } },
    } })) + JSON.stringify(await prisma.phonePasswordChallenge.findMany({ where: { phoneNumber: phone }, orderBy: { id: 'asc' } }))
      + JSON.stringify(await prisma.passwordResetDelivery.findMany({ where: { userId } }))
      + JSON.stringify(await prisma.accountIdentityOperation.findMany({ where: { userId }, orderBy: { id: 'asc' } }));
  }
  async function me(accessToken: string) {
    return (await fetch(base + '/auth/me', { headers: { authorization: `Bearer ${accessToken}` } })).status;
  }
  async function oldSessionDenied(session: Awaited<ReturnType<typeof authService.login>>) {
    assert.equal(await me(session.tokens.accessToken), 401);
    await assert.rejects(authService.refresh(session.refreshToken, {}));
  }
  async function waitForBlocked(count: number) {
    const deadline = Date.now() + 3500;
    while (Date.now() < deadline) {
      const result = await observer.query("SELECT pid FROM pg_stat_activity WHERE datname='app10_final_test' AND wait_event_type='Lock' AND query ILIKE '%FROM users%FOR UPDATE%'");
      if (result.rows.length >= count) return result.rows.map(r => r.pid);
      await new Promise(r => setTimeout(r, 15));
    }
    assert.fail(`Expected ${count} concurrent PostgreSQL row-lock waiters`);
  }
  const observed = (promise: Promise<unknown>) => promise.then(() => ({ success: true, code: null }), error => ({ success: false, code: error instanceof ApiError ? error.code : 'UNEXPECTED_SQL_OR_RUNTIME_ERROR' }));

  for (const first of ['email', 'sms'] as const) await runCase(`PG01 ${first} wins real concurrent email/SMS reset; loser cannot overwrite`, async () => {
    const u = await user(), other = await user();
    const foreignBefore = await securitySnapshot(other.id, other.phone);
    const session = await authService.login({ email: u.email, password: oldPassword }, {});
    const proof = await smsProof(u), mail = await emailProof(u.id);
    const gate = new Client({ connectionString: url.toString() }); await gate.connect();
    await gate.query('BEGIN'); await gate.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [u.id]);
    const run = (kind: 'email' | 'sms') => kind === 'email' ? accountService.resetPassword(mail, emailPassword, {}) : sms.complete(proof.secret, input(smsPassword));
    let one: ReturnType<typeof observed> | undefined, two: ReturnType<typeof observed> | undefined;
    let pids: number[] = [];
    try {
      one = observed(run(first)); await waitForBlocked(1);
      two = observed(run(first === 'email' ? 'sms' : 'email')); pids = await waitForBlocked(2);
    } finally { await gate.query('COMMIT'); await gate.end(); }
    const results = await Promise.all([one!, two!]);
    assert.equal(results[0].success, true); assert.equal(results[1].success, false);
    assert.ok(['TOKEN_INVALID', 'SMS_RECOVERY_INVALID'].includes(results[1].code!));
    assert.ok(new Set(pids).size >= 2, 'Race must use separate blocked PostgreSQL backends');
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    const winner = first === 'email' ? emailPassword : smsPassword;
    assert.equal(saved.authVersion, u.authVersion + 1); assert.equal(saved.hasUsablePassword, true);
    assert.ok(await verifyPassword(winner, saved.passwordHash)); assert.equal(await verifyPassword(oldPassword, saved.passwordHash), false);
    assert.equal(await prisma.refreshToken.count({ where: { userId: u.id, revokedAt: null } }), 0);
    await oldSessionDenied(session);
    await assert.rejects(authService.login({ email: u.email, password: oldPassword }, {}));
    assert.equal(await accountRepository.changePassword(u.id, await hashPassword(oldPassword), { passwordHash: u.passwordHash, authVersion: u.authVersion }), false);
    await assert.rejects(authRepository.createRefreshToken({ id: crypto.randomUUID(), userId: u.id, tokenHash: hashToken(crypto.randomUUID()), expiresAt: new Date(Date.now() + 60000), authVersion: u.authVersion }));
    assert.equal((await authService.login({ email: u.email, password: winner }, {})).user.id, u.id);
    assert.equal((await a3.login({ phoneNumber: u.phone, password: winner }, {})).user.id, u.id);
    await assert.rejects(accountService.resetPassword(mail, oldPassword, {}));
    await assert.rejects(sms.complete(proof.secret, input(oldPassword)));
    assert.ok((await securitySnapshot(other.id, other.phone)) === foreignBefore, 'Foreign user changed in reset race');
    evidence.push({ case: `PG01-${first}-first`, result: 'PASS', observedBlockedBackends: pids.length, successfulWriters: 1, versionIncrement: 1, oldAccessRefreshDenied: true, foreignUnchanged: true });
  });

  for (const route of ['sms', 'email'] as const) await runCase(`PG02 ${route} SQL failure rolls back credential/proof/session/delivery changes`, async () => {
    const u = await user(), session = await authService.login({ email: u.email, password: oldPassword }, {});
    const recovery = await smsProof(u), mail = await emailProof(u.id);
    await prisma.passwordResetDelivery.create({ data: { userId: u.id, requestedAt: new Date() } });
    await prisma.accountIdentityOperation.create({ data: { userId: u.id, purpose: 'LINK_METHOD', kind: 'PHONE', identifier: u.phone, sessionHash: 'c'.repeat(64), securityStamp: 'd'.repeat(64), reauthenticatedAt: new Date(), expiresAt: new Date(Date.now() + 60000) } });
    const before = await securitySnapshot(u.id, u.phone);
    assert.match(u.id, /^[a-f0-9-]{36}$/);
    await observer.query(`CREATE FUNCTION app10_fail_delivery() RETURNS trigger AS $$ BEGIN IF OLD."userId" = '${u.id}' THEN RAISE EXCEPTION 'APP10_SYNTHETIC_SQL_FAILURE'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await observer.query('CREATE TRIGGER app10_fail_delivery BEFORE UPDATE ON password_reset_deliveries FOR EACH ROW EXECUTE FUNCTION app10_fail_delivery()');
    try {
      if (route === 'sms') await assert.rejects(sms.complete(recovery.secret, input(smsPassword)), error => error instanceof ApiError && error.code === 'SMS_RECOVERY_INVALID');
      else await assert.rejects(accountService.resetPassword(mail, emailPassword, {}));
    } finally {
      await observer.query('DROP TRIGGER app10_fail_delivery ON password_reset_deliveries'); await observer.query('DROP FUNCTION app10_fail_delivery()');
    }
    assert.ok((await securitySnapshot(u.id, u.phone)) === before, 'SQL rollback must restore the entire security snapshot');
    assert.equal(await me(session.tokens.accessToken), 200);
    assert.equal((await authService.refresh(session.refreshToken, {})).user.id, u.id);
    // The very same proof succeeds after the SQL fault is removed: it was not consumed by failure.
    if (route === 'sms') await sms.complete(recovery.secret, input(smsPassword));
    else await accountService.resetPassword(mail, emailPassword, {});
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).authVersion, u.authVersion + 1);
    evidence.push({ case: `PG02-${route}-sql-rollback`, result: 'PASS', entireSecuritySnapshotRestored: true, priorAccessRefreshSurvivesFailure: true, sameProofRetrySucceeded: true });
  });

  await runCase('PG03 unknown/false usable-password provenance becomes true only through successful email reset', async () => {
    for (const value of [null, false]) {
      const u = await user({ hasUsablePassword: value }); const mail = await emailProof(u.id);
      // No login before reset may stamp usable-password provenance in this case.
      const snapshot = await prisma.user.findUniqueOrThrow({ where: { id: u.id } }); assert.equal(snapshot.hasUsablePassword, value);
      await accountService.resetPassword(mail, emailPassword, {});
      const saved = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
      assert.equal(saved.hasUsablePassword, true); assert.equal(saved.authVersion, 1);
    }
    evidence.push({ case: 'PG03-provenance', result: 'PASS', legacyNullAndFalsePreservedUntilReset: true });
  });

  await runCase('PG04 Admin is denied by normal password/Google/phone paths before activation or sessions', async () => {
    for (const active of [false, true]) {
      const u = await user({ role: 'ADMIN', isActive: active, deactivatedAt: active ? null : new Date() });
      const subject = `app10-${crypto.randomUUID()}`;
      await prisma.accountIdentity.create({ data: { userId: u.id, kind: 'GOOGLE', identifier: subject, verifiedAt: new Date() } });
      const uid = crypto.randomUUID();
      const google = jwt.sign({ sub: uid, firebase: { sign_in_provider: 'google.com' } }, 'synthetic-provider-only');
      proofs.set(google, { uid, phoneNumber: null, email: u.email, emailVerified: true, displayName: null, providers: ['google.com'], signInProvider: 'google.com', googleSubject: subject, authTime: Math.floor(Date.now() / 1000) });
      const before = await securitySnapshot(u.id, u.phone);
      await assert.rejects(authService.login({ email: u.email, password: oldPassword }, {}));
      for (const safe of [false, true]) {
        env.ACCOUNT_SAFE_LINKING_ENABLED = safe; env.PHONE_PASSWORD_AUTH_ENABLED = false;
        await assert.rejects(externalLoginService.login(google, {}), error => error instanceof ApiError && [403,409].includes(error.statusCode));
      }
      env.ACCOUNT_SAFE_LINKING_ENABLED = env.PHONE_PASSWORD_AUTH_ENABLED = true;
      const token = phoneProof(u.phone), proof = proofs.get(token)!;
      const signed = jwt.sign({ sub: proof.uid, firebase: { sign_in_provider: 'phone' } }, 'synthetic-provider-only'); proofs.set(signed, proof);
      await assert.rejects(externalLoginService.login(signed, {}));
      assert.ok((await securitySnapshot(u.id, u.phone)) === before, 'Admin identity mutated by a normal user flow');
      assert.equal(await prisma.refreshToken.count({ where: { userId: u.id } }), 0);
    }
    evidence.push({ case: 'PG04-admin-isolation', result: 'PASS', activeAndSelfDeactivatedAdminUnchanged: true });
  });

  await runCase('PG05 A3/A4 purposes cannot consume each other; one SMS event cannot authorize both', async () => {
    const u = await user(), recovery = await smsProof(u);
    const phone = number(), token = phoneProof(phone), setup = await a3.start({ phoneNumber: phone, idToken: token });
    const before = await securitySnapshot(u.id, u.phone), count = await prisma.user.count();
    await assert.rejects(a3.complete(recovery.secret, { password: smsPassword, passwordConfirmation: smsPassword }, {}));
    await assert.rejects(sms.complete(setup.secret, input(smsPassword)));
    await a3.cancel(recovery.secret); await sms.cancel(setup.secret);
    assert.equal((await sms.status(recovery.secret)).verified, true); assert.equal((await a3.status(setup.secret)).pending, true);
    assert.ok((await securitySnapshot(u.id, u.phone)) === before, 'Cross-purpose consumption mutated recovery owner');
    assert.equal(await prisma.user.count(), count);
    await assert.rejects(a3.start({ phoneNumber: u.phone, idToken: recovery.token }));
    // Real SQL unique guard, not only the service purpose filter.
    const event = proofEventHash(proofs.get(recovery.token)!, 'PHONE', u.phone);
    await assert.rejects(prisma.phonePasswordChallenge.create({ data: { phoneNumber: u.phone, secretHash: hashToken(crypto.randomUUID()), proofEventHash: event, purpose: 'INITIAL_PASSWORD', expiresAt: new Date(Date.now() + 60000) } }));
    const blocked = await sms.begin({ phoneNumber: phone });
    await assert.rejects(sms.verify(blocked.secret, { idToken: token }));
    const stored = await prisma.phonePasswordChallenge.findUniqueOrThrow({ where: { secretHash: hashToken(blocked.secret) } });
    assert.equal(stored.verifiedAt, null); assert.equal(stored.proofEventHash, null);
    evidence.push({ case: 'PG05-proof-isolation', result: 'PASS', bothDirections: true, databaseReplayGuard: true, noNewUser: true });
  });

  await runCase('PG06 authenticated notification bulk and single actions never change a foreign account', async () => {
    const owner = await user({ onboardingCompleted: true }), foreign = await user();
    const session = await authService.login({ email: owner.email, password: oldPassword }, {});
    const old = new Date(Date.now() - 60000), cutoff = new Date();
    const create = (userId: string) => prisma.notification.create({ data: { userId, type: 'PROACTIVE_MESSAGE', title: 'Synthetic notice', body: 'Synthetic content', scheduledFor: old, deliveredAt: old } });
    const mine = await create(owner.id), theirs = await create(foreign.id);
    const call = (endpoint: string, body: unknown) => fetch(base + endpoint, { method: 'PATCH', headers: { authorization: `Bearer ${session.tokens.accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await call('/notifications/read-all', { before: cutoff.toISOString(), userId: foreign.id })).status, 422);
    assert.equal((await call(`/notifications/${theirs.id}/read`, {})).status, 404);
    const results = await Promise.all([call('/notifications/read-all', { before: cutoff.toISOString() }), call('/notifications/read-all', { before: cutoff.toISOString() })]);
    assert.ok(results.every(r => r.status === 200));
    assert.ok((await prisma.notification.findUniqueOrThrow({ where: { id: mine.id } })).readAt);
    assert.deepEqual(await prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } }), theirs);
    evidence.push({ case: 'PG06-notification-ownership', result: 'PASS', substitutedUserDenied: true, foreignSingleReadDenied: true, concurrentBulkForeignUnchanged: true });
  });
});
