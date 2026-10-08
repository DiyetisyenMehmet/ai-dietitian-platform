'use strict';
const c = require('./contract.cjs');
async function navigate(page, url) {
  c.stagingOrigin(new URL(url).origin);
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await page.goto(url, { waitUntil: 'domcontentloaded' }); return; }
    catch (error) {
      if (c.errorCode(error) !== 'RUNTIME_NAVIGATION_INTERRUPTED' || attempt === 2) throw error;
      await page.waitForTimeout(250);
    }
  }
}
module.exports = { navigate };
