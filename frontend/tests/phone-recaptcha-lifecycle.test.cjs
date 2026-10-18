const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness({ sms = null, configuration = null, missingContainer = false, clearThrows = false } = {}) {
  const state = { verifiers: [], sent: 0, confirms: 0, clears: 0, stopped: 0 };
  const slot = { isConnected: true, children: [], appendChild(node) {
    node.parent = this; this.children.push(node);
  } };
  const confirmation = { confirm: async code => {
    state.confirms++;
    if (code !== '123456') throw { code: 'auth/invalid-verification-code' };
    return { user: { getIdToken: async () => 'synthetic-firebase-identity' } };
  } };
  const auth = () => ({ signInWithPhoneNumber: async (phone, verifier) => {
    assert.equal(phone, '+905551112233');
    assert.equal(verifier, state.verifiers.at(-1));
    state.sent++;
    return sms ? sms.promise : confirmation;
  } });
  auth.RecaptchaVerifier = class {
    constructor(host, options) {
      this.host = host;
      this.options = options;
      state.verifiers.push(this);
    }
    clear() {
      state.clears++;
      // Firebase's invisible clear does not remove its DOM children.
      if (clearThrows) throw new Error('synthetic cleanup failure');
    }
  };
  const scripts = new Map();
  const source = fs.readFileSync(path.join(__dirname, '../src/infrastructure/identity/firebase-browser.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, process: { env: {} },
    require: name => name.includes('http-client') ? { apiRequest: async () => configuration ? configuration.promise : ({
      configured: true, config: { apiKey: 'synthetic-key', authDomain: 'synthetic.invalid', projectId: 'synthetic-project', appId: 'synthetic-app' },
    }) } : name.includes('phone-auth-diagnostics') ? { startPhoneDiagnostic: () => ({
      stage() {}, recaptchaCompleted() {}, fail() {}, stop() { state.stopped++; },
    }) } : { isApiConfigured: () => true },
    window: { firebase: { apps: [{}], auth } },
    document: {
      getElementById: id => id === 'slot' ? (missingContainer ? null : slot) : scripts.get(id),
      createElement: tag => ({ tag, dataset: {}, remove() {
        if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
      } }),
      head: { appendChild(script) { scripts.set(script.id, script); queueMicrotask(() => script.onload()); } },
    },
  });
  return { ...exports, state, slot, confirmation };
}

async function untilStarted(h) {
  for (let i = 0; i < 30 && h.state.sent === 0; i++) await Promise.resolve();
  assert.equal(h.state.sent, 1);
}

test('invisible protection and complete inline branding are owned by the phone route', async () => {
  const h = harness();
  const result = await h.startPhoneVerification('+905551112233', 'slot');
  assert.equal(h.state.verifiers[0].options.size, 'invisible');
  assert.equal(h.state.verifiers[0].options.badge, 'inline');
  assert.equal(h.slot.children.length, 1);
  assert.equal(await result.confirm('123456'), 'synthetic-firebase-identity');
  assert.equal(h.state.confirms, 1);
  result.clear(); result.clear();
  assert.equal(h.state.clears, 1);
  assert.equal(h.slot.children.length, 0);
});

test('leaving while SMS is pending clears immediately and rejects late completion', async () => {
  const sms = deferred(), h = harness({ sms }), controller = new AbortController();
  const pending = h.startPhoneVerification('+905551112233', 'slot', undefined, false, controller.signal);
  await untilStarted(h);
  controller.abort();
  await assert.rejects(pending, { code: 'auth/phone-verification-cancelled' });
  assert.equal(h.state.clears, 1);
  assert.equal(h.slot.children.length, 0);
  assert.equal(h.state.stopped, 1);
  sms.resolve(h.confirmation);
  await Promise.resolve();
  assert.equal(h.state.confirms, 0);
  assert.equal(h.state.clears, 1);
});

test('leaving after SMS acceptance releases the verifier before a React effect can own the result', async () => {
  const h = harness(), controller = new AbortController();
  const result = await h.startPhoneVerification('+905551112233', 'slot', undefined, false, controller.signal);
  controller.abort(); result.clear();
  assert.equal(h.state.clears, 1);
  assert.equal(h.slot.children.length, 0);
});

test('leaving during configuration loading never constructs a late verifier or sends SMS', async () => {
  const configuration = deferred(), h = harness({ configuration }), controller = new AbortController();
  const pending = h.startPhoneVerification('+905551112233', 'slot', undefined, false, controller.signal);
  controller.abort();
  await assert.rejects(pending, { code: 'auth/phone-verification-cancelled' });
  configuration.resolve({ configured: true, config: { apiKey: 'key', authDomain: 'domain', projectId: 'project', appId: 'app' } });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(h.state.verifiers.length, 0);
  assert.equal(h.state.sent, 0);
  assert.equal(h.state.stopped, 1);
});

test('aborted or detached phone views never send an SMS', async () => {
  const h = harness(), controller = new AbortController();
  controller.abort();
  await assert.rejects(h.startPhoneVerification('+905551112233', 'slot', undefined, false, controller.signal));
  assert.equal(h.state.sent, 0);
  const detached = harness({ missingContainer: true });
  await assert.rejects(detached.startPhoneVerification('+905551112233', 'slot'));
  assert.equal(detached.state.sent, 0);
});

test('SMS rejection and a throwing SDK cleanup preserve the original security failure', async () => {
  const sms = deferred(), h = harness({ sms, clearThrows: true });
  const pending = h.startPhoneVerification('+905551112233', 'slot');
  await untilStarted(h);
  sms.reject({ code: 'auth/captcha-check-failed' });
  await assert.rejects(pending, { code: 'auth/captcha-check-failed' });
  assert.equal(h.state.clears, 1);
  assert.equal(h.slot.children.length, 0);
});

test('failed SMS code remains rejected and number changes get a fresh owned widget', async () => {
  const h = harness();
  const first = await h.startPhoneVerification('+905551112233', 'slot');
  await assert.rejects(first.confirm('000000'), { code: 'auth/invalid-verification-code' });
  first.clear();
  const second = await h.startPhoneVerification('+905551112233', 'slot');
  assert.notEqual(h.state.verifiers[0].host, h.state.verifiers[1].host);
  assert.equal(h.slot.children.length, 1);
  second.clear();
  assert.equal(h.slot.children.length, 0);
});
