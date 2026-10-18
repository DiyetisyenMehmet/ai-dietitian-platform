const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const helperFile = path.join(__dirname, '../src/infrastructure/identity/firebase-browser.ts');
const helperSource = fs.readFileSync(helperFile, 'utf8');
const a3 = require('./fixtures/phone-memory-only-a3-call.json');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness({ persistence, missingPersistence = false, sms } = {}) {
  const state = { events: [], widgets: [], clears: 0, sms: 0, confirms: 0 };
  const slot = { isConnected: true, children: [], appendChild(node) {
    node.parent = this; this.children.push(node);
  } };
  const authInstance = {
    async setPersistence(value) {
      state.events.push(`persistence:${value}:start`);
      assert.equal(value, 'none');
      if (persistence) await persistence.promise;
      state.events.push('persistence:none:done');
    },
    async signInWithPhoneNumber(number, verifier) {
      state.events.push('sms'); state.sms++;
      assert.equal(number, '+905551112233');
      assert.equal(verifier, state.widgets.at(-1));
      return sms ? sms.promise : { confirm: async () => { state.confirms++; } };
    },
  };
  if (missingPersistence) delete authInstance.setPersistence;
  const auth = () => authInstance;
  auth.RecaptchaVerifier = class {
    constructor(host, options) {
      state.events.push('widget');
      this.host = host; this.options = options; state.widgets.push(this);
    }
    clear() { state.clears++; }
  };
  const code = ts.transpileModule(helperSource, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  const exports = {}, scripts = new Map();
  vm.runInNewContext(code, {
    exports, process: { env: {} },
    require: name => name.includes('http-client') ? { apiRequest: async () => ({
      configured: true, config: { apiKey: 'synthetic', authDomain: 'synthetic.invalid', projectId: 'synthetic', appId: 'synthetic' },
    }) } : name.includes('phone-auth-diagnostics') ? {
      startPhoneDiagnostic: (_, listener) => ({ stage(value) { listener?.({ stage: value }); },
        recaptchaCompleted() {}, fail() {}, stop() {} }),
    } : { isApiConfigured: () => true },
    window: { firebase: { apps: [{}], auth } },
    document: {
      getElementById: id => id === 'slot' ? slot : scripts.get(id),
      createElement: () => ({ dataset: {}, remove() {
        if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
      } }),
      head: { appendChild(script) { scripts.set(script.id, script); queueMicrotask(() => script.onload()); } },
    },
  });
  return { start: exports.startPhoneVerification, state, slot };
}

async function until(h, event) {
  for (let i = 0; i < 40 && !h.state.events.includes(event); i++) await Promise.resolve();
  assert.ok(h.state.events.includes(event), `Missing boundary ${event}`);
}

test('the exact A3 four-argument call remains typed; abort belongs only in argument five', () => {
  const parsed = ts.createSourceFile(helperFile, helperSource, ts.ScriptTarget.Latest, true);
  const fn = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === 'startPhoneVerification');
  assert.equal(fn.parameters[3].name.text, 'memoryOnly');
  assert.equal(fn.parameters[3].initializer.kind, ts.SyntaxKind.FalseKeyword);
  assert.equal(fn.parameters[4].name.text, 'signal');
  const printer = ts.createPrinter();
  const params = fn.parameters.map(parameter => ts.factory.updateParameterDeclaration(
    parameter, undefined, parameter.dotDotDotToken, parameter.name,
    parameter.initializer ? ts.factory.createToken(ts.SyntaxKind.QuestionToken) : parameter.questionToken,
    parameter.type || ts.factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword), undefined,
  ));
  const signature = `declare function startPhoneVerification(${params.map(p => printer.printNode(ts.EmitHint.Unspecified, p, parsed)).join(',')}): ${fn.type.getText(parsed)};`;
  const valid = `type PhoneAuthDiagnostic = unknown; ${signature}
    const normalized = '+905551112233'; const controller = new AbortController();
    ${a3.call};
    startPhoneVerification(normalized, 'slot');
    startPhoneVerification(normalized, 'slot', undefined, false, controller.signal);
    startPhoneVerification(normalized, 'slot', undefined, true, controller.signal);`;
  function diagnostics(source) {
    const filename = path.join(__dirname, '__phone_compatibility_contract__.ts');
    const options = { strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2020, types: [] };
    const host = ts.createCompilerHost(options), original = host.getSourceFile;
    host.getSourceFile = (file, language, onError) => file === filename
      ? ts.createSourceFile(file, source, language, true) : original(file, language, onError);
    return ts.getPreEmitDiagnostics(ts.createProgram([filename], options, host));
  }
  assert.deepEqual(diagnostics(valid).map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), []);
  const invalid = diagnostics(valid + "startPhoneVerification(normalized, 'slot', undefined, controller.signal); startPhoneVerification(normalized, 'slot', undefined, true, true);");
  assert.equal(invalid.filter(d => d.code === 2345).length, 2);
});

test('A3 true in slot four awaits memory-only persistence before widget or SMS', async () => {
  const h = harness();
  const result = await h.start('+905551112233', 'slot', undefined, true);
  assert.deepEqual(h.state.events, ['persistence:none:start', 'persistence:none:done', 'widget', 'sms']);
  assert.equal(h.state.widgets[0].options.badge, 'inline');
  result.clear();
  assert.equal(h.slot.children.length, 0);
});

test('pending persistence holds the SMS boundary closed', async () => {
  const persistence = deferred(), h = harness({ persistence });
  const pending = h.start('+905551112233', 'slot', undefined, true);
  await until(h, 'persistence:none:start');
  assert.equal(h.state.sms, 0);
  assert.equal(h.state.widgets.length, 0);
  persistence.resolve();
  (await pending).clear();
  assert.equal(h.state.sms, 1);
});

test('persistence rejection preserves the error with no widget, SMS or fallback', async () => {
  const persistence = deferred(), h = harness({ persistence });
  const error = { code: 'auth/web-storage-unsupported' };
  const pending = h.start('+905551112233', 'slot', undefined, true);
  await until(h, 'persistence:none:start'); persistence.reject(error);
  await assert.rejects(pending, actual => actual === error);
  assert.equal(h.state.sms, 0);
  assert.equal(h.state.widgets.length, 0);
  assert.equal(h.slot.children.length, 0);
});

test('missing persistence capability cannot silently send a registration SMS', async () => {
  const h = harness({ missingPersistence: true });
  await assert.rejects(h.start('+905551112233', 'slot', undefined, true));
  assert.equal(h.state.sms, 0);
  assert.equal(h.state.widgets.length, 0);
});

test('two/three-argument legacy and explicit false calls retain their existing persistence policy', async () => {
  for (const args of [[], [undefined], [undefined, false]]) {
    const h = harness();
    (await h.start('+905551112233', 'slot', ...args)).clear();
    assert.deepEqual(h.state.events, ['widget', 'sms']);
  }
});

test('fifth-argument cancellation during memory-only setup prevents late SMS creation', async () => {
  const persistence = deferred(), h = harness({ persistence }), controller = new AbortController();
  const pending = h.start('+905551112233', 'slot', undefined, true, controller.signal);
  await until(h, 'persistence:none:start'); controller.abort();
  await assert.rejects(pending, { code: 'auth/phone-verification-cancelled' });
  persistence.resolve();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(h.state.sms, 0);
  assert.equal(h.state.widgets.length, 0);
});

test('memory-only and fifth-argument pending-SMS cleanup work together', async () => {
  const sms = deferred(), h = harness({ sms }), controller = new AbortController();
  const pending = h.start('+905551112233', 'slot', undefined, true, controller.signal);
  await until(h, 'sms'); controller.abort();
  await assert.rejects(pending, { code: 'auth/phone-verification-cancelled' });
  assert.equal(h.state.clears, 1);
  assert.equal(h.slot.children.length, 0);
  sms.resolve({ confirm() { h.state.confirms++; } });
  await Promise.resolve();
  assert.equal(h.state.confirms, 0);
});

test('false in slot four still permits slot-five cleanup and the slot-three diagnostic callback', async () => {
  const sms = deferred(), h = harness({ sms }), controller = new AbortController(), events = [];
  const pending = h.start('+905551112233', 'slot', event => events.push(event.stage), false, controller.signal);
  await until(h, 'sms'); controller.abort();
  await assert.rejects(pending, { code: 'auth/phone-verification-cancelled' });
  assert.deepEqual(h.state.events, ['widget', 'sms']);
  assert.equal(h.state.clears, 1);
  assert.ok(events.includes('phone-request'));
});
