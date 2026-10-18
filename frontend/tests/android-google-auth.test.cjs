const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness({ native = true, userAgent = '', app = false, throwPost = false } = {}) {
  const sent = [], listeners = new Map(), timers = new Map();
  let next = 0;
  const bridge = { onmessage: null, postMessage: value => {
    if (throwPost) throw new Error('private-provider-details');
    sent.push(JSON.parse(value));
  } };
  const window = {
    navigator: { userAgent }, __DIEWISH_ANDROID_APP__: app,
    crypto: { getRandomValues: bytes => { bytes.fill(++next); return bytes; } },
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: type => listeners.delete(type),
    ...(native ? { DiewishGoogleAuth: bridge } : {}),
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,
    '../src/infrastructure/identity/android-google-auth.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, window, setTimeout: fn => {
    const id = ++next; timers.set(id, fn); return id;
  }, clearTimeout: id => timers.delete(id) });
  return { ...exports, window, sent, listeners, timers, bridge, respond: value => bridge.onmessage?.({ data: JSON.stringify(value) }) };
}

test('only Android shells use native Google; legacy shells are detected without a bridge', () => {
  assert.equal(harness({ native: false }).isAndroidGoogleHost(), false);
  for (const options of [{}, { native: false, app: true }, { native: false, userAgent: 'Mozilla DiewishAndroid/0.1' }]) {
    assert.equal(harness(options).isAndroidGoogleHost(), true);
  }
});

test('legacy or unsupported host fails closed without attempting a popup', async () => {
  const h = harness({ native: false, app: true });
  await assert.rejects(h.requestAndroidGoogleToken('project'), { code: 'auth/native-unavailable' });
});

test('only the matching request resolves, with no profile or token in the outgoing request', async () => {
  const h = harness();
  const promise = h.requestAndroidGoogleToken('expected-project');
  const request = h.sent[0];
  assert.deepEqual(Object.keys(request).sort(), ['action', 'id', 'projectId']);
  assert.equal(request.projectId, 'expected-project');
  h.respond({ id: 'other-request', idToken: 'wrong-account' });
  assert.equal(h.timers.size, 1);
  h.bridge.onmessage({ data: 'invalid json' });
  h.respond({ id: request.id, idToken: 'selected-google-identity' });
  assert.equal(await promise, 'selected-google-identity');
  assert.equal(h.bridge.onmessage, null);
  assert.equal(h.timers.size, 0);
  assert.equal(h.listeners.size, 0);
});

test('double click is rejected and cancellation allows a fresh attempt without stale account reuse', async () => {
  const h = harness();
  const first = h.requestAndroidGoogleToken('project');
  await assert.rejects(h.requestAndroidGoogleToken('project'), { code: 'auth/cancelled-popup-request' });
  const firstId = h.sent[0].id;
  h.respond({ id: firstId, error: 'auth/native-cancelled' });
  await assert.rejects(first, { code: 'auth/native-cancelled' });
  const second = h.requestAndroidGoogleToken('project');
  const secondId = h.sent.at(-1).id;
  assert.notEqual(firstId, secondId);
  h.respond({ id: firstId, idToken: 'previous-account' });
  h.respond({ id: secondId, idToken: 'new-account' });
  assert.equal(await second, 'new-account');
});

test('page exit cancels native work and drops a late identity response', async () => {
  const h = harness();
  const p = h.requestAndroidGoogleToken('project');
  const id = h.sent[0].id;
  h.listeners.get('pagehide')();
  await assert.rejects(p, { code: 'auth/native-cancelled' });
  assert.deepEqual(h.sent.at(-1), { action: 'cancel', id });
  assert.equal(h.bridge.onmessage, null);
  assert.equal(h.timers.size, 0);
});

test('timeout cancels native work and releases the single-flight guard', async () => {
  const h = harness();
  const p = h.requestAndroidGoogleToken('project');
  [...h.timers.values()][0]();
  await assert.rejects(p, { code: 'auth/native-timeout' });
  const retry = h.requestAndroidGoogleToken('project');
  h.respond({ id: h.sent.at(-1).id, error: 'auth/native-cancelled' });
  await assert.rejects(retry);
});

test('malformed results, provider details and unknown error codes are rejected safely', async () => {
  for (const result of [{}, { idToken: '' }, { idToken: 'x'.repeat(16385) },
    { error: 'private-details' }, { idToken: 'ambiguous', error: 'auth/native-failed' }]) {
    const h = harness();
    const p = h.requestAndroidGoogleToken('project');
    h.respond({ id: h.sent[0].id, ...result });
    await assert.rejects(p, e => e.code === 'auth/native-failed' && !e.message.includes('private'));
  }
});

test('post failure cleans up without exposing the native exception', async () => {
  const h = harness({ throwPost: true });
  await assert.rejects(h.requestAndroidGoogleToken('project'), { code: 'auth/native-unavailable' });
  assert.equal(h.timers.size, 0);
  assert.equal(h.listeners.size, 0);
});


test('SPA route disposal cancels native selection and prevents a late account response', async () => {
  const h = harness();
  const controller = new AbortController();
  const p = h.requestAndroidGoogleToken('project', controller.signal);
  controller.abort();
  await assert.rejects(p, { code: 'auth/native-cancelled' });
  assert.equal(h.sent.at(-1).action, 'cancel');
  assert.equal(h.bridge.onmessage, null);
  await assert.rejects(h.requestAndroidGoogleToken('project', controller.signal), { code: 'auth/native-cancelled' });
});

test('unavailable secure random source fails safely and does not lock future attempts', async () => {
  const h = harness();
  const random = h.window.crypto;
  h.window.crypto = undefined;
  await assert.rejects(h.requestAndroidGoogleToken('project'), { code: 'auth/native-unavailable' });
  h.window.crypto = random;
  const p = h.requestAndroidGoogleToken('project');
  h.respond({ id: h.sent[0].id, error: 'auth/native-cancelled' });
  await assert.rejects(p, { code: 'auth/native-cancelled' });
});
