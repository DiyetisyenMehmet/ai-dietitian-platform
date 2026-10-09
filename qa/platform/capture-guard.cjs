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
async function rejectPreparationShield(bytes) {
  // This is a narrow paint-integrity check, not OCR or semantic health scanning.
  const sharp=require('../../frontend/node_modules/sharp');
  const {data,info}=await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});
  return rejectShieldPixels(data,info);
}
function rejectShieldPixels(data,info) {
  let shield=0;
  for(let i=0;i<data.length;i+=info.channels) if(data[i]===38 && data[i+1]===59 && data[i+2]===53) shield++;
  if(shield>info.width*info.height*0.8) throw failClosed();
}
async function guardedCapture(page,file,screenshot) {
  let bytes;
  let phase='BOOTSTRAP';
  try {
    await page.evaluate(script);
    phase='PREPARE';
    if (!await page.evaluate(() => window.__diewishEvidenceMask.begin())) throw failClosed();
    phase='PRE_CAPTURE';
    if (!await page.evaluate(() => window.__diewishEvidenceMask.active())) throw failClosed();
    // No unguarded PNG is ever written. Native APIs return the actual device
    // screenshot bytes; they are committed only after the post-capture check.
    phase='CAPTURE'; bytes=await screenshot(); phase='POST_CAPTURE';
    if (!await page.evaluate(() => window.__diewishEvidenceMask.active())) throw failClosed();
    if (!Buffer.isBuffer(bytes)) throw failClosed();
    phase='PAINT_CHECK'; await rejectPreparationShield(bytes);
  } catch (error) {
    const reason=await page.evaluate(()=>window.__diewishEvidenceMask?.reason?.() || 'NONE').catch(()=>'NONE');
    const fontDetail=await page.evaluate(()=>window.__diewishEvidenceMask?.fontDetail?.() || 'NONE').catch(()=>'NONE');
    if(/^(?:FONT_(?:LOADING|COUNT|REFERENCE|PROPERTIES|GEOMETRY|FAMILY|STYLE|WEIGHT|STRETCH|UNICODE_RANGE|VARIANT|FEATURES|STATUS)|FONT_STATUS_(?:UNLOADED|LOADING|LOADED|ERROR)_(?:UNLOADED|LOADING|LOADED|ERROR))$/.test(fontDetail)) console.error('HEALTH_GUARD_FONT_DETAIL',fontDetail);
    console.error('HEALTH_DATA_SCREENSHOT_GUARD_PHASE',phase,['NONE','VIEWPORT_CHANGED','DOCUMENT_MUTATION','FONT_CHANGED','MASK_NOT_ACTIVE','PREPARE_FAILED'].includes(reason)?reason:'OTHER');
    fs.rmSync(file,{force:true});
    throw error instanceof c.Blocked && error.code==='CREDENTIAL_SCREENSHOT_REFUSED' ? error : failClosed();
  } finally {
    try { if (!await page.evaluate(() => window.__diewishEvidenceMask?.restore() === true)) throw failClosed(); }
    catch (_) { bytes=null; fs.rmSync(file,{force:true}); throw failClosed(); }
  }
  fs.writeFileSync(file,bytes,{mode:0o600}); prove(file);
  console.log('HEALTH_DATA_SCREENSHOT_GUARD PASS');
}
module.exports={guardedCapture,prove,proven,failClosed,rejectPreparationShield,rejectShieldPixels};
