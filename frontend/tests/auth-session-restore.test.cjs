const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, modules, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => {
    if (!(name in modules)) throw new Error(`Unexpected module: ${name}`);
    return modules[name];
  }, ...globals });
  return exports;
}
const java = fs.readFileSync(path.join(__dirname, '../../android/app/src/main/java/com/diewish/app/DiewishSessionCookieBridge.java'), 'utf8');
const nativeScript = java.match(/return """\n([\s\S]*?)\n\s*""";/)[1];
const session = id => ({ user: { id, onboardingCompleted: true }, tokens: { accessToken: `memory-${id}` } });
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
// Controlled disk model, never advertised as real WebView/Emulator evidence.
function diskModel() {
  return { ram: null, disk: null, flushes: 0,
    flush() { this.disk = this.ram; this.flushes++; },
    kill() { this.ram = this.disk; },
  };
}
function nativeWindow(rawFetch, disk, enabled = true) {
  const window = {
    fetch: rawFetch,
    location: { href: 'https://staging.diewish.com/dashboard', origin: 'https://staging.diewish.com' },
    localStorage: {
      removeItem() {}, setItem() { throw new Error('Token/password storage forbidden'); },
    },
    DiewishSessionCookies: { persist(...args) { assert.equal(args.length, 0); disk.flush(); } },
  };
  const context = vm.createContext({ window, URL });
  if (enabled) vm.runInContext(nativeScript, context);
  return { window, reinstall: () => vm.runInContext(nativeScript, context) };
}
function storeHarness(refresh, window = { localStorage: { removeItem() {} } }) {
  let unauthorized, provider;
  const { authStore } = load('application/auth/auth-store.ts', {
    react: {},
    '@/infrastructure/api/http-client': {
      setAccessTokenProvider: fn => { provider = fn; },
      setUnauthorizedHandler: fn => { unauthorized = fn; },
    },
    '@/infrastructure/auth/auth-client': { authClient: { refresh } },
  }, { window });
  return { store: authStore, unauthorized: () => unauthorized(), token: () => provider() };
}
function response(data, ok = true) {
  return { ok, status: ok ? 200 : 401, json: async () => ok
    ? { success: true, data } : { success: false, error: { code: 'UNAUTHORIZED' } } };
}
function fetchAuthHarness(rawFetch, disk, enabled = true) {
  const native = nativeWindow(rawFetch, disk, enabled);
  const http = load('infrastructure/api/http-client.ts', {
    '@/application/config/env': { env: { apiBaseUrl: '/api' }, isApiConfigured: () => true },
  }, { window: native.window, Headers, FormData, fetch: (...args) => native.window.fetch(...args) });
  const { authClient } = load('infrastructure/auth/auth-client.ts', {
    '@/infrastructure/api/http-client': http,
    '@/infrastructure/auth/endpoints': { AUTH_ENDPOINTS: {
      login: '/auth/login', refresh: '/auth/refresh-token', logout: '/auth/logout',
    } },
  });
  const { authStore } = load('application/auth/auth-store.ts', {
    react: {}, '@/infrastructure/api/http-client': http,
    '@/infrastructure/auth/auth-client': { authClient },
  }, { window: native.window });
  return { store: authStore, client: authClient, ...native };
}

test('baseline page-finished checkpoint misses later fetch; native completion checkpoint restores after kill', async () => {
  for (const enabled of [false, true]) {
    const disk = diskModel();
    disk.flush(); // Existing page-finished call occurs before the login response.
    const h = fetchAuthHarness(async (url, options) => {
      assert.equal(options.credentials, 'include');
      disk.ram = 'synthetic-valid-cookie';
      return response(session('a'));
    }, disk, enabled);
    const login = await h.client.login({ email: 'synthetic@example.com', password: 'synthetic-only' });
    h.store.setSession(login);
    disk.kill(); // no onPause/onStop/onDestroy callbacks
    const restarted = fetchAuthHarness(async () => {
      if (!disk.ram) return response(null, false);
      disk.ram = 'synthetic-successor';
      return response(session('a'));
    }, disk, enabled);
    await restarted.store.hydrate();
    assert.equal(restarted.store.getSnapshot().status, enabled ? 'authenticated' : 'unauthenticated');
    if (enabled) assert.equal(disk.disk, 'synthetic-successor');
  }
});

test('initial checkpoint covers already-finished startup refresh; later refresh is checkpointed before auth state', async () => {
  const disk = diskModel();
  disk.ram = 'synthetic-early-successor';
  const h = fetchAuthHarness(async () => {
    disk.ram = 'synthetic-late-successor';
    return response(session('a'));
  }, disk);
  assert.equal(disk.disk, 'synthetic-early-successor');
  h.store.subscribe(() => assert.equal(disk.disk, disk.ram));
  await h.store.hydrate();
  assert.equal(h.store.getSnapshot().status, 'authenticated');
  assert.equal(disk.disk, 'synthetic-late-successor');
});

test('startup hydration stays loading and performs a single refresh for concurrent callers', async () => {
  const pending = deferred(); let calls = 0;
  const h = storeHarness(() => { calls++; return pending.promise; });
  const first = h.store.hydrate();
  assert.equal(h.store.hydrate(), first);
  assert.equal(h.store.getSnapshot().status, 'loading');
  pending.resolve(session('a')); await first;
  assert.equal(calls, 1);
  assert.equal(h.store.getSnapshot().status, 'authenticated');
  assert.equal(h.token(), 'memory-a');
  assert.equal(h.store.getRefreshToken(), null);
});
for (const reason of ['missing/app-data-cleared', 'expired', 'revoked']) {
  test(`${reason} refresh ends unauthenticated without retries`, async () => {
    let calls = 0;
    const h = storeHarness(async () => { calls++; throw new Error(reason); });
    await h.store.hydrate(); await h.store.hydrate();
    assert.equal(h.store.getSnapshot().status, 'unauthenticated');
    assert.equal(h.token(), null); assert.equal(calls, 1);
  });
}

test('concurrent 401 requests rotate only once; failure clears memory without a retry loop', async () => {
  const pending = deferred(); let calls = 0;
  const h = storeHarness(() => { calls++; return pending.promise; });
  h.store.setSession(session('a'));
  const first = h.unauthorized(); const second = h.unauthorized();
  pending.resolve(session('a'));
  assert.deepEqual(await Promise.all([first, second]), ['memory-a', 'memory-a']);
  assert.equal(calls, 1);
  const failing = storeHarness(async () => { throw new Error('Expired'); });
  failing.store.setSession(session('a'));
  assert.equal(await failing.unauthorized(), null);
  assert.equal(await failing.unauthorized(), null);
  assert.equal(failing.store.getSnapshot().status, 'unauthenticated');
});

test('late hydration cannot resurrect logout or overwrite a newer account', async () => {
  for (const action of ['logout', 'new-account']) {
    const pending = deferred(); const h = storeHarness(() => pending.promise);
    const hydrating = h.store.hydrate();
    if (action === 'logout') h.store.clear(); else h.store.setSession(session('b'));
    pending.resolve(session('a')); await hydrating;
    assert.equal(h.store.getSnapshot().user?.id ?? null, action === 'logout' ? null : 'b');
  }
});

test('successful logout persists deletion before kill; failed refresh does not fabricate authentication', async () => {
  const disk = diskModel(); disk.ram = disk.disk = 'synthetic-valid';
  const h = fetchAuthHarness(async url => {
    if (url.endsWith('/logout')) { disk.ram = null; return response({ message: 'Logged out' }); }
    return response(null, false);
  }, disk);
  await h.client.logout(); disk.kill(); assert.equal(disk.ram, null);
  const before = disk.flushes;
  await h.store.hydrate();
  assert.equal(disk.flushes, before);
  assert.equal(h.store.getSnapshot().status, 'unauthenticated');
});

test('observer is idempotent, exact-path/first-party/POST scoped and preserves request/response/errors', async () => {
  const disk = diskModel(); const result = response(session('a')); let seen;
  const native = nativeWindow(function (...args) { seen = args; return Promise.resolve(result); }, disk);
  const installed = native.window.fetch; native.reinstall(); assert.equal(native.window.fetch, installed);
  const base = disk.flushes;
  for (const [url, init] of [
    ['/api/auth/me', { method: 'GET' }], ['/api/auth/login', { method: 'GET' }],
    ['https://external.invalid/api/auth/login', { method: 'POST' }],
    ['/api/auth/login/extra', { method: 'POST' }], ['/api/tracking/water', { method: 'POST' }],
  ]) {
    assert.equal(await installed(url, init), result);
    assert.equal(seen[0], url); assert.equal(seen[1], init);
  }
  assert.equal(disk.flushes, base);
  const request = { url: 'https://staging.diewish.com/api/auth/refresh-token', method: 'POST' };
  assert.equal(await installed(request), result);
  assert.equal(disk.flushes, base + 1);
  const error = new Error('synthetic-network-error');
  const failing = nativeWindow(() => Promise.reject(error), disk);
  await assert.rejects(failing.window.fetch('/api/auth/login', { method: 'POST' }), e => e === error);
});

test('no native bridge remains browser-compatible; no token/password/header/body is passed to native', async () => {
  const window = { location: { href: 'https://staging.diewish.com/login', origin: 'https://staging.diewish.com' }, fetch: async () => response(session('a')) };
  vm.runInNewContext(nativeScript, { window, URL });
  assert.equal((await window.fetch('/api/auth/login', { method: 'POST' })).ok, true);
  assert.doesNotMatch(nativeScript, /localStorage|sessionStorage|Authorization|\.headers|\.json\(|\.text\(/);
});

test('document-start observer retains an in-flight startup refresh through the page-finished callback', async () => {
  const disk = diskModel(); disk.ram = disk.disk = 'synthetic-previous';
  const pending = deferred();
  const native = nativeWindow(() => pending.promise, disk);
  const refresh = native.window.fetch('/api/auth/refresh-token', { method: 'POST' });
  native.reinstall(); // page finishes while refresh response is still pending
  disk.ram = 'synthetic-current';
  pending.resolve(response(session('a')));
  await refresh;
  disk.kill();
  assert.equal(disk.ram, 'synthetic-current');
});
