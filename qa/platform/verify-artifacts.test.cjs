const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { verify } = require('./verify-artifacts.cjs');
test('export rejects cookies, arbitrary logs, symlinks and disguised images', () => {
  for (const type of ['storage.json', 'runtime.log', 'fake.png', 'link.png']) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-export-'));
    try {
      if (type === 'link.png') fs.symlinkSync('/etc/passwd', path.join(dir, type));
      else fs.writeFileSync(path.join(dir, type), type === 'storage.json' ? '{"cookies":[{"value":"secret"}]}' : 'not-a-PNG');
      assert.throws(() => verify(dir));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});
test('raw identity and bearer secrets are refused before export', () => {
  for (const raw of ['{"email":"private@example.invalid"}', '{"log":"Bearer sample"}', '{"token":"eyJhbGciOiJIUzI1NiJ9.abcdefgh.signature"}']) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-export-'));
    try { fs.writeFileSync(path.join(dir, 'record.json'), raw); assert.throws(() => verify(dir)); }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});
