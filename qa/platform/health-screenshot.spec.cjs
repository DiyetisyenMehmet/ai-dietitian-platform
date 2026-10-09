'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const c=require('./contract.cjs');
const pw=require('../../frontend/node_modules/playwright');
const {guardedCapture,proven}=require('./capture-guard.cjs');
const {verify}=require('./verify-artifacts.cjs');
const script=fs.readFileSync(path.join(__dirname,'evidence-mask.js'),'utf8');
async function fixture(run) {
  const browser=await pw[process.env.QA_BROWSER_ENGINE||'chromium'].launch();
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qa-health-fixture-'));
  try{await run(page,dir);}finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
}
test('weight, targets, lab numbers, diagnosis, allergy and identity are masked together without changing DOM values',async()=>fixture(async(page,dir)=>{
  await page.setContent('<main><h1>Sağlık Profilim</h1><p>Güncel kg</p><p id="weight">79.0</p><p>Hedef kg</p><p>65.0</p><p>synthetic@example.invalid</p><p>Ferritin 23 ng/ml</p><p>Synthetic allergy</p><p>Synthetic diagnosis</p><input value="88"><button>Kaydet</button><input type="checkbox" checked></main>');
  const original=await page.locator('main').innerHTML();
  const raw=await page.screenshot({caret:'initial'}); // synthetic fixture buffer only; never disk/export
  await page.evaluate(script);assert.equal(await page.evaluate(()=>window.__diewishEvidenceMask.begin()),true);
  assert.equal(await page.locator('main').innerHTML(),original);
  const masked=await page.screenshot({caret:'initial'});assert.notDeepEqual(raw,masked);
  // Check actual painted fixture pixels, not just a claimed guard flag.
  const rect=await page.locator('#weight').evaluate(n=>{const r=document.createRange();r.selectNodeContents(n);const b=r.getBoundingClientRect();return {x:b.x,y:b.y};});
  const sharp=require('../../frontend/node_modules/sharp');
  const pixel=await sharp(masked).extract({left:Math.floor(rect.x+1),top:Math.floor(rect.y+1),width:1,height:1}).removeAlpha().raw().toBuffer();
  assert.deepEqual([...pixel],[53,75,67]);
  assert.equal(await page.evaluate(()=>window.__diewishEvidenceMask.active()),true);
  assert.equal(await page.evaluate(()=>window.__diewishEvidenceMask.restore()),true);
  assert.equal(await page.locator('main').innerHTML(),original);assert.deepEqual(await page.screenshot({caret:'initial'}),raw);
  const file=path.join(dir,'guarded.png');await guardedCapture(page,file,()=>page.screenshot({caret:'initial'}));assert.equal(proven(file),true);
}));
test('screen containing only static UI and toggles captures normally and restores exactly',async()=>fixture(async(page,dir)=>{
  await page.setContent('<h1>Bildirim Tercihleri</h1><button>Kaydet</button><input type="checkbox" checked>');
  const original=await page.locator('body').innerHTML();const raw=await page.screenshot({caret:'initial'});
  await guardedCapture(page,path.join(dir,'safe.png'),()=>page.screenshot({caret:'initial'}));
  assert.equal(await page.locator('body').innerHTML(),original);assert.deepEqual(fs.readFileSync(path.join(dir,'safe.png')),raw);
}));
test('DOM update during capture shields the screen, refuses writing and blocks artifact export',async()=>fixture(async(page,dir)=>{
  await page.setContent('<h1>Dashboard</h1><p id="value">79.0</p>');
  const file=path.join(dir,'refused.png');
  try {
    await assert.rejects(()=>guardedCapture(page,file,async()=>{await page.locator('#value').evaluate(n=>n.textContent='80.0');return page.screenshot({caret:'initial'});}),{code:'HEALTH_DATA_SCREENSHOT_GUARD_FAIL'});
    assert.equal(fs.existsSync(file),false);assert.throws(()=>verify(path.join(c.ROOT,'.qa-artifacts')));
    assert.equal(fs.existsSync(path.join(c.ROOT,'.qa-artifacts','.health-guard-failed')),true);
    assert.equal(await page.locator('#value').textContent(),'80.0');assert.equal(await page.locator('[data-qa-health-mask]').count(),0);
  } finally {fs.rmSync(path.join(c.ROOT,'.qa-artifacts','.health-guard-failed'),{force:true});}
}));
test('late hydration is settled before mask geometry; capture still preserves the latest application state',async()=>fixture(async(page,dir)=>{
  await page.setContent('<h1>Dashboard</h1><p id="value">79.0</p>');
  await page.evaluate(()=>setTimeout(()=>document.querySelector('#value').textContent='80.0',100));
  await guardedCapture(page,path.join(dir,'hydrated.png'),()=>page.screenshot({caret:'initial'}));
  assert.equal(await page.locator('#value').textContent(),'80.0');
}));
test('empty WebKit screenshot stylesheet is harmless; actual styling/value changes still fail closed',async()=>fixture(async(page,dir)=>{
  await page.setContent('<h1>Dashboard</h1><p>79.0</p>');
  await guardedCapture(page,path.join(dir,'plumbing.png'),async()=>{
    await page.evaluate(()=>{const style=document.createElement('style');style.textContent='body {}';document.head.appendChild(style);document.documentElement.getBoundingClientRect();style.remove();});
    return page.screenshot({caret:'initial'});
  });
}));
test('private visual layer is hidden while its card label remains visible; styles restore exactly',async()=>fixture(async(page,dir)=>{
  await page.setContent('<div id="card" style="background-image:url(data:image/svg+xml,test)"><h2>Kan Tahlili Analizi</h2><svg id="chart" width="100" height="80"><text y="20">79.0</text></svg></div>');
  const original=await page.locator('body').innerHTML();
  await guardedCapture(page,path.join(dir,'card.png'),async()=>{
    assert.equal(await page.locator('#chart').evaluate(n=>getComputedStyle(n).opacity),'0');
    assert.equal(await page.locator('#card').evaluate(n=>getComputedStyle(n).backgroundImage),'none');
    assert.equal(await page.getByText('Kan Tahlili Analizi',{exact:true}).isVisible(),true);
    return page.screenshot({caret:'initial'});
  });
  assert.equal(await page.locator('body').innerHTML(),original);
}));
test('mask bootstrap failure and populated credential fields never invoke device screenshot',async()=>fixture(async(page,dir)=>{
  await page.setContent('<input type="email" value="synthetic@example.invalid"><input type="password" value="synthetic-only">');
  let screenshots=0;
  try {await assert.rejects(()=>guardedCapture(page,path.join(dir,'refused.png'),async()=>{screenshots++;return page.screenshot({caret:'initial'});}),{code:'HEALTH_DATA_SCREENSHOT_GUARD_FAIL'});assert.equal(screenshots,0);}
  finally{fs.rmSync(path.join(c.ROOT,'.qa-artifacts','.health-guard-failed'),{force:true});}
  await page.setContent('<h1>Dashboard</h1>');
  await page.evaluate(()=>window.__diewishEvidenceMask={begin:()=>false,restore:()=>true});
  try{await assert.rejects(()=>guardedCapture(page,path.join(dir,'refused.png'),async()=>{screenshots++;return page.screenshot({caret:'initial'});}),{code:'HEALTH_DATA_SCREENSHOT_GUARD_FAIL'});assert.equal(screenshots,0);}
  finally{fs.rmSync(path.join(c.ROOT,'.qa-artifacts','.health-guard-failed'),{force:true});}
}));
test('Android device and iOS QA host use the shared mask before their native capture; unknown chart pixels are covered',async()=>fixture(async(page,dir)=>{
  await page.setContent('<h1>Dashboard</h1><canvas width="100" height="80"></canvas><svg width="80" height="80"><text y="20">79.0</text></svg><p>QA-sync-0123456789abcdef</p>');
  await guardedCapture(page,path.join(dir,'native-fixture.png'),async()=>{assert.equal(await page.evaluate(()=>window.__diewishEvidenceMask.active()),true);return page.screenshot({caret:'initial'});});
  const runtime=fs.readFileSync(path.join(__dirname,'runtime.cjs'),'utf8');assert.match(runtime,/guardedCapture[\s\S]*runtime\.screenshot\(\)/);
  const host=fs.readFileSync(path.join(__dirname,'../../ios/DiewishQA/ShellViewController.swift'),'utf8');assert.match(host,/evidence-mask/);assert.match(host,/__diewishEvidenceMask\.begin/);assert.match(host,/__diewishEvidenceMask\?\.restore/);
  const testSource=fs.readFileSync(path.join(__dirname,'../../ios/DiewishQAUITests/RuntimeTests.swift'),'utf8');assert.ok(testSource.indexOf('HEALTH_DATA_SCREENSHOT_GUARD_FAIL')<testSource.indexOf('app.screenshot()'));assert.match(testSource,/guarded-health-v1/);
}));

test('unchanged font notification is harmless; actual font set changes refuse native/browser export',async()=>fixture(async(page,dir)=>{
  await page.setContent('<h1>Dashboard</h1><p>79.0</p>');
  await page.evaluate(()=>setTimeout(()=>document.fonts.dispatchEvent(new Event('loadingdone')),100));
  await guardedCapture(page,path.join(dir,'settled-font.png'),async()=>{await page.evaluate(()=>document.fonts.dispatchEvent(new Event('loadingdone')));return page.screenshot({caret:'initial'});});
  try {
    await assert.rejects(()=>guardedCapture(page,path.join(dir,'font-refused.png'),async()=>{
      await page.evaluate(()=>document.fonts.add(new FontFace('GuardFixture','local(Arial)')));
      return page.screenshot({caret:'initial'});
    }),{code:'HEALTH_DATA_SCREENSHOT_GUARD_FAIL'});
    assert.equal(fs.existsSync(path.join(dir,'font-refused.png')),false);
  } finally {fs.rmSync(path.join(c.ROOT,'.qa-artifacts','.health-guard-failed'),{force:true});}
}));

test('loaded CSS font faces remain guarded across actual engine screenshot plumbing',async()=>fixture(async(page,dir)=>{
  await page.setContent('<style>@font-face{font-family:GuardLoaded;src:local("DejaVu Sans"),local("Arial")}body{font-family:GuardLoaded,sans-serif}</style><h1>Dashboard</h1><p>79.0</p>');
  await page.evaluate(()=>document.fonts.ready);
  await guardedCapture(page,path.join(dir,'font-face.png'),()=>page.screenshot({caret:'initial'}));
}));

test('preparation-shield image bytes are refused before filesystem export',async()=>fixture(async(page,dir)=>{
  await page.setContent('<style>body{background:#263b35}</style>');
  const file=path.join(dir,'shield-refused.png');
  try {
    await assert.rejects(()=>guardedCapture(page,file,()=>page.screenshot({caret:'initial'})),{code:'HEALTH_DATA_SCREENSHOT_GUARD_FAIL'});
    assert.equal(fs.existsSync(file),false);
  } finally {fs.rmSync(path.join(c.ROOT,'.qa-artifacts','.health-guard-failed'),{force:true});}
}));

test('declared unused font faces settle before a screenshot can trigger reflow',async()=>fixture(async(page,dir)=>{
  await page.setContent('<style>@font-face{font-family:GuardUnused;src:local("Fixture Missing Font"),local("Arial");unicode-range:U+0600-06FF}body{font-family:sans-serif}</style><h1>Dashboard</h1><p>79.0</p>');
  await guardedCapture(page,path.join(dir,'unused-face.png'),()=>page.screenshot({caret:'initial'}));
  assert.equal(await page.evaluate(()=>[...document.fonts].some(face=>face.status==='unloaded'||face.status==='loading')),false);
}));
