const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/infrastructure/identity', file), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, console, ...globals });
  return exports;
}

test('TR mobile formats normalize without accepting malformed or foreign numbers', () => {
  const { normalizeTurkishPhone } = load('auth-feedback.ts');
  for (const value of ['0555 111 22 33', '5551112233', '90 (555) 111-22-33', '+90 555 111 22 33', '00905551112233']) {
    assert.equal(normalizeTurkishPhone(value), '+905551112233');
  }
  for (const value of ['', '+90', '0555111223', '055511122334', '+441234567890', '02121112233', 'abc05551112233', '++905551112233']) {
    assert.equal(normalizeTurkishPhone(value), null);
  }
});

test('Firebase failures have safe Turkish feedback and code-only diagnostics', () => {
  const logs = [];
  const { authErrorMessage } = load('auth-feedback.ts', { console: { warn: (...args) => logs.push(args) } });
  const fallback = authErrorMessage(new Error('upstream secret'));
  for (const code of ['unauthorized-domain', 'popup-closed-by-user', 'popup-blocked', 'operation-not-allowed', 'invalid-api-key', 'invalid-credential', 'network-request-failed', 'invalid-verification-code', 'captcha-check-failed', 'code-expired', 'too-many-requests', 'quota-exceeded', 'error-code:-39']) {
    const message = authErrorMessage({ code: `auth/${code}`, message: 'upstream secret' });
    assert.notEqual(message, fallback);
    assert.doesNotMatch(message, /upstream|Firebase|auth\//);
    assert.equal(logs.at(-1)[0], `[identity] authentication failed code=auth/${code}`);
  }
  assert.doesNotMatch(JSON.stringify(logs), /upstream secret/);
});

function harness(responses, { scriptFailure = false, phoneFailure = false, clearFailure = false } = {}) {
  const state = { requests: 0, initialized: [], cleared: 0, phoneCalls: 0, scriptAttempts: 0 };
  const scripts = new Map();
  const credential = { user: { getIdToken: async () => 'test-id-token' } };
  const auth = () => ({
    signInWithPopup: async () => credential,
    signInWithPhoneNumber: async () => {
      state.phoneCalls++;
      if (phoneFailure) throw { code: 'auth/captcha-check-failed' };
      return { confirm: async () => credential };
    },
  });
  auth.GoogleAuthProvider = class {};
  auth.RecaptchaVerifier = class {
    clear() {
      state.cleared++;
      if (clearFailure) throw new Error('cleanup failed');
    }
  };
  const sdk = { apps: [], initializeApp: config => state.initialized.push(config), auth };
  const module = load('firebase-browser.ts', {
    process: { env: {
      NEXT_PUBLIC_FIREBASE_API_KEY: 'stale-key', NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'stale.invalid',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'stale-project', NEXT_PUBLIC_FIREBASE_APP_ID: 'stale-app',
    } },
    require: name => name.includes('http-client') ? {
      apiRequest: async options => {
        assert.equal(options.cache, 'no-store');
        const response = responses[Math.min(state.requests++, responses.length - 1)];
        if (response instanceof Error) throw response;
        return response;
      },
    } : { isApiConfigured: () => true },
    window: { firebase: sdk },
    document: {
      getElementById: id => scripts.get(id),
      createElement: () => ({ dataset: {}, remove() { scripts.delete(this.id); } }),
      head: { appendChild: script => {
        scripts.set(script.id, script);
        queueMicrotask(() => {
          state.scriptAttempts++;
          if (scriptFailure && state.scriptAttempts === 1) script.onerror();
          else script.onload();
        });
      } },
    },
  });
  return { ...module, state };
}

const configured = { configured: true, config: {
  apiKey: 'runtime-key', authDomain: 'runtime.invalid', projectId: 'runtime-project', appId: 'runtime-app',
} };

test('runtime settings override stale build values and concurrent callers share initialization', async () => {
  const h = harness([configured]);
  assert.deepEqual(await Promise.all([h.signInWithGoogle(), h.signInWithGoogle()]), ['test-id-token', 'test-id-token']);
  assert.equal(h.state.requests, 1);
  assert.equal(h.state.initialized.length, 1);
  assert.equal(h.state.initialized[0].projectId, 'runtime-project');
});

test('failed or disabled runtime config never falls back to another project and can retry', async () => {
  for (const failed of [new Error('offline'), { configured: false, config: null }, { configured: true, config: { apiKey: 'incomplete' } }]) {
    const h = harness([failed, configured]);
    await assert.rejects(h.signInWithGoogle());
    assert.equal(h.state.initialized.length, 0);
    assert.equal(await h.signInWithGoogle(), 'test-id-token');
    assert.equal(h.state.requests, 2);
  }
});

test('failed CDN script is removed so the next attempt can load it', async () => {
  const h = harness([configured], { scriptFailure: true });
  await assert.rejects(h.signInWithGoogle(), { code: 'auth/network-request-failed' });
  assert.equal(await h.signInWithGoogle(), 'test-id-token');
});

test('phone failure cleans up reCAPTCHA and confirmed code returns an upstream token', async () => {
  const failed = harness([configured], { phoneFailure: true });
  await assert.rejects(failed.startPhoneVerification('+905551112233', 'recaptcha'), { code: 'auth/captcha-check-failed' });
  assert.equal(failed.state.cleared, 1);
  const h = harness([configured]);
  const confirmation = await h.startPhoneVerification('+905551112233', 'recaptcha');
  assert.equal(await confirmation.confirm('123456'), 'test-id-token');
  confirmation.clear();
  assert.equal(h.state.cleared, 1);
});

test('reCAPTCHA cleanup failure never masks the original phone error', async () => {
  const h = harness([configured], { phoneFailure: true, clearFailure: true });
  await assert.rejects(h.startPhoneVerification('+905551112233', 'recaptcha'), {
    code: 'auth/captcha-check-failed',
  });
  assert.equal(h.state.cleared, 1);
});
