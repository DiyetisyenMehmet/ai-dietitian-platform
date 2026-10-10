'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openList } = require('./coach-list.cjs');
function fixture(initiallyOpen = false) {
  let reveal, unavailable;
  const readiness = new Promise((resolve, reject) => { reveal = resolve; unavailable = reject; });
  const state = { visible: initiallyOpen, clicks: 0, waits: 0, loaded: false };
  const list = { first() { return this; }, isVisible: async () => state.visible, waitFor: async () => { assert.equal(state.visible, true, 'LIST_NOT_OPEN'); } };
  const button = { waitFor: async () => { state.waits++; await readiness; }, click: async () => { state.clicks++; state.visible = true; } };
  const loading = { first() { return this; }, waitFor: async () => { state.loaded = true; } };
  return { state, reveal, unavailable, page: { locator: () => list, getByRole: () => button, getByText: () => loading } };
}
test('a late-mounted history control is awaited before opening the target list', async () => {
  const f = fixture();
  const opening = openList(f.page);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.state.clicks, 0);
  assert.equal(f.state.loaded, false);
  f.reveal();
  await opening;
  assert.equal(f.state.visible, true);
  assert.equal(f.state.clicks, 1);
  assert.equal(f.state.loaded, true);
});
test('an already-open history list is preserved rather than toggled closed', async () => {
  const f = fixture(true);
  await openList(f.page);
  assert.equal(f.state.clicks, 0);
  assert.equal(f.state.waits, 0);
  assert.equal(f.state.visible, true);
  assert.equal(f.state.loaded, true);
});
test('unavailable history controls propagate failure without claiming the list loaded', async () => {
  const f = fixture();
  const opening = openList(f.page);
  const error = new Error('SYNTHETIC_CONTROL_UNAVAILABLE');
  f.unavailable(error);
  await assert.rejects(opening, value => value === error);
  assert.equal(f.state.clicks, 0);
  assert.equal(f.state.loaded, false);
});
