'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('./contract.cjs');
const { stage } = require('./android-stage.cjs');
const { openAndroidRuntime, originClass } = require('./android-runtime.cjs');
function fixture(failAttach = false) {
  let closed = 0, staleAttachments = 0, freshAttachments = 0, pid = 222;
  const page = { setDefaultTimeout() {}, setDefaultNavigationTimeout() {}, on() {}, url:()=>c.ORIGIN+'/login', async evaluate() { return {origin:'STAGING',ready:'complete',online:true}; }, async waitForURL() {}, async waitForLoadState() {}, async goto() {} };
  const device = { serial: () => 'emulator-5554', setDefaultTimeout() {}, async close() { closed++; },
    async shell(command) { if (command.startsWith('pidof')) return Buffer.from(String(pid)); if (command.startsWith('am force-stop')) pid++; return Buffer.from(''); },
    webViews: () => [
      { pkg: () => 'com.diewish.app', pid: () => 111, async page() { staleAttachments++; throw new Error('STALE_VIEW_USED'); } },
      { pkg: () => 'com.diewish.app', pid: () => pid, async page() { freshAttachments++; if (failAttach) throw Object.assign(new Error('private-content'), {name:'TimeoutError'}); return page; } },
    ],
  };
  return { pw: { _android: { devices: async () => [device] } }, counts: () => ({closed,staleAttachments,freshAttachments}) };
}
test('attachment failure closes resources owned before the runtime is returned', async () => {
  const f = fixture(true);
  await assert.rejects(openAndroidRuntime(f.pw), {code:'ANDROID_WEBVIEW_ATTACH_TIMEOUT'});
  assert.deepEqual(f.counts(), {closed:1,staleAttachments:0,freshAttachments:1});
});
test('initial launch and session reopen attach only the current native app process', async () => {
  const f = fixture(); const runtime = await openAndroidRuntime(f.pw);
  assert.equal(runtime.runtime, 'android-emulator');
  await runtime.relaunch(); await runtime.close();
  assert.deepEqual(f.counts(), {closed:1,staleAttachments:0,freshAttachments:2});
});
test('bounded stages report timeout and propagate failure without private error content', async () => {
  const lines=[]; const mock=test.mock.method(console,'log',(...args)=>lines.push(args.join(' ')));
  try {
    await assert.rejects(stage('FIXTURE_WAIT', 10, () => new Promise(()=>{})), {code:'ANDROID_FIXTURE_WAIT_TIMEOUT'});
    await assert.rejects(stage('FIXTURE_FAIL', 20, () => { throw new c.Blocked('FIXTURE_PRIVATE_FAILURE'); }), c.Blocked);
    assert.ok(lines.some(line=>line.includes('FIXTURE_WAIT TIMEOUT')));
    assert.ok(lines.some(line=>line.includes('FIXTURE_FAIL FAIL')));
    assert.ok(!lines.some(line=>line.includes('PRIVATE_FAILURE')));
    assert.ok(!lines.some(line=>line.includes(' PASS ')));
  } finally { mock.mock.restore(); }
});
test('origin diagnostics classify without returning URLs or private components', () => {
  assert.equal(originClass(c.ORIGIN + '/login?private=value'), 'STAGING');
  assert.equal(originClass('chrome-error://chromewebdata/'), 'NETWORK_ERROR');
  assert.equal(originClass('about:blank'), 'BLANK');
  assert.equal(originClass('https://private:credential@example.invalid/token'), 'OTHER');
  assert.equal(originClass('private-content'), 'UNKNOWN');
});
