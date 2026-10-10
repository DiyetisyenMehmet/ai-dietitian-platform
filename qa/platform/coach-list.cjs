'use strict';
async function openList(page) {
  const list = page.locator('nav[aria-label="Sohbetler"]:visible').first();
  if (!await list.isVisible()) {
    const button = page.getByRole('button', { name: 'Sohbet geçmişi', exact: true });
    // Document loading can finish before the application mounts this control.
    // Use the existing bounded locator wait; never treat absence as an open list.
    await button.waitFor({ state: 'visible' });
    await button.click();
  }
  await list.waitFor({ state: 'visible' });
  await page.getByText('Sohbetler yükleniyor...', { exact: true }).first().waitFor({ state: 'hidden' });
}
async function reopenList(page) {
  const list = page.locator('nav[aria-label="Sohbetler"]:visible').first();
  const close = page.getByRole('button', { name: /Kapat/i }).first();
  if (await close.isVisible()) await close.click();
  else await page.keyboard.press('Escape');
  // An exiting drawer remains visible during its animation. Do not mistake
  // that closing list for the freshly reopened checkpoint.
  await list.waitFor({ state: 'hidden' });
  await openList(page);
}
module.exports = { openList, reopenList };
