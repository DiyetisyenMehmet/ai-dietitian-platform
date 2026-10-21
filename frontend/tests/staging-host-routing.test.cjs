const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextRequest } = require('next/server');
function load(file, overrides = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => overrides[id] ?? require(id), mod, mod.exports);
  return mod.exports;
}
const routes = load('src/infrastructure/api/staging-host-routing.ts');
const { middleware } = load('src/middleware.ts', {
  '@/infrastructure/api/staging-host-routing': routes,
  '@/shared/constants/admin': { ADMIN_STAGING_HOST: routes.STAGING_ADMIN_HOST, ADMIN_PRODUCTION_HOST: 'admin.diewish.com' },
});
const hosts = [routes.STAGING_ADMIN_HOST, routes.STAGING_APP_HOST];
const origins = ['admin-legacy', 'diewish-test2'].map(tag => `https://${tag}---diewish-backend-staging-2qqqfr7wzq-ew.a.run.app`);
const env = {
  DIEWISH_STAGING_HOST_ROUTING_ENABLED: 'true',
  DIEWISH_STAGING_ADMIN_API_ORIGIN: origins[0], DIEWISH_STAGING_USER_API_ORIGIN: origins[1],
  NEXT_PUBLIC_API_BASE_URL: '/api',
};
function withEnv(values, run) {
  const old = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  for (const key of Object.keys(env)) {
    if (values[key] === undefined) delete process.env[key]; else process.env[key] = values[key];
  }
  try { return run(); } finally {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}
const apiPaths = ['/api', '/api/auth/register', '/api/auth/login', '/api/auth/me',
  '/api/auth/refresh-token', '/api/auth/logout', '/api/auth/forgot-password', '/api/auth/reset-password',
  '/api/admin/auth/login', '/api/admin/auth/password/forgot', '/api/admin/auth/password/verify',
  '/api/admin/auth/password/reset', '/api/admin/users', '/api/admin/invitations',
  '/api/account/preferences', '/api/unlisted-future-route.json'];
for (let i = 0; i < hosts.length; i++) {
  test(`${hosts[i]} routes ALL API paths, including shared auth`, () => withEnv(env, () => {
    for (const pathname of apiPaths) {
      const result = middleware(new NextRequest(`https://${hosts[i]}${pathname}?proof=synthetic`, {
        method: 'POST', body: '{"synthetic":true}', headers: {
          host: hosts[i], origin: `https://${hosts[i]}`, cookie: 'diewish_refresh=synthetic',
          authorization: 'Bearer synthetic', 'x-forwarded-host': hosts[1-i],
          forwarded: `host=${hosts[1-i]}`, 'x-middleware-rewrite': 'https://evil.invalid',
        },
      }));
      assert.equal(result.headers.get('x-middleware-rewrite'), origins[i] + pathname + '?proof=synthetic');
      assert.equal(result.headers.get('x-middleware-request-cookie'), 'diewish_refresh=synthetic');
      assert.equal(result.headers.get('x-middleware-request-authorization'), 'Bearer synthetic');
      assert.equal(result.headers.get('x-middleware-request-x-forwarded-host'), hosts[i]);
      assert.equal(result.headers.get('x-middleware-request-forwarded'), null);
      assert.equal(result.headers.get('x-middleware-request-x-middleware-rewrite'), null);
      assert.equal(result.headers.get('cache-control'), 'no-store');
    }
  }));
}
test('Unknown/ambiguous Host cannot choose Admin through forwarded headers', () => withEnv(env, () => {
  for (const host of ['evil.invalid', 'staging.diewish.com.evil.invalid', 'staging.diewish.com:443',
    'staging.diewish.com,admin-staging.diewish.com', 'admin.diewish.com', null]) {
    const headers = { 'x-forwarded-host': hosts[0] };
    if (host) headers.host = host;
    assert.equal(middleware(new NextRequest('https://staging.diewish.com/api/auth/me', { headers })).status, 421);
  }
}));
test('Cross-origin/null Origin cannot send sessions between hosts', () => {
  for (const host of hosts) for (const origin of ['null', 'https://evil.invalid', `https://${hosts.find(h => h !== host)}`]) {
    assert.deepEqual(routes.stagingApiRoute(host, '/api/auth/refresh-token', '', origin, env), { status: 403 });
  }
});
test('No Origin (SSR/native) stays on HTTP Host; backend authorization is untouched', () => {
  for (let i = 0; i < hosts.length; i++) assert.deepEqual(routes.stagingApiRoute(hosts[i], '/api/auth/me', '', null, env), { destination: origins[i] + '/api/auth/me' });
});
test('Missing/invalid/swapped/service targets and absolute browser API base fail closed', () => {
  for (const values of [
    { DIEWISH_STAGING_ADMIN_API_ORIGIN: undefined }, { DIEWISH_STAGING_USER_API_ORIGIN: undefined },
    { DIEWISH_STAGING_ADMIN_API_ORIGIN: origins[1] }, { DIEWISH_STAGING_USER_API_ORIGIN: origins[0] },
    { DIEWISH_STAGING_USER_API_ORIGIN: 'https://evil.invalid' }, { DIEWISH_STAGING_USER_API_ORIGIN: origins[1] + '/api' },
    { DIEWISH_STAGING_USER_API_ORIGIN: 'https://diewish-backend-staging-2qqqfr7wzq-ew.a.run.app' },
    { NEXT_PUBLIC_API_BASE_URL: 'https://staging.diewish.com/api' }, { DIEWISH_STAGING_HOST_ROUTING_ENABLED: 'TRUE' },
  ]) for (const host of hosts) assert.deepEqual(routes.stagingApiRoute(host, '/api/auth/login', '', null, { ...env, ...values }), { status: 503 });
});
test('API encoding/authority tricks cannot escape a fixed origin', () => {
  for (const pathname of ['/api/%2f%2fevil.invalid', '/api/%5c..', '/api/hello%00', '/api/hello%0d%0a', '//evil.invalid/api', '/api\\evil']) {
    assert.deepEqual(routes.stagingApiRoute(hosts[0], pathname, '', null, env), { status: 400 });
  }
  withEnv(env, () => {
    for (const pathname of ['/%61pi/auth/me', '/a%70i/auth/me', '/api%2fauth/me']) {
      assert.equal(middleware(new NextRequest(`https://${hosts[0]}${pathname}`, { headers: { host: hosts[0] } })).status, 400);
    }
  });
});
test('Admin presentation/SSR headers and reset page stay isolated', () => withEnv(env, () => {
  for (const [pathname, destination] of [['/', '/admin'], ['/login', '/admin/login'], ['/dashboard', '/admin']]) {
    const response = middleware(new NextRequest('https://evil.invalid' + pathname, { headers: { host: hosts[0], 'x-forwarded-host': 'evil.invalid' } }));
    assert.equal(response.headers.get('location'), `https://${hosts[0]}${destination}`);
  }
  for (const pathname of ['/admin/login', '/admin/reset-password', '/_next/static/a.js']) {
    const response = middleware(new NextRequest(`https://${hosts[0]}${pathname}`, { headers: { host: hosts[0], 'x-forwarded-host': hosts[1] } }));
    assert.equal(response.headers.get('x-middleware-next'), '1');
    assert.equal(response.headers.get('x-middleware-request-x-forwarded-host'), hosts[0]);
  }
}));
test('Disabled/absent flag preserves existing rewrite and production-Admin block', () => {
  assert.equal(routes.routingEnabled({}), false);
  assert.equal(routes.routingEnabled({ DIEWISH_STAGING_HOST_ROUTING_ENABLED: 'false' }), false);
  withEnv({}, () => {
    const response = middleware(new NextRequest(`https://${hosts[0]}/api/auth/refresh-token`, { headers: { host: hosts[0] } }));
    assert.equal(response.headers.get('x-middleware-next'), '1');
    assert.equal(response.headers.get('x-middleware-rewrite'), null);
    assert.equal(middleware(new NextRequest('https://admin.diewish.com/login', { headers: { host: 'admin.diewish.com' } })).status, 404);
  });
});
