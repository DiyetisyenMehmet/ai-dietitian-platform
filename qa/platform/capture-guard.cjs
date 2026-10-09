'use strict';
const fs = require('node:fs');
const path = require('node:path');
const c = require('./contract.cjs');
const script = fs.readFileSync(path.join(__dirname,'evidence-mask.js'),'utf8');
const proofs = new Set();
function prove(file) { proofs.add(path.resolve(file)); }
function proven(file) { return proofs.has(path.resolve(file)); }
function failClosed() {
  const root=path.join(c.ROOT,'.qa-artifacts'); fs.mkdirSync(root,{recursive:true});
  fs.writeFileSync(path.join(root,'.health-guard-failed'),'HEALTH_DATA_SCREENSHOT_GUARD_FAIL');
  console.error('HEALTH_DATA_SCREENSHOT_GUARD FAIL');
  return new c.Blocked('HEALTH_DATA_SCREENSHOT_GUARD_FAIL');
}
async function guardedCapture(page,file,screenshot) {
  let bytes;
  try {
    await page.evaluate(script);
    if (!await page.evaluate(() => window.__diewishEvidenceMask.begin())) throw failClosed();
    if (!await page.evaluate(() => window.__diewishEvidenceMask.active())) throw failClosed();
    // No unguarded PNG is ever written. Native APIs return the actual device
    // screenshot bytes; they are committed only after the post-capture check.
    bytes=await screenshot();
    if (!await page.evaluate(() => window.__diewishEvidenceMask.active())) throw failClosed();
    if (!Buffer.isBuffer(bytes)) throw failClosed();
  } catch (error) {
    fs.rmSync(file,{force:true});
    throw error instanceof c.Blocked && error.code==='CREDENTIAL_SCREENSHOT_REFUSED' ? error : failClosed();
  } finally {
    try { if (!await page.evaluate(() => window.__diewishEvidenceMask?.restore() === true)) throw failClosed(); }
    catch (_) { bytes=null; fs.rmSync(file,{force:true}); throw failClosed(); }
  }
  fs.writeFileSync(file,bytes,{mode:0o600}); prove(file);
  console.log('HEALTH_DATA_SCREENSHOT_GUARD PASS');
}
module.exports={guardedCapture,prove,proven,failClosed};
