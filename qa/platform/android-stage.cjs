'use strict';
const c = require('./contract.cjs');
// Only fixed stage names/statuses/timings leave the process. Never raw errors,
// URLs, DOM content, shell output, identities or request/response material.
async function stage(name, milliseconds, operation) {
  if (!/^[A-Z][A-Z0-9_]{0,70}$/.test(name) || !Number.isInteger(milliseconds) || milliseconds < 1 || milliseconds > 600000) throw new Error('INVALID_ANDROID_STAGE');
  const started = Date.now();
  const log = status => console.log('ANDROID_STAGE', name, status, Date.now() - started);
  log('RUNNING');
  let timer;
  try {
    const result = await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new c.Blocked('ANDROID_' + name + '_TIMEOUT')), milliseconds); }),
    ]);
    log('PASS');
    return result;
  } catch (error) {
    const timeout = error?.code === 'ANDROID_' + name + '_TIMEOUT' || error?.name === 'TimeoutError' || error?.code === 'ETIMEDOUT';
    log(timeout ? 'TIMEOUT' : 'FAIL');
    if (timeout) throw new c.Blocked('ANDROID_' + name + '_TIMEOUT');
    throw error;
  } finally { clearTimeout(timer); }
}
module.exports = { stage };
