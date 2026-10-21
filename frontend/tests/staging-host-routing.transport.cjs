// Real built Next server + isolated HTTPS fixtures. No DB or cloud calls.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const https = require('node:https');
const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const tags = ['admin-legacy', 'diewish-test2'].map(t => `${t}---diewish-backend-staging-2qqqfr7wzq-ew.a.run.app`);
const hosts = ['admin-staging.diewish.com', 'staging.diewish.com'];
const delay = ms => new Promise(r => setTimeout(r, ms));
function request(port, host, url, { method = 'GET', body = '', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: url, method,
      headers: { host, origin: `https://${host}`, ...headers } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject); req.end(body);
  });
}
test('Built Next runtime routes complete Admin and normal API traffic, cookies, bodies and failures', { timeout: 120000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'diewish-routing-'));
  let child; let fixture;
  try {
    const key = path.join(temp, 'key.pem'), cert = path.join(temp, 'cert.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-keyout', key, '-out', cert, '-subj', '/CN=synthetic-routing',
      '-addext', 'subjectAltName=' + tags.map(h => 'DNS:' + h).join(',')], { stdio: 'ignore' });
    const received = [];
    fixture = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        const backend = tags.indexOf(req.headers.host);
        received.push({ backend, url: req.url, body: Buffer.concat(chunks).toString(), headers: req.headers });
        if (req.url === '/api/fixture-failure') { res.writeHead(503); res.end('synthetic failure'); return; }
        if (req.url.endsWith('/logout')) res.setHeader('set-cookie', 'diewish_refresh=; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
        else res.setHeader('set-cookie', `diewish_refresh=synthetic-${backend}; Path=/api/auth; HttpOnly; Secure; SameSite=Lax`);
        res.setHeader('content-type', 'application/json');
        res.statusCode = req.url === '/api/auth/me' && !req.headers.authorization ? 401 : 200;
        res.end(JSON.stringify({ backend }));
      });
    });
    fixture.listen(0, '127.0.0.1'); await once(fixture, 'listening');
    const tlsPort = fixture.address().port;
    const preload = path.join(temp, 'loopback-only.cjs');
    fs.writeFileSync(preload, `const tls = require('node:tls');
const original = tls.connect;
const hosts = ${JSON.stringify(tags)};
tls.connect = function (...args) {
  if (args[0] && typeof args[0] === 'object' && hosts.includes(args[0].host)) {
    const remote = args[0].host;
    args[0] = { ...args[0], host: '127.0.0.1', port: ${tlsPort}, servername: remote };
  }
  return original.apply(this, args);
};\n`);
    const allocator = net.createServer(); allocator.listen(0, '127.0.0.1'); await once(allocator, 'listening');
    const port = allocator.address().port; await new Promise(r => allocator.close(r));
    const logs = [];
    child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
      cwd: path.join(__dirname, '..'), env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1',
        NODE_OPTIONS: `--require=${preload}`, NODE_EXTRA_CA_CERTS: cert,
        DIEWISH_STAGING_HOST_ROUTING_ENABLED: 'true', NEXT_PUBLIC_API_BASE_URL: '/api',
        DIEWISH_STAGING_ADMIN_API_ORIGIN: `https://${tags[0]}`,
        DIEWISH_STAGING_USER_API_ORIGIN: `https://${tags[1]}`,
      }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', c => logs.push(c.toString())); child.stderr.on('data', c => logs.push(c.toString()));
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error('Next exited before readiness: ' + logs.join(''));
      try { const r = await request(port, 'evil.invalid', '/api/ready'); if (r.status === 421) { ready = true; break; } } catch {}
      await delay(100);
    }
    assert.ok(ready, 'Next server did not start with runtime isolation enabled: ' + logs.join(''));
    const paths = ['/api/admin/auth/login', '/api/admin/auth/password/forgot', '/api/admin/auth/password/verify',
      '/api/admin/auth/password/reset', '/api/auth/register', '/api/auth/login', '/api/auth/me',
      '/api/auth/refresh-token', '/api/auth/logout', '/api/auth/forgot-password', '/api/auth/reset-password',
      '/api/admin/users', '/api/account/preferences', '/api/arbitrary.json'];
    for (let backend = 0; backend < hosts.length; backend++) {
      for (const url of paths) {
        const response = await request(port, hosts[backend], url, { method: 'POST', body: '{"synthetic":true}', headers: {
          'content-type': 'application/json', cookie: `diewish_refresh=synthetic-${backend}`, authorization: 'Bearer synthetic',
          'x-forwarded-host': hosts[1-backend], forwarded: `host=${hosts[1-backend]}`,
          'x-middleware-subrequest': 'middleware:middleware:middleware:middleware:middleware',
        } });
        assert.equal(response.status, 200, `${url}: ${response.body}`);
        assert.equal(JSON.parse(response.body).backend, backend, url);
        const last = received.at(-1);
        assert.equal(last.body, '{"synthetic":true}');
        assert.equal(last.headers.cookie, `diewish_refresh=synthetic-${backend}`);
        assert.equal(last.headers.authorization, 'Bearer synthetic');
        assert.equal(last.headers['x-forwarded-host'], hosts[backend]);
        assert.equal(last.headers.forwarded, undefined);
        assert.equal(last.headers['x-middleware-subrequest'], undefined);
        const cookie = response.headers['set-cookie'][0];
        assert.match(cookie, /Path=\/api\/auth/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/);
        assert.doesNotMatch(cookie, /Domain=/i);
        if (url.endsWith('/logout')) assert.match(cookie, /Max-Age=0/);
      }
      const unauth = await request(port, hosts[backend], '/api/auth/me');
      assert.equal(unauth.status, 401);
      const failureCount = received.length;
      assert.equal((await request(port, hosts[backend], '/api/fixture-failure')).status, 503);
      assert.equal(received.length, failureCount + 1, 'No retry/fallback to the other database');
    }
    const count = received.length;
    assert.equal((await request(port, 'evil.invalid', '/api/auth/me', { headers: { 'x-forwarded-host': hosts[0] } })).status, 421);
    assert.equal((await request(port, hosts[1], '/api/auth/refresh-token', { method: 'POST', headers: { origin: `https://${hosts[0]}` } })).status, 403);
    assert.equal(received.length, count, 'Rejected requests must not reach either backend');
    for (const page of ['/admin/login', '/admin/reset-password']) {
      const response = await request(port, hosts[0], page);
      assert.equal(response.status, 200, page);
    }
    assert.equal((await request(port, hosts[0], '/login')).headers.location, `https://${hosts[0]}/admin/login`);
  } finally {
    if (child && child.exitCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); }
    if (fixture) { fixture.closeAllConnections(); await new Promise(r => fixture.close(r)); }
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
