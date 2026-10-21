// Only the dedicated normal-app Test 2 database; never the legacy/Admin DB.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');

const additions = ['20261020110000_dost_mascot_preference', '20261021001000_mascot_collection_preferences'];
async function main() {
  const url = new URL(process.env.NEON_TEST2_DATABASE_URL || 'invalid:');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname !== 'ep-sweet-glitter-bafgdm9p.c-8.eu-central-1.aws.neon.tech' ||
      url.pathname !== '/diewish_staging_test2' || url.username !== 'diewish_staging_test2_owner' ||
      !url.password || !['require', 'verify-full'].includes(url.searchParams.get('sslmode') || 'require'))
    throw Error('Unexpected Test 2 target');
  const root = path.resolve(__dirname, '../backend/prisma/migrations');
  const names = fs.readdirSync(root).filter(n => fs.existsSync(path.join(root, n, 'migration.sql'))).sort();
  if (names.length !== 52 || !additions.every(n => names.includes(n))) throw Error('Unexpected release migration set');
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [] });
  try {
    const identity = await prisma.$queryRawUnsafe('SELECT current_database() AS db, current_user AS role');
    if (identity[0].db !== 'diewish_staging_test2' || identity[0].role !== 'diewish_staging_test2_owner')
      throw Error('Database identity mismatch');
    async function applied() {
      const rows = await prisma.$queryRawUnsafe('SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations');
      for (const row of rows) {
        if (!names.includes(row.migration_name) || !row.finished_at || row.rolled_back_at) throw Error('Unexpected migration history');
        const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, row.migration_name, 'migration.sql'))).digest('hex');
        if (hash !== row.checksum) throw Error('Migration checksum mismatch');
      }
      return new Set(rows.map(r => r.migration_name));
    }
    const before = await applied();
    const pending = names.filter(n => !before.has(n));
    if (before.size < 50 || !pending.every(n => additions.includes(n))) throw Error('Unreviewed pending migration');
    console.log('PASS: dedicated Test 2 identity, existing migration checksums, only approved mascot migrations pending');
    if (process.argv.includes('--migrate')) {
      await prisma.$disconnect();
      const result = spawnSync('./node_modules/.bin/prisma', ['migrate', 'deploy'], {
        cwd: path.resolve(__dirname, '../backend'),
        env: { ...process.env, DATABASE_URL: url.toString() }, encoding: 'utf8', timeout: 120000,
      });
      // Never expose CLI output containing a connection string or credentials.
      if (result.status !== 0) throw Error('Reviewed Test 2 migrations failed (output withheld)');
      const after = await applied();
      if (after.size !== 52) throw Error('Expected 52 applied migrations');
      const constraints = await prisma.$queryRawUnsafe("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='dashboard_card_preferences_mascot_id_check'");
      if (constraints.length !== 1 || !['nox', 'mini-robot', 'dost', 'mirmir', 'classic'].every(x => constraints[0].definition.includes("'" + x + "'")))
        throw Error('Mascot constraint not present');
      console.log('PASS: 52/52 migrations and collection CHECK constraint on Test 2 only');
    }
  } finally { await prisma.$disconnect(); }
}
main().catch(() => { console.error('NO_GO: dedicated Test 2 schema verification/migration failed; sensitive details withheld'); process.exitCode = 1; });
