const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, context = {}, stubs = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, Date, ...context, require: (id) => {
    if (id.includes('meal-reminder-plan')) return load('domain/account/meal-reminder-plan.ts');
    if (id.includes('nutrition-plan-client')) return { nutritionPlanClient: stubs.plans };
    if (id.includes('payments-client')) return { paymentsClient: stubs.payments };
    throw new Error('Unexpected dependency: ' + id);
  }});
  return exports;
}
const plan = () => ({ id: 'plan-a', isActive: true, status: 'COMPLETED', duration: 'SEVEN_DAY', updatedAt: '2026-10-07T12:00:00Z', createdAt: '2026-10-07T00:00:00Z', startDate: '2026-10-07', dailyPlans: { durationDays: 2, cycle: [{ meals: [{ name: 'Akşam', time: '20:00' }, { name: 'Gece', time: '02:15' }] }], calendar: [{ dayNumber: 1, cycleIndex: 0, dateOffsetDays: 0 }, { dayNumber: 2, cycleIndex: 0, dateOffsetDays: 2 }] } });
test('meal entries retain plan identity, calendar postponements and midnight wrap', () => {
  const { buildMealReminderEntries } = load('domain/account/meal-reminder-plan.ts');
  const value = plan(), rows = buildMealReminderEntries(value);
  assert.equal(rows.length, 4);
  assert.deepEqual(Array.from(rows, x => x.id), ['plan-a:1:0', 'plan-a:1:1', 'plan-a:2:0', 'plan-a:2:1']);
  assert.deepEqual(Array.from(rows, x => [new Date(x.at).getDate(), new Date(x.at).getHours(), new Date(x.at).getMinutes()]), [[7,20,0],[8,2,15],[10,20,0],[11,2,15]]);
  assert.equal(value.dailyPlans.calendar[1].dateOffsetDays, 2);
});
test('only an active completed supported plan is selected and expired plans cannot enable alarms', () => {
  const { activeMealReminderPlan, hasFutureMealReminders } = load('domain/account/meal-reminder-plan.ts');
  const original = plan();
  const rows = [original, { ...original, id: 'history', isActive: false, updatedAt: '2027-01-01' }, { ...original, id: 'pending', status: 'PROCESSING', updatedAt: '2027-01-02' }, { ...original, id: 'unsupported', duration: 'SIXTY_DAY', updatedAt: '2027-01-03' }, { ...original, id: 'deleted', deletedAt: '2027-01-01', updatedAt: '2027-01-04' }];
  assert.equal(activeMealReminderPlan(rows).id, 'plan-a');
  assert.equal(hasFutureMealReminders(original, new Date(2026,9,8,1,0).getTime()), true);
  assert.equal(hasFutureMealReminders(original, new Date(2026,9,12,0,0).getTime()), false);
});
test('invalid meal times are excluded without rewriting the nutrition plan', () => {
  const { buildMealReminderEntries } = load('domain/account/meal-reminder-plan.ts');
  const value = plan(); value.dailyPlans.cycle[0].meals.push({ name: 'Invalid', time: '25:00' });
  assert.equal(buildMealReminderEntries(value).length, 4);
  assert.equal(value.dailyPlans.cycle[0].meals.length, 3);
});
function native(permission = 'granted', legacy = false) {
  const log = { schedules: [], nutrition: 0, all: 0, wellness: 0 };
  const api = load('infrastructure/notifications/native-meals.ts', { window: { DiewishReminders: { isAvailable: () => true, permissionStatus: () => permission, replaceSchedule: json => log.schedules.push(JSON.parse(json)), ...(legacy ? {} : { cancelNutrition: () => log.nutrition++ }), cancelAll: () => log.all++, cancelWellness: () => log.wellness++ } } });
  return { api, log };
}
test('meal off, free, completed and denied cancel only nutrition, preserving wellness', () => {
  for (const override of [{ enabled: false }, { paid: false }, { completed: true }, {}]) {
    const { api, log } = native(Object.keys(override).length ? 'granted' : 'denied');
    api.syncMealReminderEntries({ enabled: true, paid: true, completed: false, entries: [{ id: 'meal', at: 5000 }], ...override }, 0);
    assert.equal(log.nutrition, 1); assert.equal(log.all, 0); assert.equal(log.wellness, 0); assert.equal(log.schedules.length, 0);
  }
});
test('the meal device limit is enforced in its adapter, not the common plan', () => {
  const { buildMealReminderEntries } = load('domain/account/meal-reminder-plan.ts');
  const value = plan(); value.dailyPlans.durationDays = 30;
  value.dailyPlans.calendar = Array.from({ length: 30 }, (_, index) => ({ dayNumber: index + 1, cycleIndex: 0 }));
  value.dailyPlans.cycle[0].meals = Array.from({ length: 10 }, (_, index) => ({ name: 'Meal', time: `${String(index + 8).padStart(2,'0')}:00` }));
  const entries = buildMealReminderEntries(value); assert.equal(entries.length, 300);
  const { api, log } = native(); api.syncMealReminderEntries({ enabled: true, paid: true, completed: false, entries: [...entries].reverse() }, 0);
  assert.equal(log.schedules[0].length, 240);
  assert.ok(log.schedules[0].every((row, i, all) => i === 0 || row.at >= all[i-1].at));
});
test('a partial old device bridge cannot cancel unrelated queues or crash preferences', () => {
  const { api, log } = native('granted', true); api.cancelMealReminderSchedule(); assert.equal(log.all, 0);
  const missing = load('infrastructure/notifications/native-meals.ts', { window: {} });
  assert.doesNotThrow(() => missing.syncMealReminderEntries({ enabled: true, paid: true, completed: false, entries: [] }));
});
test('meal context reads the existing plan and subscription endpoints and keeps owner plan selection', async () => {
  const api = load('infrastructure/notifications/native-meals.ts', {}, { plans: { list: async () => ({ plans: [plan()] }) }, payments: { getSubscription: async () => ({ tier: 'PREMIUM_PLUS' }) } });
  const context = await api.loadMealReminderContext(); assert.equal(context.paid, true); assert.equal(context.plan.id, 'plan-a');
  assert.match(api.mealReminderGate({ plan: plan(), paid: false }), /Premium/);
  assert.match(api.mealReminderGate({ plan: null, paid: true }), /aktif/);
});
test('unavailable plan or entitlement data cannot yield a fabricated reminder context', async () => {
  const api = load('infrastructure/notifications/native-meals.ts', {}, { plans: { list: async () => ({ plans: [plan()] }) }, payments: { getSubscription: async () => { throw new Error('offline'); } } });
  await assert.rejects(api.loadMealReminderContext(), /offline/);
});
