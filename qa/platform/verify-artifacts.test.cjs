const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { verify } = require('./verify-artifacts.cjs');
test('export rejects cookies, arbitrary logs, symlinks and disguised images', () => {
  for (const type of ['storage.json', 'runtime.log', 'fake.png', 'link.png']) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-export-'));
    try {
      if (type === 'link.png') fs.symlinkSync('/etc/passwd', path.join(dir, type));
      else fs.writeFileSync(path.join(dir, type), type === 'storage.json' ? '{"cookies":[{"value":"secret"}]}' : 'not-a-PNG');
      assert.throws(() => verify(dir));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});
test('raw identity and bearer secrets are refused before export', () => {
  for (const raw of ['{"email":"private@example.invalid"}', '{"log":"Bearer sample"}', '{"token":"eyJhbGciOiJIUzI1NiJ9.abcdefgh.signature"}']) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-export-'));
    try { fs.writeFileSync(path.join(dir, 'record.json'), raw); assert.throws(() => verify(dir)); }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});
test('valid PNG bytes alone cannot prove masking; orphan and unguarded images are refused',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qa-health-export-'));
  try {
    fs.writeFileSync(path.join(dir,'fixture.png'),Buffer.from([137,80,78,71,13,10,26,10]));
    assert.throws(()=>verify(dir),/UNGUARDED_SCREENSHOT_EXPORT_REFUSED/);
    const row={platform:'web',runtime:'chromium',productVerdict:'NOT_ASSESSED',stagingOrigin:'https://staging.diewish.com',screenshot:'fixture.png'};
    fs.writeFileSync(path.join(dir,'record.json'),JSON.stringify(row));assert.throws(()=>verify(dir),/HEALTH_DATA_SCREENSHOT_GUARD_FAIL/);
    row.screenshotGuard='HEALTH_MASK_V1';fs.writeFileSync(path.join(dir,'record.json'),JSON.stringify(row));assert.equal(verify(dir),2);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
