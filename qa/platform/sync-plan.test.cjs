const { test } = require('node:test');
const assert = require('node:assert/strict');
const { syncPlan, CHECKPOINTS, PLATFORMS } = require('./sync-plan.cjs');
const c = require('./contract.cjs');
const alias = c.accountAlias('synthetic', 'x'.repeat(32));
test('all six directed platform combinations preserve five ordered checkpoints', () => {
  const directions = [];
  for (const source of PLATFORMS) for (const target of PLATFORMS) {
    if (source === target) { assert.throws(() => syncPlan(source, target, alias)); continue; }
    const plan = syncPlan(source, target, alias);
    directions.push(source + '-to-' + target);
    assert.deepEqual(plan.checkpoints, CHECKPOINTS);
    assert.equal(plan.productVerdict, 'NOT_ASSESSED');
    assert.equal(plan.serverConversationId, null);
    assert.equal(plan.alias, alias);
  }
  assert.equal(new Set(directions).size, 6);
});
test('unknown platforms and raw account IDs are refused', () => {
  assert.throws(() => syncPlan('iphone-viewport', 'web', alias));
  assert.throws(() => syncPlan('web', 'ios', 'synthetic'));
});
