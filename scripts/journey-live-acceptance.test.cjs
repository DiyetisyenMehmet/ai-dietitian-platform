const test = require('node:test');
const assert = require('node:assert/strict');
const { target, planData, run } = require('./journey-live-acceptance.cjs');
const sha = 'a'.repeat(40);
const url = 'postgresql://synthetic:placeholder@ep-sweet-glitter-bafgdm9p.c-8.eu-central-1.aws.neon.tech/diewish_staging_test2?sslmode=require';
test('only the exact Test2 database and current source candidate/public hosts are admitted', () => {
  for (const base of ['https://staging.diewish.com', `https://g1-${sha.slice(0, 12)}---diewish-backend-staging-2qqqfr7wzq-ew.a.run.app`]) target(base, sha, url);
  for (const base of ['https://diewish.com', 'https://admin-staging.diewish.com', 'http://staging.diewish.com', 'https://mascot-candidate---diewish-backend-staging-2qqqfr7wzq-ew.a.run.app', 'https://staging.diewish.com.evil.invalid']) assert.throws(() => target(base, sha, url));
  for (const other of [url.replace('sweet-glitter', 'old-staging'), url.replace('diewish_staging_test2', 'diewish_staging'), url.replace('require', 'disable'), url + '&schema=admin']) assert.throws(() => target('https://staging.diewish.com', sha, other));
  assert.throws(() => target('https://staging.diewish.com', 'HEAD', url));
});
test('wrong target or missing schema aborts before registration or any mutation', async () => {
  let network = 0;
  const request = async () => { network++; throw Error('must not call'); };
  await assert.rejects(run({ base: 'https://diewish.com', sha, databaseUrl: url, db: {}, request }));
  await assert.rejects(run({ base: 'https://staging.diewish.com', sha, databaseUrl: url, db: { $queryRawUnsafe: async () => [{ name: 'old', ready: true }] }, request }));
  assert.equal(network, 0);
});
test('7/14/30 fixtures preserve two separate snack indexes and actual dates without AI', () => {
  for (const days of [7, 14, 30]) {
    const p = planData('synthetic-only', days, '2026-10-30');
    assert.equal(p.userId, 'synthetic-only');
    assert.equal(p.dailyPlans.cycle.length, days);
    assert.equal(p.dailyPlans.calendar.length, days);
    assert.equal(p.dailyPlans.calendar.at(-1).dayNumber, days);
    assert.equal(p.startDate.toISOString(), '2026-10-30T00:00:00.000Z');
    const meals = p.dailyPlans.cycle[0].meals;
    assert.equal(meals[1].name, meals[3].name);
    assert.notEqual(meals[1].time, meals[3].time);
  }
});
test('HTTP failures are rejected, and redirects cannot transport credentials elsewhere', async () => {
  let seen;
  await assert.rejects(run({ base: 'https://staging.diewish.com', sha, databaseUrl: url,
    db: { $queryRawUnsafe: async () => [{ name: 'diewish_staging_test2', ready: true }] },
    request: async (_, init) => { seen = init; return { status: 503 }; } }));
  assert.equal(seen.redirect, 'error');
  assert.ok(seen.signal);
});
test('no generic database fallback, migration, destructive cleanup or Admin operation exists', () => {
  const code = require('node:fs').readFileSync(require.resolve('./journey-live-acceptance.cjs'), 'utf8');
  assert.ok(code.includes('process.env.NEON_TEST2_DATABASE_URL'));
  for (const forbidden of ['process.env.DATABASE_URL', 'deleteMany', 'DROP ', 'TRUNCATE ', 'migrate deploy', '/admin/', 'signAccessToken', '/generate']) assert.ok(!code.includes(forbidden), forbidden);
  assert.ok(code.includes("'/account/deletion/request'"));
});

function fixture(problem) {
  const plans = new Map(); let email, food = 0, water = 0, deleted = false, writes = 0;
  let consented = false, onboarded = false;
  const userId = '11111111-1111-4111-8111-111111111111';
  const response = (data, status = 200) => ({ status, headers: { getSetCookie: () => [] }, json: async () => status < 400 ? { success: true, data } : { success: false, error: { code: 'EXPECTED_NEGATIVE' } } });
  const db = {
    $queryRawUnsafe: async () => [{ name: 'diewish_staging_test2', ready: true }],
    user: { findUnique: async () => ({ id: userId, email, role: problem === 'foreign-role' ? 'ADMIN' : 'USER', createdAt: new Date() }) },
    nutritionPlan: { create: async ({ data }) => { assert.equal(data.userId, userId); assert.equal(onboarded, true); writes++; const id = require('node:crypto').randomUUID(); plans.set(id, { data, rows: new Map() }); return { id }; } },
    mealLog: { count: async ({ where }) => { assert.equal(where.userId, userId); return food; } },
    waterLog: { count: async ({ where }) => { assert.equal(where.userId, userId); return water; } },
    mealCheckIn: { findMany: async ({ where }) => { assert.equal(where.userId, userId); return problem === 'missing-persistence' ? [] : [...plans.get(where.planId).rows.values()]; } },
  };
  const request = async (url, init) => {
    assert.equal(init.redirect, 'error');
    const address = new URL(url); const path = address.pathname.slice(4);
    if (path === '/auth/register') { email = JSON.parse(init.body).email; return response({ tokens: { accessToken: 'synthetic' } }, 201); }
    if (path === '/auth/me') return response({ user: { id: userId, email, role: 'USER', onboardingCompleted: onboarded } });
    if (path === '/legal/documents') return response({ documents: [{ type: 'KVKK_EXPLICIT_CONSENT', consentable: true }] });
    if (path === '/legal/consents') { consented = true; return response({}); }
    if (path === '/onboarding/') {
      assert.equal(init.method, 'POST');
      assert.equal(consented, true);
      const profile = JSON.parse(init.body);
      assert.equal(profile.fullName, 'Synthetic G1 Journey');
      assert.deepEqual(profile.healthConditions, []);
      assert.deepEqual(profile.allergies, []);
      if (problem === 'onboarding-rejected') return response({}, 403);
      if (problem === 'onboarding-unconfirmed') return response({ onboardingCompleted: false });
      onboarded = problem !== 'onboarding-false-success';
      return response({ onboardingCompleted: true });
    }
    if (path.startsWith('/tracking/') && !onboarded) return response({}, 403);
    if (path.startsWith('/tracking/meal-check-ins')) {
      const parts = path.split('/'); const id = address.searchParams.get('planId') || parts[3]; const plan = plans.get(id);
      if (init.method === 'GET') {
        const rows = Array.from({ length: 4 }, (_, i) => plan.rows.get(i) || { mealIndex: i, state: 'PENDING', revision: 0 });
        return response({ day: { contractVersion: 2, total: 4, checkIns: rows, completed: rows.filter(x => x.state === 'EATEN').length, skipped: rows.filter(x => x.state === 'SKIPPED').length } });
      }
      const index = Number(parts[5]); const revision = Number(init.headers['If-Match'].replaceAll('"', ''));
      const state = init.method === 'DELETE' ? 'PENDING' : parts[6] === 'skip' ? 'SKIPPED' : 'EATEN';
      const old = plan.rows.get(index);
      if (old?.revision === revision + 1 && old.state === state) return response({ checkIn: old });
      if ((old?.revision || 0) !== revision) return response({}, 409);
      const row = { id: old?.id || require('node:crypto').randomUUID(), mealIndex: index, revision: revision + 1, state };
      plan.rows.set(index, row);
      if (problem === 'skip-adds-calories' && state === 'SKIPPED') food++;
      return response({ checkIn: { ...row, revision: problem === 'wrong-revision' ? 99 : row.revision } });
    }
    if (path === '/tracking/meals') {
      if (init.method === 'POST') { food++; if (problem === 'food-auto-confirms') [...plans.values()].at(-1).rows.set(0, { mealIndex: 0, state: 'EATEN', revision: 1 }); return response({}, 201); }
      return response({ logs: Array.from({ length: food }) });
    }
    if (path === '/tracking/water') { if (init.method === 'POST') { water++; return response({}, 201); } return response({ logs: Array.from({ length: water }) }); }
    if (path === '/auth/refresh-token') return response({ tokens: { accessToken: 'synthetic' } }, deleted ? 401 : 200);
    if (path === '/auth/logout') return response({});
    if (path === '/auth/login') return response({ tokens: { accessToken: 'synthetic' } });
    if (path === '/account/deletion/request') { deleted = true; return response({ graceDays: 30, deletionRequestedAt: '2026-10-30T00:00:00Z', purgeEligibleAt: '2026-11-29T00:00:00Z' }); }
    throw Error('Unexpected route');
  };
  return { db, request, inspect: () => ({ writes, deleted }) };
}
test('the complete acceptance runner verifies real-contract ordering with synthetic adapters', async () => {
  const f = fixture();
  await run({ base: 'https://staging.diewish.com', sha, databaseUrl: url, ...f });
  assert.deepEqual(f.inspect(), { writes: 3, deleted: true });
});
for (const problem of ['foreign-role', 'missing-persistence', 'wrong-revision', 'skip-adds-calories', 'food-auto-confirms', 'onboarding-rejected', 'onboarding-unconfirmed', 'onboarding-false-success']) {
  test(`the runner rejects ${problem} rather than reporting successful live acceptance`, async () => {
    const f = fixture(problem);
    await assert.rejects(run({ base: 'https://staging.diewish.com', sha, databaseUrl: url, ...f }));
    if (problem === 'foreign-role') assert.deepEqual(f.inspect(), { writes: 0, deleted: false });
    else {
      assert.equal(f.inspect().deleted, true);
      if (problem.startsWith('onboarding-')) assert.equal(f.inspect().writes, 0);
    }
  });
}
