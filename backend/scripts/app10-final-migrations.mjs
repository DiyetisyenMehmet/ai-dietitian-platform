import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Client } from 'pg';

// This harness is intentionally absent from the application and PR #66.
const url = new URL(process.env.DATABASE_URL);
assert.equal(process.env.APP10_DISPOSABLE_POSTGRES, '1');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.pathname, '/app10_final_test');
assert.equal(url.username, 'app10');
const client = new Client({ connectionString: url.toString() });
await client.connect();
const sql = (text, values) => client.query(text, values);
const sequence = [
  '20261017120000_user_password_recovery',
  '20261017123000_account_identity_foundation',
  '20261017140000_safe_account_linking',
  '20261017210000_phone_password_registration',
  '20261018093000_phone_sms_recovery',
];
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app10-pg-migrations-'));
const schema = path.join(root, 'prisma/schema.prisma');
fs.cpSync('prisma', path.dirname(schema), { recursive: true });
for (const name of sequence) fs.rmSync(path.join(root, 'prisma/migrations', name), { recursive: true });
const migrate = () => execFileSync('node', ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', schema], { stdio: 'inherit' });
const tables = ['users', 'weight_logs', 'chat_conversations', 'chat_messages', 'subscriptions', 'notifications'];
async function snapshot() {
  const result = {};
  for (const table of tables) result[table] = (await sql(`SELECT to_jsonb(t) - 'authVersion' - 'hasUsablePassword' AS row FROM "${table}" t ORDER BY id`)).rows;
  return JSON.stringify(result);
}
try {
  assert.equal((await sql("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n, 0);
  console.log('M01: empty disposable PostgreSQL confirmed; apply inherited baseline only');
  migrate();
  const ids = [];
  for (let i = 0; i < 2; i++) {
    const id = randomUUID(), conversation = randomUUID(); ids.push(id);
    await sql('INSERT INTO users (id,email,"passwordHash","updatedAt") VALUES ($1,$2,$3,now())', [id, `legacy-${i}@example.invalid`, 'synthetic-provenance-unknown']);
    await sql('INSERT INTO weight_logs (id,"userId","weightKg",note) VALUES ($1,$2,71,$3)', [randomUUID(), id, 'synthetic preserved weight']);
    await sql('INSERT INTO chat_conversations (id,"userId",title,"updatedAt") VALUES ($1,$2,$3,now())', [conversation, id, 'synthetic preserved conversation']);
    await sql('INSERT INTO chat_messages (id,"conversationId",role,content) VALUES ($1,$2,\'USER\',$3)', [randomUUID(), conversation, 'synthetic preserved message']);
    await sql('INSERT INTO subscriptions (id,"userId",tier,status,provider,"updatedAt") VALUES ($1,$2,\'PREMIUM\',\'ACTIVE\',\'IYZICO\',now())', [randomUUID(), id]);
    await sql('INSERT INTO notifications (id,"userId",type,title,body,"scheduledFor","deliveredAt") VALUES ($1,$2,\'PROACTIVE_MESSAGE\',$3,$4,now(),now())', [randomUUID(), id, 'synthetic title', 'synthetic preserved notification']);
  }
  const before = await snapshot(); let proofBefore;
  for (let i = 0; i < sequence.length; i++) {
    const name = sequence[i];
    fs.cpSync(path.join('prisma/migrations', name), path.join(root, 'prisma/migrations', name), { recursive: true });
    migrate();
    assert.ok((await snapshot()) === before, `Legacy relationship/content mismatch after ${name}`);
    if (i === 1) {
      assert.ok((await sql('SELECT "authVersion", "hasUsablePassword" FROM users ORDER BY id')).rows.every(r => r.authVersion === 0 && r.hasUsablePassword === null));
      assert.equal((await sql('SELECT count(*)::int AS n FROM account_identities')).rows[0].n, 0);
    }
    if (i === 3) {
      await sql('INSERT INTO phone_password_challenges (id,"phoneNumber","secretHash","proofEventHash","expiresAt") VALUES ($1,$2,$3,$4,now()+interval \'4 minutes\')', ['app10-preexisting-a3', '+905551112233', 'a'.repeat(64), 'b'.repeat(64)]);
      proofBefore = JSON.stringify((await sql('SELECT to_jsonb(t) AS row FROM phone_password_challenges t')).rows);
    }
    if (i === 4) {
      assert.equal(JSON.stringify((await sql('SELECT to_jsonb(t) - \'purpose\' - \'verifiedAt\' - \'failedAttempts\' AS row FROM phone_password_challenges t')).rows), proofBefore);
      const proof = (await sql('SELECT purpose,"verifiedAt","failedAttempts" FROM phone_password_challenges')).rows[0];
      assert.equal(proof.purpose, 'INITIAL_PASSWORD'); assert.equal(proof.verifiedAt, null); assert.equal(proof.failedAttempts, 0);
    }
    console.log(`M02.${i + 1}: PASS ${name}; legacy users/weight/chat/subscription/notification unchanged`);
  }
  const rows = (await sql('SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY started_at')).rows;
  assert.deepEqual(rows.slice(-5).map(r => r.migration_name), sequence);
  assert.ok(rows.every(r => r.finished_at && !r.rolled_back_at));
  for (const row of rows) assert.equal(row.checksum, createHash('sha256').update(fs.readFileSync(path.join('prisma/migrations', row.migration_name, 'migration.sql'))).digest('hex'));
  for (const name of ['account_identity_immutable_owner', 'phone_password_proof_guard', 'account_link_phone_proof_guard']) {
    assert.equal((await sql('SELECT count(*)::int AS n FROM pg_trigger WHERE tgname=$1 AND NOT tgisinternal', [name])).rows[0].n, 1);
  }
  console.log('M03: PASS all migration checksums/order/completion; SQL identity/replay triggers present; legacy A3 purpose preserved');
  fs.writeFileSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'app10-migration-evidence.json'), JSON.stringify({ postgres: (await sql('SHOW server_version')).rows[0].server_version, sequence, legacyUsers: ids.length, preservedTables: tables, result: 'PASS' }, null, 2));
} finally {
  await client.end(); fs.rmSync(root, { recursive: true, force: true });
}
