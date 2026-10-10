'use strict';
const { CHECKPOINTS } = require('./sync-plan.cjs');
const STAGES = new Set([
  'SOURCE_OPEN', 'TARGET_OPEN', 'TARGET_LIST_NAVIGATION', 'TARGET_LIST_OPEN', 'SOURCE_CREATE', 'SOURCE_CAPTURE',
  ...['SOURCE', 'TARGET'].flatMap(side => ['AUTH_LOGIN_NAVIGATION', 'AUTH_FORM_FILL', 'AUTH_FORM_SUBMIT', 'AUTH_RESPONSE', 'AUTH_DASHBOARD_REDIRECT'].map(name => side + '_' + name)),
  ...CHECKPOINTS.flatMap(name => ['ACTION', 'OBSERVE', 'CAPTURE'].map(operation => 'TARGET_' + name.replace(/-/g, '_').toUpperCase() + '_' + operation)),
]);
async function stage(name, operation) {
  if (!STAGES.has(name)) throw new Error('SYNC_STAGE_INVALID');
  console.log('SYNC_STAGE', name, 'RUNNING');
  try {
    const value = await operation();
    console.log('SYNC_STAGE', name, 'PASS');
    return value;
  } catch (error) {
    console.log('SYNC_STAGE', name, 'FAIL');
    throw error;
  }
}
module.exports = { stage };
