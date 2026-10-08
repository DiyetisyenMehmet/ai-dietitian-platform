'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { scenarioName } = require('./ios-attachment-names.cjs');
test('recognizes named XCTest screenshots with export suffixes', () => {
  for (const name of ['login-ios-simulator', 'login-ios-simulator.png', 'login-ios-simulator_0_uuid.png', 'testPublicLoginRuntime_login-ios-simulator_0.png']) {
    assert.equal(scenarioName(name), 'login');
  }
  assert.equal(scenarioName('login-runtime-diagnostic-ios-simulator_0.png'), 'login-runtime-diagnostic');
});
test('excludes automatic failure captures and lookalike names', () => {
  for (const name of ['Screenshot_0.png', 'login-ios-simulatorEvil.png', 'notlogin-ios-simulator.png', null]) {
    assert.equal(scenarioName(name), null);
  }
});
