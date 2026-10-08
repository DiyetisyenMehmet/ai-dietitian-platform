'use strict';
// xcresulttool appends an ordinal/extension and may prefix the test name.
const NAMES = ['login', 'dashboard', 'coach-list', 'notification-preferences', 'profile', 'session-relaunch', 'login-runtime-diagnostic'];
function scenarioName(human) {
  if (typeof human !== 'string') return null;
  return NAMES.find(name => new RegExp('(^|[_ ])' + name + '-ios-simulator($|[._ -])').test(human)) || null;
}
module.exports = { NAMES, scenarioName };
