/* Ephemeral CI databases only: validate full clean history and legacy upgrades. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const { PrismaClient } = require("@prisma/client");
const url = new URL(process.env.DATABASE_URL || "");
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/notification_phase5_test") {
  throw new Error("Refusing to initialize anything except the local ephemeral notification_phase5_test database.");
}
// Also prove the complete migration history on an empty database. The URL
// guard above runs before either database can be created or changed.
const cleanUrl = new URL(url);
cleanUrl.pathname = "/notification_phase6_clean_test";
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.status !== 0) throw new Error(`Isolated validation failed: ${command}`);
}
run("psql", [url.href, "-v", "ON_ERROR_STOP=1", "-c", 'CREATE DATABASE notification_phase6_clean_test']);
run("npx", ["prisma", "migrate", "deploy"], { ...process.env, DATABASE_URL: cleanUrl.href });
const base = fs.readFileSync(process.argv[2], "utf8")
  .replace(/\s*"waterReminderSchedule" JSONB,/, "")
  .replace(/\s*"categoryAlerts" JSONB,/, "");
const migration = name => fs.readFileSync(path.join(__dirname, "../prisma/migrations", name, "migration.sql"), "utf8");
const sql = [base,
  migration("20260915192500_add_notification_devices"),
  migration("20260916143000_harden_notification_delivery"),
  `INSERT INTO users (id,email,"passwordHash","updatedAt") VALUES ('legacy-phase5','legacy-phase5@example.invalid','test-only',now());
   INSERT INTO notification_preferences (id,"userId","waterReminders","waterReminderTime","updatedAt") VALUES ('legacy-pref','legacy-phase5',true,'13:55',now());`,
  "BEGIN;", migration("20261007124500_water_reminder_schedule"),
  migration("20261007160000_notification_category_alerts"), "COMMIT;",
].join("\n");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "diewish-notification-ci-"));
const file = path.join(temporary, "schema.sql");
fs.writeFileSync(file, sql);
const result = spawnSync("psql", [process.env.DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-f", file], { stdio: "inherit" });
fs.rmSync(temporary, { recursive: true });
if (result.status !== 0) throw new Error("Isolated migration setup failed.");
(async () => {
  const clean = new PrismaClient({ datasources: { db: { url: cleanUrl.href } } });
  try {
    const columns = await clean.$queryRaw`SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name IN ('waterReminderSchedule', 'categoryAlerts') ORDER BY column_name`;
    assert.equal(columns.length, 2);
    for (const column of columns) {
      assert.equal(column.is_nullable, "YES");
      assert.equal(column.data_type, "jsonb");
    }
    const count = await clean.$queryRaw`SELECT COUNT(*) AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const expected = fs.readdirSync(path.join(__dirname, "../prisma/migrations"))
      .filter(name => fs.existsSync(path.join(__dirname, "../prisma/migrations", name, "migration.sql"))).length;
    assert.equal(Number(count[0].count), expected);
    const user = await clean.user.create({ data: { email: "clean-phase6@example.invalid", passwordHash: "isolated-test-only" } });
    const preference = await clean.notificationPreference.create({ data: { userId: user.id } });
    assert.equal(preference.waterReminderSchedule, null);
    assert.equal(preference.categoryAlerts, null);
    await clean.user.delete({ where: { id: user.id } });
    console.log(`Real PostgreSQL: all ${expected} migrations apply on a clean database; nullable account preferences work.`);
  } finally { await clean.$disconnect(); }
  const prisma = new PrismaClient();
  try {
    const old = await prisma.notificationPreference.findUniqueOrThrow({ where: { id: "legacy-pref" } });
    assert.equal(old.waterReminders, true);
    assert.equal(old.waterReminderTime, "13:55");
    assert.equal(old.waterReminderSchedule, null);
    assert.equal(old.categoryAlerts, null);
    console.log("Real PostgreSQL: Phase 2/4 migrations preserve legacy flags/times and NULL fields.");
  } finally { await prisma.$disconnect(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
