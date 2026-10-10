'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { stage } = require('./sync-stage.cjs');
async function output(operation) {
  const original = console.log, lines = [];
  console.log = (...args) => lines.push(args.join(' '));
  try { await operation(lines); } finally { console.log = original; }
}
test('sync diagnostics preserve results without emitting private operation values', async () => output(async lines => {
  const value = { private: 'synthetic-private-value' };
  assert.equal(await stage('SOURCE_AUTH_FORM_FILL', async () => value), value);
  assert.deepEqual(lines, ['SYNC_STAGE SOURCE_AUTH_FORM_FILL RUNNING', 'SYNC_STAGE SOURCE_AUTH_FORM_FILL PASS']);
}));
test('sync diagnostics preserve failures without emitting private error messages', async () => output(async lines => {
  const error = new Error('synthetic-private-error');
  await assert.rejects(stage('SOURCE_CREATE', async () => { throw error; }), value => value === error);
  assert.deepEqual(lines, ['SYNC_STAGE SOURCE_CREATE RUNNING', 'SYNC_STAGE SOURCE_CREATE FAIL']);
}));
test('unknown sync stages are refused before invoking operations or logging', async () => output(async lines => {
  let invoked = false;
  await assert.rejects(stage('synthetic-private-stage', async () => { invoked = true; }), /SYNC_STAGE_INVALID/);
  assert.equal(invoked, false);
  assert.deepEqual(lines, []);
}));
