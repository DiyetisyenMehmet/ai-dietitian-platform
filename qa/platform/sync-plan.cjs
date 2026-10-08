'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const c = require('./contract.cjs');
const PLATFORMS = ['web', 'android', 'ios'];
const CHECKPOINTS = ['already-open', 'list-reopen', 'refresh', 'relaunch', 'logout-login'];
function syncPlan(source, target, alias) {
  if (!PLATFORMS.includes(source) || !PLATFORMS.includes(target) || source === target) throw new c.Blocked('INVALID_SYNC_DIRECTION');
  if (!/^qa-[a-f0-9]{24}$/.test(alias)) throw new c.Blocked('VERIFIED_ACCOUNT_ALIAS_REQUIRED');
  const id = 'sync-' + crypto.randomBytes(8).toString('hex');
  return { schemaVersion: 1, id, source, target, alias, marker: 'QA-' + id, serverConversationId: null, checkpoints: CHECKPOINTS, productVerdict: 'NOT_ASSESSED' };
}
function privatePlan(plan) {
  const dir = path.join(c.ROOT, '.qa-private');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, plan.id + '.json');
  fs.writeFileSync(file, JSON.stringify(plan, null, 2), { mode: 0o600 });
  return file;
}
module.exports = { PLATFORMS, CHECKPOINTS, syncPlan, privatePlan };
