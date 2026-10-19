const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the existing service -> client -> HTTP chain. Only transport and
// unrelated logout-only dependencies are synthetic; product source is untouched.
function load(file, modules, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: name => {
      if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
      return modules[name];
    },
    ...globals,
  });
  return exports;
}
function harness(transport, configured = true) {
  const calls = [];
  const http = load('infrastructure/api/http-client.ts', {
    '@/application/config/env': { env: { apiBaseUrl: '/api' }, isApiConfigured: () => configured },
  }, {
    Headers, FormData,
    fetch: async (url, options) => { calls.push({ url, options }); return transport(); },
  });
  const endpoints = load('infrastructure/auth/endpoints.ts', {});
  const { authClient } = load('infrastructure/auth/auth-client.ts', {
    '@/infrastructure/api/http-client': http,
    '@/infrastructure/auth/endpoints': endpoints,
  });
  const { authService } = load('application/auth/auth-service.ts', {
    '@/infrastructure/api/http-client': http,
    '@/infrastructure/auth/auth-client': { authClient },
    '@/infrastructure/notifications/notification-client': {},
    '@/infrastructure/notifications/notification-lifecycle': {},
    '@/infrastructure/notifications/web-push': {},
  });
  return { authService, calls };
}
const input = { email: 'app11-a5@example.invalid', password: 'SyntheticContractOnly123!', rememberMe: true };
function reply(status, data) {
  return { ok: status < 400, status, json: async () => data };
}
function assertLoginRequest(calls) {
  assert.equal(calls.length, 1, 'no retry/provider/feature-status request');
  const { url, options } = calls[0];
  assert.equal(url, '/api/auth/login');
  assert.equal(options.method, 'POST');
  assert.equal(options.credentials, 'include');
  assert.equal(options.headers.get('content-type'), 'application/json');
  assert.deepEqual(JSON.parse(options.body), { email: input.email, password: input.password });
}

test('normal email login uses the existing endpoint/envelope with only email and password', async () => {
  const session = { user: { id: 'synthetic-user' }, tokens: { accessToken: 'synthetic-only' } };
  const h = harness(() => reply(200, { success: true, data: session }));
  const result = await h.authService.login(input);
  assert.equal(result.ok, true);
  assert.equal(result.data, session);
  assertLoginRequest(h.calls);
});

for (const [status, code, message] of [
  [500, 'INTERNAL_SERVER_ERROR', 'Sunucu hatası. Lütfen daha sonra tekrar deneyin.'],
  [503, 'SERVICE_UNAVAILABLE', 'Sunucu hatası. Lütfen daha sonra tekrar deneyin.'],
  [401, 'UNAUTHORIZED', 'E-posta veya şifre hatalı.'],
  [422, 'UNPROCESSABLE_ENTITY', 'Girilen bilgiler geçersiz. Lütfen kontrol edin.'],
  [429, 'AUTH_LOGIN_RATE_LIMITED', 'Çok sayıda başarısız giriş denemesi yapıldı. Lütfen kısa süre sonra tekrar deneyin.'],
]) {
  test(`email login HTTP ${status} remains distinct from validation, credentials and network failures`, async () => {
    const h = harness(() => reply(status, { success: false, error: { code, message: 'Synthetic upstream detail' } }));
    const result = await h.authService.login(input);
    assert.equal(result.ok, false);
    assert.equal(result.error, message);
    assertLoginRequest(h.calls);
  });
}

test('transport failure is a connection message, not a fabricated server 5xx', async () => {
  const h = harness(() => { throw new Error('Synthetic network failure'); });
  const result = await h.authService.login(input);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Sunucuya ulaşılamadı. Lütfen bağlantınızı kontrol edin.');
  assertLoginRequest(h.calls);
});

test('missing API configuration fails before transport and does not report server 5xx', async () => {
  const h = harness(() => { throw new Error('must not fetch'); }, false);
  const result = await h.authService.login(input);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Backend API yapılandırması bulunamadı.');
  assert.equal(h.calls.length, 0);
});
