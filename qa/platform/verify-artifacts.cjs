'use strict';
// Fail closed before export: only PNGs and structured, allowlisted records.
const fs = require('node:fs');
const path = require('node:path');
const c = require('./contract.cjs');
const keys = new Set(['schemaVersion', 'platform', 'runtime', 'scenario', 'status', 'code', 'accountAlias', 'observed', 'productVerdict', 'timestamp', 'harnessGitSha', 'deployedGitSha', 'appVersion', 'device', 'viewport', 'screenshot', 'log', 'stagingOrigin', 'conversationId', 'direction']);
const textSecrets = ['QA_EMAIL', 'QA_PASSWORD', 'QA_ACCOUNT_ID', 'QA_ACCOUNT_HMAC_KEY'].map(k => process.env[k]).filter(Boolean);
function verify(dir) {
  if (!fs.existsSync(dir)) throw new Error('EVIDENCE_DIRECTORY_MISSING');
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error('ARTIFACT_SYMLINK_REFUSED');
    if (entry.isDirectory()) { count += verify(file); continue; }
    if (entry.name.endsWith('.png')) {
      const bytes = fs.readFileSync(file);
      if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('INVALID_PNG');
    } else if (entry.name.endsWith('.json')) {
      const raw = fs.readFileSync(file, 'utf8');
      if (textSecrets.some(secret => raw.includes(secret)) || /Bearer\s|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(raw)) throw new Error('SENSITIVE_ARTIFACT_REFUSED');
      const obj = JSON.parse(raw);
      const records = entry.name === 'manifest.json' ? obj.records : [obj];
      if (!Array.isArray(records)) throw new Error('INVALID_EVIDENCE_FORMAT');
      for (const row of records) {
        if (Object.keys(row).some(key => !keys.has(key))) throw new Error('UNSAFE_EVIDENCE_FIELD');
        if (!c.PLATFORMS[row.platform]?.includes(row.runtime) || row.stagingOrigin !== c.ORIGIN || row.productVerdict !== 'NOT_ASSESSED') throw new Error('INVALID_EVIDENCE_CLASSIFICATION');
      }
    } else throw new Error('UNSAFE_ARTIFACT_TYPE');
    count++;
  }
  if (!count) throw new Error('EMPTY_ARTIFACT_DIRECTORY');
  return count;
}
if (require.main === module) { try { console.log('Validated evidence files: ' + verify(path.join(c.ROOT, '.qa-artifacts'))); } catch { console.error('ARTIFACT_EXPORT_REFUSED'); process.exitCode = 1; } }
module.exports = { verify };
