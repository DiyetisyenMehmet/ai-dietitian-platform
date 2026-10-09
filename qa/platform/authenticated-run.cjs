'use strict';
// The protected environment supplies the password. Derived identity/key stay in
// process memory and child environment; no GitHub output, env file or artifact.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const c = require('./contract.cjs');
const { preflight } = require('./account-preflight.cjs');
function command(args) {
  const [kind, first, second] = args;
  if (kind === 'web' && args.length === 2 && ['chromium', 'webkit'].includes(first)) return [process.execPath, ['qa/platform/runtime.cjs', kind, first]];
  if (kind === 'android' && args.length === 1) return [process.execPath, ['qa/platform/runtime.cjs', kind]];
  if (kind === 'ios' && args.length === 1) return ['bash', ['qa/platform/ios-run.sh']];
  if (kind === 'ios-live' && args.length === 1) return ['bash', ['qa/platform/ios-live.sh']];
  if (['sync', 'sync-manual'].includes(kind) && args.length === 3 && c.PLATFORMS[first] && c.PLATFORMS[second] && first !== second) {
    if (kind === 'sync' && [first, second].includes('ios')) throw new c.Blocked('USE_MANUAL_HARNESS_FOR_IOS');
    return [process.execPath, ['qa/platform/' + (kind === 'sync' ? 'sync-auto.cjs' : 'sync-manual.cjs'), first, second]];
  }
  throw new c.Blocked('UNSUPPORTED_AUTHENTICATED_COMMAND');
}
async function main(cliArgs = process.argv.slice(2)) {
  const [program, args] = command(cliArgs);
  const android = cliArgs[0] === 'android';
  const authenticated = process.env.QA_AUTHENTICATED_REQUIRED === 'YES' || Boolean(process.env.QA_EMAIL);
  if (authenticated) {
    if (android) await require('./android-stage.cjs').stage('ACCOUNT_PREFLIGHT', 65000, () => preflight());
    else await preflight();
    c.credentials();
    process.env.QA_ACCOUNT_PREFLIGHT_COMPLETE = 'YES';
    console.log('QA_ACCOUNT_VERIFIED');
  }
  if (android) console.log('ANDROID_STAGE RUNTIME_PROCESS RUNNING');
  const result = spawnSync(program, args, { cwd: c.ROOT, env: process.env, stdio: 'inherit', ...(android ? { timeout: 480000, killSignal: 'SIGKILL' } : {}) });
  if (android) console.log('ANDROID_STAGE RUNTIME_PROCESS', result.error?.code === 'ETIMEDOUT' ? 'TIMEOUT' : result.status === 0 ? 'PASS' : 'FAIL');
  if (result.error) throw new c.Blocked(android && result.error.code === 'ETIMEDOUT' ? 'ANDROID_RUNTIME_PROCESS_TIMEOUT' : 'QA_CHILD_PROCESS_FAILED');
  // Validate while the derived private values are still available to the scanner.
  if (fs.existsSync(path.join(c.ROOT, '.qa-artifacts'))) {
    require('./verify-artifacts.cjs').verify(path.join(c.ROOT, '.qa-artifacts'));
  }
  process.exitCode = result.status ?? 2;
}
if (require.main === module) main().catch(error => { console.error(c.errorCode(error)); process.exitCode = 2; });
module.exports = { command, main };
