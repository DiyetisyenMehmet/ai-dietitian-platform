'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { defaultNetworkReady } = require('./android-network.cjs');
const agent = (id, capabilities) => '  NetworkAgentInfo{network{' + id + '} nc{[ Transports: WIFI Capabilities: ' + capabilities + ']}}';
test('native launch requires validated internet on the actual active default network', () => {
  assert.equal(defaultNetworkReady('Active default network: 100\n' + agent(100, 'INTERNET&TRUSTED&VALIDATED')), true);
  assert.equal(defaultNetworkReady('Active default network: 100\n' + agent(100, 'INTERNET&TRUSTED') + '\n' + agent(101, 'INTERNET&VALIDATED')), false);
  assert.equal(defaultNetworkReady('Active default network: 100\n' + agent(100, 'TRUSTED&VALIDATED')), false);
  assert.equal(defaultNetworkReady('Active default network: none\n' + agent(100, 'INTERNET&VALIDATED')), false);
  assert.equal(defaultNetworkReady('Active default network: 100\nHistory: network{100} Capabilities: INTERNET&VALIDATED'), false);
});
