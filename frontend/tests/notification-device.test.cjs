const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(context){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/infrastructure/notifications/notification-device.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,...context});return exports;}
test('device permission is read live and never conflated with an account opt-in',()=>{
 let permission='default';const api=load({window:{DiewishReminders:{isAvailable:()=>true,permissionStatus:()=>permission}}});
 for(const value of ['default','granted','denied']){permission=value;assert.equal(api.notificationDeviceState().permission,value);}
 permission='unsupported';assert.equal(api.notificationDeviceState().permission,'unavailable');
});
test('missing or throwing native permission API fails closed instead of browser success',()=>{
 for(const bridge of [{isAvailable:()=>true},{isAvailable:()=>true,permissionStatus:()=>{throw Error('unavailable');}}]){
  const api=load({window:{isSecureContext:true,DiewishReminders:bridge,Notification:{}},navigator:{serviceWorker:{}},Notification:{permission:'granted'}});
  assert.equal(api.notificationDeviceState().permission,'unavailable');
 }
});
test('denied native permission opens device settings while never-asked permission requests once',async()=>{
 let status='default',requests=0,settings=0;
 const api=load({window:{DiewishReminders:{isAvailable:()=>true,permissionStatus:()=>status,requestPermission:()=>requests++,openNotificationSettings:()=>settings++}}});
 await api.requestDeviceNotificationPermission();assert.equal(requests,1);assert.equal(api.notificationDeviceState().permission,'default');
 status='denied';await api.requestDeviceNotificationPermission();assert.equal(settings,1);assert.equal(requests,1);
});
test('web granted denied default and unsupported are truthful; requests do not persist account data',async()=>{
 let permission='default',requests=0;const Notification={get permission(){return permission},requestPermission:async()=>{requests++;permission='denied';return permission;}};
 const api=load({window:{isSecureContext:true,Notification},navigator:{serviceWorker:{}},Notification});
 await api.requestDeviceNotificationPermission();assert.equal(requests,1);assert.equal(api.notificationDeviceState().permission,'denied');
 await assert.rejects(api.requestDeviceNotificationPermission());assert.equal(requests,1);
 permission='granted';assert.equal(api.notificationDeviceState().permission,'granted');
 assert.equal(load({window:{isSecureContext:false},navigator:{}}).notificationDeviceState().permission,'unavailable');
});
