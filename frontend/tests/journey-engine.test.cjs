const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/application/health/journey-engine.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exportsObject });
const { buildJourney, deriveGoalDirection, journeyTasks } = exportsObject;
const base = () => ({ workScheduleType: "REGULAR", localHour: 10, startWeightKg: 80, currentWeightKg: 79, targetWeightKg: 70,
  meals: { breakfast: 0, lunch: 0, dinner: 0, snack: 0 }, waterMl: 1000, waterGoalMl: 2000,
  activityMinutes: null, weight: { due: false, recordedToday: false } });
const run = patch => buildJourney({ ...base(), ...patch });
const step = (r, kind) => r.steps.find(s => s.kind === kind);
test('new user: unknown is not zero or invented completion', () => {
  const r = run({ meals: {}, waterMl: null, waterGoalMl: null, weight: null, startWeightKg: null });
  assert.equal(r.steps.length, 0); assert.equal(r.nextBestAction, null);
  assert.equal(r.status, 'insufficient-data'); assert.equal(r.direction, null);
});
for (const [target, direction, phrase] of [[70,'lose','Kilo verme'],[90,'gain','Kilo alma'],[80,'maintain','Kilonu koruma']]) {
  test(`target ${target} derives ${direction} and changes the reason`, () => {
    const r = run({ targetWeightKg: target });
    assert.equal(r.direction, direction); assert.ok(r.nextBestAction.reason.includes(phrase));
    assert.equal(deriveGoalDirection(80,target), direction);
  });
}
test('breakfast completed selects lunch', () => {
  const r = run({ meals: { breakfast: 1, lunch: 0, dinner: 0 } });
  assert.equal(step(r,'breakfast').state,'completed'); assert.equal(r.nextBestAction.kind,'lunch');
});
test('passed meal window is skipped, next window remains actionable', () => {
  const r = run({ localHour: 17 }); assert.equal(step(r,'breakfast').state,'skipped');
  assert.equal(step(r,'lunch').state,'skipped'); assert.equal(r.nextBestAction.kind,'dinner');
});
test('shift work does not assume standard missed windows', () => {
  assert.equal(step(run({localHour:23,workScheduleType:'NIGHT_SHIFT'}),'breakfast').state,'recommended');
});
test('water target completed and progress capped', () => {
  const s = step(run({waterMl:2500}),'water'); assert.equal(s.state,'completed'); assert.equal(s.progress,1);
});
test('partial water is pending and cannot recommend a non-tappable card', () => {
  const r = run({meals:{breakfast:1,lunch:1,dinner:1}});
  assert.equal(step(r,'water').progress,0.5); assert.equal(step(r,'water').state,'pending');
  assert.equal(r.nextBestAction,null); assert.equal(r.status,'no-actionable-step');
});
test('not due has no weight request', () => assert.equal(step(run({}),'weight'),undefined));
test('due check-in is first', () => {
  const r = run({weight:{due:true,recordedToday:false}}); assert.equal(r.nextBestAction.kind,'weight');
});
test('today recorded wins even if stale due flag is true', () => {
  assert.equal(step(run({weight:{due:true,recordedToday:true}}),'weight').state,'completed');
});
test('unknown check-in never requests daily weighing', () => assert.equal(step(run({weight:null}),'weight'),undefined));
test('missing activity omitted; sleep explicitly unknown', () => {
  const r = run({}); assert.equal(step(r,'activity'),undefined); assert.equal(r.sufficiency.sleep,'UNKNOWN');
});
test('real activity acknowledges recording without fabricated target', () => {
  assert.equal(step(run({activityMinutes:20}),'activity').state,'completed');
});
test('known zero activity means no recorded minutes, not no movement', () => {
  const r = run({activityMinutes:0}); assert.equal(r.sufficiency.activity,'KNOWN_ZERO'); assert.equal(step(r,'activity'),undefined);
});
test('all necessary tasks complete returns null; snack/coach not required', () => {
  const r = run({meals:{breakfast:1,lunch:1,dinner:1},waterMl:2000});
  assert.equal(r.nextBestAction,null); assert.equal(r.status,'all-done');
});
test('missing water differs from known zero; invalid goal never completes', () => {
  assert.equal(run({waterMl:null}).sufficiency.water,'UNKNOWN');
  assert.equal(run({waterMl:0}).sufficiency.water,'KNOWN_ZERO');
  for (const goal of [0,-1,NaN,Infinity,null]) assert.equal(step(run({waterGoalMl:goal}),'water'),undefined);
});
test('unknown meal after window is not skipped', () => assert.equal(step(run({localHour:23,meals:{}}),'breakfast'),undefined));
test('invalid values are unknown', () => {
  for (const value of [-1,NaN,Infinity,null]) {
    assert.equal(run({waterMl:value}).sufficiency.water,'UNKNOWN'); assert.equal(deriveGoalDirection(value,70),null);
  }
});
test('direction stays stable after current weight crosses target', () => assert.equal(run({currentWeightKg:65}).direction,'lose'));
test('single tappable recommendation and task parity across 1152 combinations', () => {
  for (let hour=0;hour<24;hour++) for(const target of [70,80,90]) for(let mask=0;mask<16;mask++) {
    const r=run({localHour:hour,targetWeightKg:target,weight:{due:!!(mask&8),recordedToday:false},
      meals:{breakfast:mask&1,lunch:mask&2,dinner:mask&4}});
    const recommended=r.steps.filter(s=>s.state==='recommended');
    assert.equal(recommended.length,r.nextBestAction?1:0);
    if(recommended.length) { assert.ok(recommended[0].href); assert.equal(recommended[0].kind,r.nextBestAction.kind); }
    for(const task of journeyTasks(r)) assert.equal(task.done,step(r,task.kind).state==='completed');
  }
});
test('elapsed recording windows do not falsely report all-done', () => {
  const r=run({localHour:23,waterMl:2000});assert.equal(r.nextBestAction,null);assert.equal(r.status,'no-actionable-step');
});

for (const schedule of [null, undefined, 'VARIABLE_SHIFT', 'NIGHT_SHIFT']) {
  test(`schedule ${schedule} never assumes elapsed windows`, () => {
    const r = run({localHour:23,workScheduleType:schedule});
    assert.equal(r.steps.some(s=>s.state==='skipped'),false);
    assert.equal(r.nextBestAction.kind,'breakfast');
  });
}
test('explicit regular schedule applies all three cutoffs at 23:00',()=>{
  const r=run({localHour:23,workScheduleType:'REGULAR'});
  for(const kind of ['breakfast','lunch','dinner']) assert.equal(step(r,kind).state,'skipped');
});
test('legacy task projection retains action copy without changing decisions',()=>{
  const tasks=journeyTasks(run({weight:{due:true,recordedToday:false}}));
  for(const [kind,label] of Object.entries({breakfast:'Kahvaltını ekle',lunch:'Öğle yemeğini tamamla',dinner:'Akşam yemeğini ekle',water:'Su hedefine ulaş',weight:'Kilonu kaydet'})) {
    assert.equal(tasks.find(t=>t.kind===kind).label,label);
  }
  assert.equal(journeyTasks(run({weight:{due:false,recordedToday:true}})).find(t=>t.kind==='weight').label,'Kilonu kaydettin');
});
