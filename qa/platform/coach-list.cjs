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
module.exports = { openList };
