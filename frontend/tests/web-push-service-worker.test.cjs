const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { URL } = require('node:url');

function loadWorker({ existing = [] } = {}) {
  const listeners = {};
  const shown = [];
  const opened = [];
  const messages = [];
  const windows = [];
  const self = {
    location: { origin: 'https://staging.diewish.com' },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    registration: {
      async getNotifications() {
        return existing;
      },
      async showNotification(title, options) {
        shown.push({ title, options });
      },
    },
    clients: {
      async matchAll() {
        return windows;
      },
      async openWindow(target) {
        opened.push(target);
      },
    },
  };
  const source = fs.readFileSync(
    path.join(__dirname, '../public/diewish-push-sw.js'),
    'utf8',
  );
  vm.runInNewContext(source, { self, URL, Set, Object, Promise });
  return { listeners, shown, opened, messages, windows };
}

async function push(worker, payload) {
  let pending = Promise.resolve();
  worker.listeners.push({
    data: payload === undefined ? null : { json: () => payload },
    waitUntil(value) {
      pending = Promise.resolve(value);
    },
  });
  await pending;
}

test('unknown web push type uses dashboard fallback and malformed payload is ignored', async () => {
  const worker = loadWorker();
  await push(worker, {
    data: {
      notificationId: 'n-1',
      type: 'UNKNOWN_TYPE',
      title: 'Diewish',
      body: 'Test',
    },
  });
  assert.equal(worker.shown.length, 1);
  assert.equal(worker.shown[0].options.data.target, '/dashboard');

  await push(worker, { data: { type: 'PROACTIVE_MESSAGE' } });
  assert.equal(worker.shown.length, 1);
});

test('known web push type maps to safe route and duplicate tag is suppressed', async () => {
  const worker = loadWorker();
  await push(worker, {
    data: {
      notificationId: 'n-2',
      type: 'PROACTIVE_MESSAGE',
      title: 'Diewish',
      body: 'Koç mesajı',
    },
  });
  assert.equal(worker.shown[0].options.data.target, '/ai');

  const duplicate = loadWorker({ existing: [{ tag: 'diewish-n-2' }] });
  await push(duplicate, {
    data: {
      notificationId: 'n-2',
      type: 'PROACTIVE_MESSAGE',
      title: 'Diewish',
      body: 'Koç mesajı',
    },
  });
  assert.equal(duplicate.shown.length, 0);
});

test('notification click rejects arbitrary target and opens dashboard', async () => {
  const worker = loadWorker();
  let pending = Promise.resolve();
  worker.listeners.notificationclick({
    notification: {
      data: { target: 'https://evil.invalid' },
      close() {},
    },
    waitUntil(value) {
      pending = Promise.resolve(value);
    },
  });
  await pending;
  assert.deepEqual(worker.opened, ['/dashboard']);
});
