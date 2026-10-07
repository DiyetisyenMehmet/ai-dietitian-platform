const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, context = {}) {
 const exports = {};
 const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
 vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, ...context, require: id => { if (id.includes('notification-alerts')) return load('domain/account/notification-alerts.ts'); throw Error(id); } });
 return exports;
}
test('legacy preferences normalize to system sound/off without mutating input', () => {
 const api = load('domain/account/notification-alerts.ts');
 assert.equal(JSON.stringify(api.alertForCategory(null,'water')), JSON.stringify({soundPreset:'system',vibrationPreset:'off'}));
 const unsafe = {water:{soundPreset:'file://arbitrary',vibrationPreset:'repeat'}};
 assert.equal(JSON.stringify(api.alertForCategory(unsafe,'water')), JSON.stringify({soundPreset:'system',vibrationPreset:'off'}));
 assert.equal(unsafe.water.soundPreset,'file://arbitrary');
});
test('all visible custom sounds are real identical packaged WAV files with bounded amplitude', () => {
 const crypto = require('node:crypto');
 const manifest = JSON.parse(fs.readFileSync(path.join(__dirname,'../public/audio/manifest.json')));
 const api = load('domain/account/notification-alerts.ts');
 for (const preset of api.SOUND_PRESETS.filter(p=>p.asset)) {
  const web = fs.readFileSync(path.join(__dirname,'../public',preset.asset));
  const native = fs.readFileSync(path.join(__dirname,'../../android/app/src/main/res/raw',path.basename(preset.asset)));
  assert.deepEqual(web,native); assert.equal(web.subarray(0,4).toString(),'RIFF'); assert.equal(web.subarray(8,12).toString(),'WAVE');
  assert.equal(crypto.createHash('sha256').update(web).digest('hex'),manifest[preset.id].sha256);
  let max=0; for(let i=44;i<web.length;i+=2)max=Math.max(max,Math.abs(web.readInt16LE(i)));
  assert.ok(max>1000 && max<27000); assert.ok(web.length<60000);
 }
});
test('preview environments reject production and deceptive hostname suffixes', () => {
 const api=load('infrastructure/notifications/notification-alert-adapter.ts');
 for(const host of ['localhost','127.0.0.1','staging.diewish.com','diewish-frontend-staging-123.europe-west1.run.app']) assert.equal(api.isNotificationPreviewHost(host),true);
 for(const host of ['diewish.com','www.diewish.com','staging.diewish.com.evil.com','diewish-frontend-production-123.run.app']) assert.equal(api.isNotificationPreviewHost(host),false);
});
test('native preference sync has no scheduler side effects and errors fail closed', () => {
 let input, queues=0;
 const api=load('infrastructure/notifications/notification-alert-adapter.ts',{window:{DiewishReminders:{isAvailable:()=>true,setNotificationAlertPreferences:json=>{input=JSON.parse(json);return true;},replaceSchedule:()=>queues++,cancelAll:()=>queues++}}});
 assert.equal(api.syncNotificationAlertPreferences({water:{soundPreset:'silent',vibrationPreset:'short'}}),true);
 assert.deepEqual(input.water,{soundPreset:'silent',vibrationPreset:'short'}); assert.equal(Object.keys(input).length,6); assert.equal(queues,0);
 const bad=load('infrastructure/notifications/notification-alert-adapter.ts',{window:{DiewishReminders:{isAvailable:()=>{throw Error('old bridge');}}}});
 assert.equal(bad.syncNotificationAlertPreferences({}),false);
});
function worker() {
 const handlers={},notifications=[];
 const context={self:{addEventListener:(type,handler)=>handlers[type]=handler,clients:{matchAll:async()=>[]},registration:{getNotifications:async()=>[],showNotification:async(title,options)=>notifications.push({title,options})}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/diewish-push-sw.js'),'utf8'),context);
 return {notifications,async push(soundPreset,vibrationPreset){let pending;handlers.push({data:{json:()=>({data:{notificationId:'one',type:'WEEKLY_REVIEW',title:'Weekly',body:'Ready',soundPreset,vibrationPreset}})},waitUntil:p=>pending=p});await pending;}};
}
test('web remote silent push omits vibration and does not synthesize custom notification audio',async()=>{
 const w=worker();await w.push('silent','short'); assert.equal(w.notifications[0].options.silent,true);assert.equal('vibrate' in w.notifications[0].options,false);
 await w.push('diewish_drop','off'); assert.equal(w.notifications[1].options.silent,false);assert.equal(w.notifications[1].options.vibrate.length,0);assert.equal('sound' in w.notifications[1].options,false);
});
test('production native preview is unavailable even if the browser has notification support',async()=>{
 const api=load('infrastructure/notifications/notification-alert-adapter.ts',{window:{location:{hostname:'diewish.com'},DiewishReminders:{isAvailable:()=>true,notificationAlertCapabilities:()=>JSON.stringify({version:1,customSounds:true,vibration:true,testNotification:true}),setNotificationAlertPreferences:()=>true,previewNotification:()=>{throw Error('must not call');}}}});
 await assert.rejects(api.previewCategoryNotification('weekly',{soundPreset:'system',vibrationPreset:'off'}),/yalnız destekleyen test/);
});
