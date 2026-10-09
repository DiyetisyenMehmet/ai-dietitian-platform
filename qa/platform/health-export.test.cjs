'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const c=require('./contract.cjs');
const {verify}=require('./verify-artifacts.cjs');
test('iOS attachment without a native capture guard is rejected before copy/export',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qa-ios-health-'));
  const run='fixture-ios-guard-'+Date.now();
  try{
    fs.writeFileSync(path.join(dir,'fixture.png'),Buffer.from([137,80,78,71,13,10,26,10]));
    fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify([{attachments:[{suggestedHumanReadableName:'login-ios-simulator',exportedFileName:'fixture.png'}]}]));
    const result=spawnSync(process.execPath,['qa/platform/ios-evidence.cjs',dir,'0'],{cwd:c.ROOT,env:{PATH:process.env.PATH,QA_RUN_ID:run},encoding:'utf8'});
    assert.notEqual(result.status,0);
    assert.equal(fs.existsSync(path.join(c.ROOT,'.qa-artifacts',run,'ios','ios-simulator','login-ios-simulator.png')),false);
    assert.throws(()=>verify(path.join(c.ROOT,'.qa-artifacts')));
  }finally{fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(path.join(c.ROOT,'.qa-artifacts',run),{recursive:true,force:true});fs.rmSync(path.join(c.ROOT,'.qa-artifacts','.health-guard-failed'),{force:true});}
});
test('a screenshot cannot be added to a scenario solely because a PNG exists',()=>{
  const e=c.createEvidence('android','android-emulator','fixture');
  try{
    fs.writeFileSync(path.join(e.dir,'fixture.png'),Buffer.from([137,80,78,71,13,10,26,10]));
    assert.throws(()=>e.record('fixture','PASS',{screenshot:'fixture.png'}),/HEALTH_DATA_SCREENSHOT_GUARD_FAIL/);
  }finally{fs.rmSync(path.join(c.ROOT,'.qa-artifacts',e.run),{recursive:true,force:true});}
});

test('opaque preparation shield is rejected as runtime evidence without exporting PNG',async()=>{
  const guard=require('./capture-guard.cjs');
  const shield=Buffer.from([38,59,53,38,59,53]);
  try {assert.throws(()=>guard.rejectShieldPixels(shield,{width:2,height:1,channels:3}),{code:'HEALTH_DATA_SCREENSHOT_GUARD_FAIL'});}
  finally {fs.rmSync(path.join(c.ROOT,'.qa-artifacts','.health-guard-failed'),{force:true});}
});
