'use strict';
const c = require('./contract.cjs');
const { openRuntime, login, logout, openList, capture } = require('./runtime.cjs');
const { syncPlan, CHECKPOINTS } = require('./sync-plan.cjs');
const { randomBytes } = require('node:crypto');
const { stage } = require('./sync-stage.cjs');
async function newCoachConversation(runtime, marker) {
  const page = runtime.page;
  await page.goto(c.ORIGIN + '/ai');
  await openList(page);
  await page.getByRole('button', { name: 'Yeni Sohbet', exact: true }).click();
  await page.getByLabel('Mesaj', { exact: true }).fill(marker + ' — Merhaba, yalnız kısa bir selamlama yanıtı ver.');
  const pending = page.waitForResponse(r => new URL(r.url()).pathname === '/api/ai-chat/messages' && r.request().method() === 'POST', { timeout: 120000 });
  await page.getByRole('button', { name: 'Gönder', exact: true }).click();
  const response = await pending;
  if (!response.ok()) throw new c.Blocked('COACH_MESSAGE_NOT_SUCCESSFUL');
  const payload = await response.json();
  const id = payload?.data?.conversationId;
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id || '') || !payload?.data?.message) throw new c.Blocked('SERVER_CONVERSATION_ID_REQUIRED');
  return id;
}
async function performCheckpoint(runtime, checkpoint, sourceAlias) {
      if (checkpoint === 'already-open') await runtime.page.waitForTimeout(10000);
      if (checkpoint === 'list-reopen') {
        const close = runtime.page.getByRole('button', { name: /Kapat/i }).first();
        if (await close.isVisible()) await close.click();
        else await runtime.page.keyboard.press('Escape');
        await openList(runtime.page);
      }
      if (checkpoint === 'refresh') { await runtime.refresh(runtime.page); await openList(runtime.page); }
      if (checkpoint === 'relaunch') { runtime.page = await runtime.relaunch(); await openList(runtime.page); }
      if (checkpoint === 'logout-login') { await logout(runtime.page); if (await login(runtime.page) !== sourceAlias) throw new c.Blocked('CROSS_PLATFORM_ACCOUNT_MISMATCH'); await runtime.page.goto(c.ORIGIN + '/ai'); await openList(runtime.page); }
}
async function main() {
  const sourceName = process.argv[2] || 'android';
  const targetName = process.argv[3] || 'web';
  if (![sourceName, targetName].every(p => ['web', 'android'].includes(p)) || sourceName === targetName) throw new c.Blocked('USE_MANUAL_HARNESS_FOR_IOS');
  c.credentials();
  process.env.QA_RUN_ID ||= 'sync-' + randomBytes(8).toString('hex');
  let source, target;
  try {
    source = await stage('SOURCE_OPEN', () => openRuntime(sourceName));
    target = await stage('TARGET_OPEN', () => openRuntime(targetName));
    const sourceAlias = await login(source.page, (name, _ms, operation) => stage('SOURCE_' + name, operation));
    const targetAlias = await login(target.page, (name, _ms, operation) => stage('TARGET_' + name, operation));
    if (sourceAlias !== targetAlias) throw new c.Blocked('CROSS_PLATFORM_ACCOUNT_MISMATCH');
    const plan = syncPlan(sourceName, targetName, sourceAlias);
    const e = c.createEvidence(target.platform, target.runtime, target.device);
    await stage('TARGET_LIST_OPEN', async () => { await target.page.goto(c.ORIGIN + '/ai'); await openList(target.page); });
    // Target is open before the source mutation. Do not refresh it first.
    const id = await stage('SOURCE_CREATE', () => newCoachConversation(source, plan.marker));
    const sourceEvidence = c.createEvidence(source.platform, source.runtime, source.device);
    sourceEvidence.record('sync-source-created', 'PASS', { alias: sourceAlias, conversationId: id, direction: sourceName + '-to-' + targetName, screenshot: await stage('SOURCE_CAPTURE', () => capture(source, sourceEvidence, 'sync-source-created')) });
    for (const checkpoint of CHECKPOINTS) {
      const phase = 'TARGET_' + checkpoint.replace(/-/g, '_').toUpperCase();
      await stage(phase + '_ACTION', () => performCheckpoint(target, checkpoint, sourceAlias));
      // An absence is an observation, not a product verdict by this worker.
      const observed = await stage(phase + '_OBSERVE', () => target.page.locator('nav[aria-label="Sohbetler"]:visible').getByText(plan.marker, { exact: false }).first().isVisible());
      e.record('sync-' + checkpoint, 'PASS', { alias: targetAlias, observed, conversationId: id, direction: sourceName + '-to-' + targetName, screenshot: await stage(phase + '_CAPTURE', () => capture(target, e, 'sync-' + checkpoint)) });
    }
  } finally { if (source) await source.close(); if (target) await target.close(); }
}
if (require.main === module) main().catch(error => { console.error(c.errorCode(error)); process.exitCode = 2; });
module.exports = { newCoachConversation, performCheckpoint };
