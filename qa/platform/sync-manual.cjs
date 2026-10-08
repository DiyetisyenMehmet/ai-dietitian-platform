'use strict';
// Interactive observer for all six directions. Platforms stay open together.
// Operator performs UI actions; this worker records observations, never a product verdict.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const readline = require('node:readline/promises');
const c = require('./contract.cjs');
const { syncPlan, CHECKPOINTS } = require('./sync-plan.cjs');
const { openRuntime, login, openList, capture } = require('./runtime.cjs');
async function main() {
  const [source, target] = process.argv.slice(2);
  const user = c.credentials();
  const plan = syncPlan(source, target, c.accountAlias(user.id));
  // This preflight verifies the same expected account for the manual iOS runtime.
  await require('./account-preflight.cjs').preflight();
  process.env.QA_RUN_ID ||= plan.id;
  const io = readline.createInterface({ input: process.stdin, output: process.stdout });
  const runtime = target === 'ios' ? null : await openRuntime(target);
  if (runtime) { const alias = await login(runtime.page); if (alias !== plan.alias) throw new c.Blocked('CROSS_PLATFORM_ACCOUNT_MISMATCH'); await runtime.page.goto(c.ORIGIN + '/ai'); await openList(runtime.page); }
  const e = c.createEvidence(target, runtime?.runtime || 'ios-simulator', runtime?.device || 'iPhone-Simulator');
  try {
    console.log('Direction: ' + source + ' -> ' + target + '. Keep the TARGET list open before creating the SOURCE conversation.');
    console.log('Synthetic message marker: ' + plan.marker);
    console.log('On iOS, use the same approved QA account; verify the account privately. Do not paste a token, email or password.');
    const id = (await io.question('After a successful SOURCE message, enter only the server conversation ID: ')).trim();
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) throw new c.Blocked('SERVER_CONVERSATION_ID_REQUIRED');
    for (const checkpoint of CHECKPOINTS) {
      console.log('Perform target checkpoint: ' + checkpoint + '. For already-open, do not reload/reopen first.');
      const answer = (await io.question('Is the marker visible? yes / no / blocked: ')).trim();
      if (!['yes', 'no', 'blocked'].includes(answer)) throw new c.Blocked('INVALID_OBSERVATION');
      if (answer === 'blocked') { e.record('sync-' + checkpoint, 'BLOCKED', { alias: plan.alias, conversationId: id, direction: source + '-to-' + target, code: 'OPERATOR_CHECKPOINT_BLOCKED' }); continue; }
      let screenshot;
      if (target === 'ios') {
        const udid = process.env.QA_IOS_UDID;
        if (!/^[A-Fa-f0-9-]{36}$/.test(udid || '') || process.platform !== 'darwin') throw new c.Blocked('BOOTED_IOS_SIMULATOR_REQUIRED');
        screenshot = 'sync-' + checkpoint + '-ios-simulator.png';
        execFileSync('xcrun', ['simctl', 'io', udid, 'screenshot', path.join(e.dir, screenshot)], { stdio: 'ignore' });
      } else screenshot = await capture(runtime, e, 'sync-' + checkpoint);
      e.record('sync-' + checkpoint, 'PASS', { alias: plan.alias, observed: answer === 'yes', conversationId: id, direction: source + '-to-' + target, screenshot });
    }
  } finally { io.close(); if (runtime) await runtime.close(); }
}
main().catch(error => { console.error(c.errorCode(error)); process.exitCode = 2; });
