'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { navigate } = require('./runtime.cjs');
test('only an interrupted staging GET navigation is retried, with a strict bound', async () => {
  let attempts = 0;
  const page = { goto: async () => { attempts++; if (attempts < 2) throw new Error('net::ERR_ABORTED'); }, waitForTimeout: async () => {} };
  await navigate(page, 'https://staging.diewish.com/login');
  assert.equal(attempts, 2);
  attempts = 0;
  page.goto = async () => { attempts++; throw new Error('net::ERR_ABORTED'); };
  await assert.rejects(() => navigate(page, 'https://staging.diewish.com/login'));
  assert.equal(attempts, 3);
  attempts = 0;
  page.goto = async () => { attempts++; throw new Error('net::ERR_CERT_INVALID'); };
  await assert.rejects(() => navigate(page, 'https://staging.diewish.com/login'));
  assert.equal(attempts, 1);
  await assert.rejects(() => navigate(page, 'https://diewish.com/login'), /STAGING_ORIGIN_REQUIRED/);
});
