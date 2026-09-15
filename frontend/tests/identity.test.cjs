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
  vm.runInNewContext(code, { exports, console, require, ...globals });
  return exports;
}

test('TR is the default-compatible country and mobile formats normalize to E.164', () => {
  const { normalizePhoneNumber } = load('phone-number.ts');
  for (const value of ['0555 111 22 33', '5551112233', '90 (555) 111-22-33', '+90 555 111 22 33', '00905551112233']) {
    assert.equal(normalizePhoneNumber(value, 'TR'), '+905551112233');
  }
  for (const value of ['', '+90', '0555111223', '055511122334', '02121112233', 'abc05551112233', '++905551112233']) {
    assert.equal(normalizePhoneNumber(value, 'TR'), null);
  }
});

test('international mobile numbers use the selected country without handwritten rules', () => {
  const { getPhoneCountries, normalizePhoneNumber } = load('phone-number.ts');
  const countries = getPhoneCountries('tr');
  const turkey = countries.find(country => country.code === 'TR');
  assert.equal(turkey.callingCode, '+90');
  assert.match(turkey.name, /Türkiye/);
  assert.ok(countries.length > 200);

  for (const [country, local, expected] of [
    ['US', '(202) 555-0123', '+12025550123'],
    ['GB', '07400 123456', '+447400123456'],
    ['DE', '01512 3456789', '+4915123456789'],
    ['FR', '06 12 34 56 78', '+33612345678'],
    ['AZ', '050 123 45 67', '+994501234567'],
  ]) {
    assert.equal(normalizePhoneNumber(local, country), expected);
  }
  assert.equal(normalizePhoneNumber('+44 7400 123456', 'TR'), '+447400123456');
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
  const state = { requests: 0, initialized: [], cleared: 0, phoneCalls: 0, scriptAttempts: 0, authLanguage: null, scriptSources: [] };
  const scripts = new Map();
  const credential = { user: { getIdToken: async () => 'test-id-token' } };
  const auth = () => ({
    get languageCode() { return state.authLanguage; },
    set languageCode(value) { state.authLanguage = value; },
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
    } : name.includes('phone-auth-diagnostics') ? load('phone-auth-diagnostics.ts', {
      console: { warn() {} },
    }) : { isApiConfigured: () => true },
    window: { firebase: sdk },
    document: {
      getElementById: id => scripts.get(id),
      createElement: () => ({ dataset: {}, remove() { scripts.delete(this.id); } }),
      head: { appendChild: script => {
        scripts.set(script.id, script);
        state.scriptSources.push(script.src);
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
  assert.ok(h.state.scriptSources.every(source => source.includes('/firebasejs/12.19.0/')));
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
  assert.equal(h.state.authLanguage, 'tr');
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

test('phone diagnostics expose the failed stage without replacing the Firebase error', async () => {
  const events = [];
  const h = harness([configured], { phoneFailure: true });
  await assert.rejects(h.startPhoneVerification('+905551112233', 'recaptcha', event => events.push(event)), {
    code: 'auth/captcha-check-failed',
  });
  assert.equal(events.at(-1).stage, 'phone-request');
  assert.equal(events.at(-1).failure.code, 'auth/captcha-check-failed');
  assert.doesNotMatch(JSON.stringify(events), /905551112233|test-id-token|runtime-key/);
});

test('staging network diagnostics keep only endpoint, HTTP status and bounded server code', async () => {
  const logs = [];
  const calls = [];
  const upstream = { status: 400, ok: false, clone: () => ({ json: async () => ({ error: {
    message: 'TOO_MANY_ATTEMPTS_TRY_LATER : private details', phone: 'private-phone', token: 'private-token',
  } }) }) };
  const original = async (...args) => { calls.push(args); return upstream; };
  const browser = { location: { hostname: 'staging.diewish.com', origin: 'https://staging.diewish.com' }, fetch: original };
  const { startPhoneDiagnostic } = load('phone-auth-diagnostics.ts', { window: browser, URL, console: { warn: value => logs.push(value) } });
  const events = [];
  const d = startPhoneDiagnostic('12.19.0', event => events.push(event));
  const url = 'https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=private-key';
  const init = { method: 'POST', body: 'private-phone-and-captcha' };
  assert.equal(await browser.fetch(url, init), upstream);
  assert.equal(calls[0][0], url);
  assert.equal(calls[0][1], init);
  d.fail({ name: 'FirebaseError', code: 'auth/too-many-requests', message: 'private-phone private-token' });
  assert.equal(events.at(-1).requests[0].error, 'TOO_MANY_ATTEMPTS_TRY_LATER');
  assert.equal(events.at(-1).requests[0].status, 400);
  assert.doesNotMatch(JSON.stringify([events, logs]), /private-|\?key=|body/);
  d.stop();
  assert.equal(browser.fetch, original);
});

test('phone diagnostics do not observe production traffic and redact unknown exceptions', () => {
  const browser = { location: { hostname: 'diewish.com' }, fetch: async () => {} };
  const original = browser.fetch;
  const { startPhoneDiagnostic, safePhoneFailure } = load('phone-auth-diagnostics.ts', { window: browser });
  const d = startPhoneDiagnostic('12.19.0');
  assert.equal(browser.fetch, original);
  const failure = safePhoneFailure({ name: 'TypeError', code: 'phone +905551112233', message: 'private-token' });
  assert.equal(failure.name, 'TypeError');
  assert.equal(failure.code, 'unknown');
  assert.doesNotMatch(JSON.stringify(failure), /private-|905551112233/);
  d.stop();
});
