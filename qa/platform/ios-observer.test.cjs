'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const shell = fs.readFileSync(path.join(__dirname, '../../ios/DiewishQA/ShellViewController.swift'), 'utf8');
const script = shell.match(/WKUserScript\(source: """([\s\S]*?)"""/)[1];
async function observe(url, body, status = 200) {
  const messages = [];
  const original = Promise.resolve(new Response(JSON.stringify(body), { status }));
  const window = { fetch: () => original, webkit: { messageHandlers: { diewishIOS: { postMessage: m => messages.push(JSON.parse(JSON.stringify(m))) } } } };
  vm.runInNewContext(script, { window, URL, location: { href: 'https://staging.diewish.com/dashboard', origin: 'https://staging.diewish.com' } });
  assert.equal(window.fetch(url), original, 'observer must preserve the original fetch promise');
  await new Promise(resolve => setTimeout(resolve, 25));
  return messages;
}
test('iOS observer sends only verified identity fields, never tokens', async () => {
  const body = { data: { user: { id: 'synthetic-id', email: 'synthetic@example.invalid' }, tokens: { accessToken: 'never-forward' } } };
  assert.deepEqual(await observe('/api/auth/login', body), [{ version: 1, operation: 'qa-account', id: 'synthetic-id' }]);
  assert.deepEqual(await observe('https://other.example/api/auth/login', body), []);
  assert.deepEqual(await observe('/api/tracking/meals', body), []);
});
test('iOS observer clears identity on logout and unauthorized response', async () => {
  assert.deepEqual(await observe('/api/auth/logout', {}), [{ version: 1, operation: 'qa-logout' }]);
  assert.deepEqual(await observe('/api/auth/me', {}, 401), [{ version: 1, operation: 'qa-logout' }]);
});
