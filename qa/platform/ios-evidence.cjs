'use strict';
const fs = require('node:fs');
const path = require('node:path');
const c = require('./contract.cjs');
const e = c.createEvidence('ios', 'ios-simulator', 'iPhone-Simulator');
if (process.argv[2] === 'build-failed') { e.record('simulator-build', 'FAIL', { code: 'XCODE_BUILD_FAILED' }); process.exit(1); }
e.record('simulator-build', 'PASS', { appVersion: '0.1.0' });
const dir = path.resolve(process.argv[2]);
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
let alias = null;
try { alias = c.accountAlias(c.credentials().id); } catch { /* Public runtime only. */ }
const names = new Set(['login', 'dashboard', 'coach-list', 'notification-preferences', 'profile', 'session-relaunch']);
const seen = new Set();
for (const test of manifest) {
  for (const attachment of test.attachments || []) {
    const human = attachment.suggestedHumanReadableName || '';
    const scenario = [...names].find(n => human === n + '-ios-simulator' || human.startsWith(n + '-ios-simulator.'));
    const source = path.resolve(dir, attachment.exportedFileName || '');
    if (!scenario || !source.startsWith(dir + path.sep) || !source.endsWith('.png')) continue;
    if (scenario !== 'login' && !alias) continue;
    const name = scenario + '-ios-simulator.png';
    fs.copyFileSync(source, path.join(e.dir, name));
    e.record(scenario === 'login' ? 'login-surface' : scenario, 'PASS', { appVersion: '0.1.0', alias: scenario === 'login' ? null : alias, screenshot: name });
    seen.add(scenario);
  }
}
if (!seen.has('login')) e.record('login-surface', 'FAIL', { code: 'IOS_LOGIN_EVIDENCE_MISSING' });
for (const name of [...names].filter(n => n !== 'login' && !seen.has(n))) e.record(name, alias ? 'FAIL' : 'BLOCKED', { alias, code: alias ? 'IOS_SCREEN_EVIDENCE_MISSING' : 'TEST_ACCOUNT_SECRETS_REQUIRED' });
if (Number(process.argv[3]) !== 0) e.record('ios-ui-tests', 'FAIL', { code: 'XCTEST_FAILED' });
if (!seen.has('login') || (alias && seen.size !== names.size)) process.exitCode = 1;
