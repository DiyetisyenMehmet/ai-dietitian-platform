// CI-only TLS fixture: real local Next build, synthetic guest API, no remote backend.
const https = require('node:https');
const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
let released = false;
https.createServer({ key: fs.readFileSync(process.env.LAUNCH_FIXTURE_KEY), cert: fs.readFileSync(process.env.LAUNCH_FIXTURE_CERT) }, async (req, res) => {
  if (req.url === '/__reset' || req.url === '/__release') {
    released = req.url === '/__release'; res.end('ok'); return;
  }
  if (req.url.startsWith('/api/')) {
    const deadline = Date.now() + 40000;
    if (req.url.includes('/auth/refresh-token')) while (!released && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED', message: 'Synthetic CI guest' } })); return;
  }
  const upstream = http.request({ hostname: '127.0.0.1', port: 3019, path: req.url, method: req.method, headers: { host: '127.0.0.1:3019', 'accept-encoding': 'identity' } }, response => {
    res.writeHead(response.statusCode, response.headers); response.pipe(res);
  });
  upstream.on('error', () => { res.writeHead(502); res.end(); }); req.pipe(upstream);
}).listen(3021, '0.0.0.0');
// Hold initial CONNECT requests until instrumentation installs its fixture
// interceptor; this proxy never opens an upstream connection.
net.createServer(socket => { socket.on('error', () => {}); socket.on('data', () => {}); }).listen(3020, '0.0.0.0');
