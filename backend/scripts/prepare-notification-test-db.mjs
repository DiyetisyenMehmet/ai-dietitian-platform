/* Ephemeral CI databases only: verify clean history and the real staging upgrade. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
const url = new URL(process.env.DATABASE_URL || "");
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/notification_phase5_test") {
  throw new Error("Refusing anything except the local ephemeral notification_phase5_test database.");
}
const cleanUrl = new URL(url);
cleanUrl.pathname = "/notification_phase6_clean_test";
const prismaRoot = fileURLToPath(new URL("../prisma/", import.meta.url));
const migrations = fs.readdirSync(path.join(prismaRoot, "migrations"))
  .filter(name => fs.existsSync(path.join(prismaRoot, "migrations", name, "migration.sql"))).sort();
const additions = ["20261007124500_water_reminder_schedule", "20261007160000_notification_category_alerts"];
assert.deepEqual(migrations.slice(-2), additions);
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.status !== 0) throw new Error(`Isolated validation failed: ${command}`);
}
// The guard executes before either database is created or changed.
run("psql", [url.href, "-v", "ON_ERROR_STOP=1", "-c", "CREATE DATABASE notification_phase6_clean_test"]);
run("npx", ["prisma", "migrate", "deploy"], { ...process.env, DATABASE_URL: cleanUrl.href });
// Reproduce staging's 40 actual migrations (including raw device/payment tables),
// seed legacy preferences, then run the exact two additive migrations via Prisma.
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "diewish-notification-ci-"));
try {
  const schema = path.join(temporary, "schema.prisma");
  fs.writeFileSync(schema, fs.readFileSync(path.join(prismaRoot, "schema.prisma"), "utf8")
    .replace(/^\s*(?:waterReminderSchedule|categoryAlerts)\s+Json\?\s*$/gm, ""));
  const migrationRoot = path.join(temporary, "migrations");
  fs.mkdirSync(migrationRoot);
  fs.copyFileSync(path.join(prismaRoot, "migrations/migration_lock.toml"), path.join(migrationRoot, "migration_lock.toml"));
  for (const name of migrations.filter(name => !additions.includes(name)))
    fs.cpSync(path.join(prismaRoot, "migrations", name), path.join(migrationRoot, name), { recursive: true });
  run("npx", ["prisma", "migrate", "deploy", "--schema", schema]);
  run("psql", [url.href, "-v", "ON_ERROR_STOP=1", "-c", `
    INSERT INTO users (id,email,"passwordHash","updatedAt") VALUES ('legacy-phase5','legacy-phase5@example.invalid','test-only',now());
    INSERT INTO notification_preferences (id,"userId","waterReminders","waterReminderTime","updatedAt") VALUES ('legacy-pref','legacy-phase5',true,'13:55',now());`]);
  run("npx", ["prisma", "migrate", "deploy"]);
} finally { fs.rmSync(temporary, { recursive: true }); }
async function verifySchema(databaseUrl) {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const columns = await prisma.$queryRaw`SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name IN ('waterReminderSchedule', 'categoryAlerts') ORDER BY column_name`;
    assert.equal(columns.length, 2);
    for (const column of columns) {
      assert.equal(column.is_nullable, "YES"); assert.equal(column.data_type, "jsonb");
    }
    const count = await prisma.$queryRaw`SELECT COUNT(*) AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    assert.equal(Number(count[0].count), migrations.length);
  } finally { await prisma.$disconnect(); }
}
(async () => {
  await verifySchema(cleanUrl.href);
  await verifySchema(url.href);
  const clean = new PrismaClient({ datasources: { db: { url: cleanUrl.href } } });
  const legacy = new PrismaClient();
  try {
    const user = await clean.user.create({ data: { email: "clean-phase6@example.invalid", passwordHash: "isolated-test-only" } });
    const preference = await clean.notificationPreference.create({ data: { userId: user.id } });
    assert.equal(preference.waterReminderSchedule, null); assert.equal(preference.categoryAlerts, null);
    await clean.user.delete({ where: { id: user.id } });
    const old = await legacy.notificationPreference.findUniqueOrThrow({ where: { id: "legacy-pref" } });
    assert.equal(old.waterReminders, true); assert.equal(old.waterReminderTime, "13:55");
    assert.equal(old.waterReminderSchedule, null); assert.equal(old.categoryAlerts, null);
    console.log(`Real PostgreSQL: ${migrations.length} clean migrations and ${migrations.length - 2} -> ${migrations.length} staging-history upgrade pass; legacy flags/times and NULL fields preserved.`);
  } finally { await clean.$disconnect(); await legacy.$disconnect(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
