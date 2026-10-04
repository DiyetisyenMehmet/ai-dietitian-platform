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


function loadNotificationPreferencePresentation() {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '../src/presentation/components/profile/notification-preference-presentation.ts',
    ),
    'utf8',
  );
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, console, require });
  return exports;
}

test('notification preferences A1 exposes only real supported preference cards', () => {
  const { DISPLAY_NOTIFICATION_PREFERENCE_KEYS } = loadNotificationPreferencePresentation();
  assert.deepEqual(
    Array.from(DISPLAY_NOTIFICATION_PREFERENCE_KEYS),
    [
      'mealReminders',
      'waterReminders',
      'activityReminders',
      'sleepReminders',
      'weeklySummary',
      'coachTips',
    ],
  );
  assert.equal(DISPLAY_NOTIFICATION_PREFERENCE_KEYS.includes('bloodTestReminders'), false);
  assert.equal(DISPLAY_NOTIFICATION_PREFERENCE_KEYS.includes('productUpdates'), false);
});

test('notification preference program summaries use persisted data without invented schedules', () => {
  const { notificationProgramSummary } = loadNotificationPreferencePresentation();
  const preferences = {
    mealReminders: true,
    waterReminders: true,
    activityReminders: true,
    sleepReminders: true,
    weeklySummary: true,
    coachTips: true,
    bloodTestReminders: false,
    productUpdates: false,
    waterReminderTime: '13:55',
    activityReminderTime: '18:30',
    sleepReminderTime: '23:00',
    weeklySummaryDay: 6,
    weeklySummaryTime: '10:00',
    timezoneOffsetMinutes: -180,
  };

  assert.equal(
    notificationProgramSummary('mealReminders', preferences),
    'Öğün planındaki saatlere göre',
  );
  assert.equal(notificationProgramSummary('waterReminders', preferences), 'Her gün · 13:55');
  assert.equal(notificationProgramSummary('activityReminders', preferences), 'Her gün · 18:30');
  assert.equal(notificationProgramSummary('sleepReminders', preferences), 'Her gün · 23:00');
  assert.equal(notificationProgramSummary('weeklySummary', preferences), 'Cumartesi · 10:00');
  assert.equal(notificationProgramSummary('coachTips', preferences), 'Özel saat ayarı yok');
});

test('notification preferences A1 keeps switches accessible and does not invent detail routes', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/presentation/components/profile/notifications-view.tsx'),
    'utf8',
  );
  assert.match(source, /role="switch"/);
  assert.match(source, /aria-checked=/);
  assert.match(source, /min-h-11 min-w-14/);
  assert.match(source, /data-notification-preference-card=/);
  assert.match(source, /min-w-0/);
  assert.doesNotMatch(source, /ChevronRight/);
  assert.doesNotMatch(source, /href=/);
  assert.doesNotMatch(source, /type="time"/);
});

test('notification preferences route remains the existing profile route', () => {
  const page = fs.readFileSync(
    path.join(__dirname, '../src/app/profile/notifications/page.tsx'),
    'utf8',
  );
  const center = fs.readFileSync(
    path.join(__dirname, '../src/app/notifications/page.tsx'),
    'utf8',
  );
  assert.match(page, /Bildirim Tercihleri/);
  assert.match(center, /href="\/profile\/notifications"/);
});
