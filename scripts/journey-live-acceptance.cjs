/* Future release-only synthetic acceptance. No schema, AI, Admin or real-account access. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const APP = 'https://staging.diewish.com';
function target(base, sha, databaseUrl) {
  assert.match(sha || '', /^[a-f0-9]{40}$/);
  assert.ok([APP, `https://g1-${sha.slice(0, 12)}---diewish-backend-staging-2qqqfr7wzq-ew.a.run.app`].includes(base));
  const url = new URL(databaseUrl);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.match(url.hostname, /^ep-sweet-glitter-bafgdm9p(?:-pooler)?(?:\.[a-z0-9-]+)*\.aws\.neon\.tech$/);
  assert.equal(url.pathname, '/diewish_staging_test2');
  assert.ok(!url.port || url.port === '5432');
  assert.ok(['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode')));
  assert.ok(!url.searchParams.has('schema') || url.searchParams.get('schema') === 'public');
  for (const key of url.searchParams.keys())
    assert.ok(['sslmode', 'schema', 'channel_binding', 'pgbouncer', 'connection_limit', 'connect_timeout', 'pool_timeout'].includes(key));
}
function planData(userId, days, date) {
  const menu = [['Kahvaltı', '08:00'], ['Ara öğün', '10:00'], ['Öğle', '13:00'], ['Ara öğün', '16:00']]
    .map(([name, time]) => ({ name, time, foods: [{ name: 'Synthetic food', portion: '1 portion' }],
      calories: 100, proteinGrams: 10, carbsGrams: 10, fatGrams: 2, explanation: 'Synthetic' }));
  return { userId, duration: { 7: 'SEVEN_DAY', 14: 'FOURTEEN_DAY', 30: 'THIRTY_DAY' }[days],
    startDate: new Date(`${date}T00:00:00Z`), status: 'COMPLETED', isActive: true, version: 1,
    bmr: 1500, tdee: 1800, dailyCalories: 1800, proteinGrams: 80, carbsGrams: 200, fatGrams: 60,
    waterMl: 2000, mealsPerDay: menu.length, mealTiming: {}, explanations: {}, recommendations: {},
    dailyPlans: { durationDays: days, cycleLengthDays: days,
      cycle: Array.from({ length: days }, () => ({ meals: menu })),
      calendar: Array.from({ length: days }, (_, i) => ({ dayNumber: i + 1, cycleIndex: i, dateOffsetDays: 0 })) } };
}
async function run({ base, sha, databaseUrl, db, request = fetch }) {
  target(base, sha, databaseUrl);
  const proof = await db.$queryRawUnsafe("SELECT current_database() AS name, to_regclass('public.meal_check_ins') IS NOT NULL AS ready");
  assert.deepEqual(proof, [{ name: 'diewish_staging_test2', ready: true }]);
  const email = `g1.journey.${crypto.randomBytes(12).toString('hex')}@example.invalid`;
  const password = `G1Journey1!${crypto.randomBytes(16).toString('hex')}`;
  let token, owned = false;
  const cookies = new Map();
  async function call(path, method = 'GET', body, revision, expected = 200, auth = true) {
    assert.ok(/^\/(auth|legal|onboarding|tracking|account)\//.test(path));
    const headers = { Origin: APP, 'Content-Type': 'application/json' };
    if (auth && token) headers.Authorization = `Bearer ${token}`;
    if (cookies.size) headers.Cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    if (revision !== undefined) headers['If-Match'] = `"${revision}"`;
    const response = await request(`${base}/api${path}`, { method, headers, redirect: 'error',
      signal: AbortSignal.timeout(15000), body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal(response.status, expected, `G1 API ${method}: unexpected HTTP status`);
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(';')[0]; const at = pair.indexOf('=');
      assert.ok(at > 0);
      if (/max-age=0/i.test(value)) cookies.delete(pair.slice(0, at));
      else cookies.set(pair.slice(0, at), pair.slice(at + 1));
    }
    const result = await response.json();
    if (expected >= 400) { assert.equal(result.success, false); return result; }
    assert.equal(result.success, true);
    return result.data;
  }
  const registered = await call('/auth/register', 'POST', { email, password, fullName: 'Synthetic G1 Journey' }, undefined, 201, false);
  token = registered.tokens.accessToken;
  const me = (await call('/auth/me')).user;
  assert.equal(me.email, email);
  assert.equal(me.role, 'USER');
  const user = await db.user.findUnique({ where: { id: me.id }, select: { id: true, email: true, role: true, createdAt: true } });
  assert.equal(user?.email, email);
  assert.equal(user?.role, 'USER');
  assert.ok(Math.abs(Date.now() - new Date(user.createdAt).getTime()) < 120000);
  owned = true;
  try {
    for (const doc of (await call('/legal/documents')).documents.filter(d => d.consentable))
      await call('/legal/consents', 'POST', { type: doc.type });
    // Use the normal consent-protected API; never bypass the first-run gate.
    const onboarding = await call('/onboarding/', 'POST', {
      fullName: 'Synthetic G1 Journey', dateOfBirth: '1990-01-01',
      gender: 'PREFER_NOT_TO_SAY', heightCm: 170, currentWeightKg: 70, targetWeightKg: 70,
      activityLevel: 'SEDENTARY', healthConditions: [], allergies: [],
      dietaryPreference: 'OMNIVORE', dailyWaterGoalMl: 2000,
    });
    assert.equal(onboarding.onboardingCompleted, true);
    const onboarded = (await call('/auth/me')).user;
    assert.equal(onboarded.id, user.id);
    assert.equal(onboarded.role, 'USER');
    assert.equal(onboarded.onboardingCompleted, true);
    const date = new Date().toISOString().slice(0, 10);
    for (const days of [7, 14, 30]) {
      const plan = await db.nutritionPlan.create({ data: planData(user.id, days, date) });
      const query = `?planId=${plan.id}&dayNumber=1&localDate=${date}`;
      const path = index => `/tracking/meal-check-ins/${plan.id}/1/${index}?localDate=${date}`;
      const read = async () => (await call(`/tracking/meal-check-ins${query}`)).day;
      let day = await read();
      assert.equal(day.contractVersion, 2);
      assert.equal(day.total, 4);
      assert.equal(day.completed, 0);
      const beforeFoods = await db.mealLog.count({ where: { userId: user.id } });
      for (const index of [1, 3]) {
        const eaten = (await call(path(index), 'PUT', {}, 0)).checkIn;
        assert.equal(eaten.state, 'EATEN');
        assert.equal(eaten.revision, 1);
        assert.equal((await call(path(index), 'PUT', {}, 0)).checkIn.id, eaten.id);
        assert.equal((await read()).checkIns.find(x => x.mealIndex === index).state, 'EATEN');
        const undone = (await call(path(index), 'DELETE', undefined, 1)).checkIn;
        assert.equal(undone.state, 'PENDING');
        assert.equal(undone.revision, 2);
        await call(path(index), 'PUT', {}, 0, 409);
        const skipped = (await call(path(index).replace('?', '/skip?'), 'PUT', {}, 2)).checkIn;
        assert.equal(skipped.state, 'SKIPPED');
        assert.equal((await read()).checkIns.find(x => x.mealIndex === index).state, 'SKIPPED');
        await call(path(index), 'DELETE', undefined, 3);
      }
      day = await read();
      assert.equal(day.completed, 0);
      assert.equal(day.skipped, 0);
      assert.equal(await db.mealLog.count({ where: { userId: user.id } }), beforeFoods);
      const persisted = await db.mealCheckIn.findMany({ where: { userId: user.id, planId: plan.id } });
      assert.equal(persisted.length, 2);
      assert.equal(new Set(persisted.map(x => x.mealIndex)).size, 2);
      assert.ok(persisted.every(x => x.state === 'PENDING' && x.revision === 4));
      // Existing explicit food-entry contract: food never decides a plan meal.
      await call('/tracking/meals', 'POST', { mealType: 'SNACK', name: 'Synthetic different food', calories: 100 }, undefined, 201);
      assert.equal((await read()).completed, 0);
      assert.equal(await db.mealLog.count({ where: { userId: user.id } }), beforeFoods + 1);
    }
    const waterBefore = await db.waterLog.count({ where: { userId: user.id } });
    await call('/tracking/water', 'POST', { amountMl: 250 }, undefined, 201);
    assert.equal(await db.waterLog.count({ where: { userId: user.id } }), waterBefore + 1);
    token = (await call('/auth/refresh-token', 'POST', {}, undefined, 200, false)).tokens.accessToken;
    assert.equal((await call('/auth/me')).user.id, user.id);
    await call('/auth/logout', 'POST', {});
    token = (await call('/auth/login', 'POST', { email, password }, undefined, 200, false)).tokens.accessToken;
    assert.equal((await call('/tracking/meals')).logs.length, 3);
    assert.equal((await call('/tracking/water')).logs.length, 1);
  } finally {
    if (owned) {
      const result = await call('/account/deletion/request', 'POST', { password });
      assert.ok(Number.isInteger(result.graceDays) && result.graceDays >= 0);
      const requested = Date.parse(result.deletionRequestedAt);
      const eligible = Date.parse(result.purgeEligibleAt);
      assert.ok(Number.isFinite(requested) && Number.isFinite(eligible));
      assert.equal(eligible - requested, result.graceDays * 86400000);
      await call('/auth/refresh-token', 'POST', {}, undefined, 401, false);
    }
  }
}
module.exports = { target, planData, run };
if (require.main === module) {
  (async () => {
    const databaseUrl = process.env.NEON_TEST2_DATABASE_URL;
    target(process.argv[2], process.env.GITHUB_SHA, databaseUrl);
    const { PrismaClient } = require('../backend/node_modules/@prisma/client');
    const db = new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
    try { await run({ base: process.argv[2], sha: process.env.GITHUB_SHA, databaseUrl, db }); }
    finally { await db.$disconnect(); }
    console.log('PASS: G1 synthetic API persistence');
  })().catch(() => { console.error('NO_GO: G1 synthetic acceptance failed; private details withheld'); process.exitCode = 1; });
}
