/* Ephemeral CI database only: execute the real migrations against legacy rows. */
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
