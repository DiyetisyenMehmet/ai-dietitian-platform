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
  vm.runInNewContext(code, { exports, console, require: (id) => {
    if (!id.includes('water-reminder-plan')) return require(id);
    const waterSource = fs.readFileSync(path.join(__dirname, '../src/domain/account/water-reminder-plan.ts'), 'utf8');
    const waterExports = {};
    vm.runInNewContext(ts.transpileModule(waterSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: waterExports, require });
    return waterExports;
  } });
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


test('notification type routing is explicit and unknown types fall back safely', () => {
  const { resolveNotificationTypeTarget } = load();
  assert.equal(resolveNotificationTypeTarget('PROACTIVE_MESSAGE'), '/ai');
  assert.equal(resolveNotificationTypeTarget('WEEKLY_REVIEW'), '/insights');
  assert.equal(resolveNotificationTypeTarget('MONTHLY_REVIEW'), '/insights');
  assert.equal(resolveNotificationTypeTarget('RISK_ALERT'), '/insights');
  assert.equal(resolveNotificationTypeTarget('GOAL_REMINDER'), '/goals');
  assert.equal(resolveNotificationTypeTarget('WATER_REMINDER'), '/dashboard');
  assert.equal(resolveNotificationTypeTarget('UNKNOWN'), '/dashboard');
  assert.equal(resolveNotificationTypeTarget('https://evil.invalid'), '/dashboard');
});

test('logout cleanup awaits asynchronous device cleanup', async () => {
  const { releaseNotificationDevice } = load();
  const events = [];
  await releaseNotificationDevice(
    '',
    async () => undefined,
    async () => {
      await Promise.resolve();
      events.push('async-cleanup');
    },
  );
  assert.deepEqual(events, ['async-cleanup']);
});


test('notification center merges remote/native duplicates and keeps safe targets', () => {
  const { mergeNotificationCenterItems } = load();
  const items = mergeNotificationCenterItems(
    [{
      id: 'server-1',
      type: 'PROACTIVE_MESSAGE',
      title: 'Koç',
      body: 'Yeni mesaj',
      scheduledFor: '2026-10-04T10:00:00.000Z',
      deliveredAt: '2026-10-04T10:00:01.000Z',
      readAt: null,
    }],
    [{
      id: 'remote:server-1',
      serverId: 'server-1',
      title: 'Koç',
      body: 'Yeni mesaj',
      target: '/ai',
      occurredAt: Date.parse('2026-10-04T10:00:01.000Z'),
      readAt: Date.parse('2026-10-04T10:02:00.000Z'),
    }, {
      id: 'wellness:water-1',
      title: 'Su zamanı',
      body: 'Hatırlatma',
      target: 'https://evil.invalid',
      occurredAt: Date.parse('2026-10-04T09:00:00.000Z'),
      readAt: null,
    }],
  );

  assert.equal(items.length, 2);
  assert.equal(items[0].serverId, 'server-1');
  assert.equal(items[0].nativeId, 'remote:server-1');
  assert.equal(items[0].target, '/ai');
  assert.equal(items[0].read, true);
  assert.equal(items[1].target, '/dashboard');
  assert.equal(items[1].read, false);
});

test('dashboard bell opens the center and the center reuses existing preferences route', () => {
  const dashboard = fs.readFileSync(
    path.join(__dirname, '../src/presentation/components/dashboard/dashboard-home-header.tsx'),
    'utf8',
  );
  const centerPage = fs.readFileSync(
    path.join(__dirname, '../src/app/notifications/page.tsx'),
    'utf8',
  );
  assert.match(dashboard, /href="\/notifications"/);
  assert.doesNotMatch(dashboard, /href="\/profile\/notifications"/);
  assert.match(centerPage, /href="\/profile\/notifications"/);
  assert.match(centerPage, /Bildirim Merkezi/);
});

function loadWaterPlan() {
  const source = fs.readFileSync(path.join(__dirname, '../src/domain/account/water-reminder-plan.ts'), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, require });
  return exports;
}
const wellnessPreferences = () => ({ waterReminders: true, waterReminderTime: '10:00', activityReminders: true, activityReminderTime: '18:00', sleepReminders: true, sleepReminderTime: '22:30' });
const eightTimePlan = (mode = 'same') => ({ version: 1, mode, dailyTimes: ['08:00','09:00','11:00','14:00','16:00','18:00','20:00','21:00'], days: Array.from({ length: 7 }, (_, day) => ({ day, enabled: true, times: ['08:00','09:00','11:00','14:00','16:00','18:00','20:00','21:00'] })) });

test('legacy wellness preferences keep exactly 30 days for all three types', () => {
  const { buildAndroidWellnessReminderSchedule } = load();
  const rows = buildAndroidWellnessReminderSchedule(wellnessPreferences(), new Date(2026,9,12,0,0));
  assert.equal(rows.length, 90);
  for (const type of ['water','activity','sleep']) assert.equal(rows.filter((row) => row.type === type).length, 30);
});

test('maximum water plan never exceeds Android cap and preserves other categories', () => {
  const { buildAndroidWellnessReminderSchedule } = load();
  const prefs = { ...wellnessPreferences(), waterReminderSchedule: eightTimePlan() };
  const now = new Date(2026,9,12,0,0);
  const rows = buildAndroidWellnessReminderSchedule(prefs, now);
  assert.equal(rows.length, 116);
  assert.ok(rows.length < 128);
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
  assert.equal(rows.filter((row) => row.type === 'water').length, 56);
  const before = buildAndroidWellnessReminderSchedule(wellnessPreferences(), now).filter((row) => row.type !== 'water').map((row) => row.id).sort();
  const after = rows.filter((row) => row.type !== 'water').map((row) => row.id).sort();
  assert.equal(JSON.stringify(after), JSON.stringify(before));
  assert.ok(rows.every((row, index) => index === 0 || row.at >= rows[index-1].at));
});

test('custom weekday schedule respects closed days, empty hours and global off', () => {
  const { buildAndroidWellnessReminderSchedule } = load();
  const plan = eightTimePlan('custom');
  plan.days[0].enabled = false;
  plan.days[6].times = [];
  const prefs = { ...wellnessPreferences(), waterReminderSchedule: plan };
  const rows = buildAndroidWellnessReminderSchedule(prefs, new Date(2026,9,12,0,0));
  const water = rows.filter((row) => row.type === 'water');
  assert.equal(water.length, 40);
  assert.ok(water.every((row) => ![0,6].includes(new Date(row.at).getDay())));
  assert.equal(buildAndroidWellnessReminderSchedule({ ...prefs, waterReminders: false }, new Date(2026,9,12,0,0)).filter((row) => row.type === 'water').length, 0);
});

test('empty and invalid multi-time plans do not resurrect legacy water time', () => {
  const { buildAndroidWellnessReminderSchedule } = load();
  const empty = { ...eightTimePlan(), dailyTimes: [] };
  const invalid = { ...eightTimePlan(), dailyTimes: ['09:00','09:00'] };
  for (const waterReminderSchedule of [empty,invalid]) {
    const rows = buildAndroidWellnessReminderSchedule({ ...wellnessPreferences(), waterReminderSchedule }, new Date(2026,9,12,0,0));
    assert.equal(rows.filter((row) => row.type === 'water').length, 0);
    assert.equal(rows.length, 60);
  }
});

test('water copy preserves unselected and closed days unless explicitly opened', () => {
  const { copyWaterDay } = loadWaterPlan();
  const original = eightTimePlan('custom');
  original.days[1].times = ['12:15']; original.days[0].enabled = false;
  const result = copyWaterDay(original, 1, [2,6,0]);
  assert.equal(result.days[2].times[0], '12:15');
  assert.equal(result.days[6].times[0], '12:15');
  assert.equal(result.days[0].enabled, false);
  assert.equal(result.days[0].times.length, 8);
  assert.equal(result.days[3].times.length, 8);
  assert.equal(original.days[2].times.length, 8);
  const opened = copyWaterDay(original, 1, [0], true);
  assert.equal(opened.days[0].enabled, true);
  assert.equal(opened.days[0].times[0], '12:15');
});

test('water schedules retain local hours across daylight-saving transitions', () => {
  const { buildAndroidWellnessReminderSchedule } = load();
  const rows = buildAndroidWellnessReminderSchedule({ ...wellnessPreferences(), waterReminderSchedule: eightTimePlan() }, new Date(2026,9,31,0,0));
  const water = rows.filter((row) => row.type === 'water');
  assert.equal(water.length, 56);
  assert.ok(water.every((row) => [8,9,11,14,16,18,20,21].includes(new Date(row.at).getHours())));
  assert.ok(rows.every((row) => row.at > new Date(2026,9,31,0,0).getTime()));
});
