// Only a disposable local database; never invoke against staging/production.
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { Client } from "pg";
const connection = new (await import("node:url")).URL(process.env.DATABASE_URL);
assert.equal(process.env.APP11_ALLOW_DISPOSABLE_DB, "1");
assert.ok(["127.0.0.1", "localhost"].includes(connection.hostname));
assert.equal(connection.pathname, "/app11_test");
const snapshotFile = process.env.APP11_SNAPSHOT_FILE || "/tmp/app11-migration-snapshot.json";
const tables = ["users", "weight_logs", "chat_conversations", "chat_messages"];
async function snapshot(client) {
  const result = {};
  for (const table of tables) {
    const rows = await client.query(
      `SELECT to_jsonb(t) - 'hasUsablePassword' AS row FROM "${table}" t ORDER BY id`,
    );
    result[table] = rows.rows.map((x) => x.row);
  }
  return result;
}
(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    if (process.argv[2] === "seed") {
      assert.equal((await client.query("SELECT count(*)::int AS n FROM users")).rows[0].n, 0);
      const emails = [
        "app11.legacy@example.com",
        "phone.905551110011@phone.diewish.invalid",
        "app11.google@example.com",
      ];
      for (let index = 0; index < emails.length; index++) {
        const id = `app11-legacy-${index}`;
        await client.query(
          'INSERT INTO users (id,email,"passwordHash","updatedAt","emailVerifiedAt") VALUES ($1,$2,$3,now(),$4)',
          [
            id,
            emails[index],
            "synthetic-legacy-hash-" + index,
            index === 2 ? new Date("2026-01-01") : null,
          ],
        );
        await client.query(
          'INSERT INTO weight_logs (id,"userId","weightKg",note) VALUES ($1,$2,70,$3)',
          [`app11-weight-${index}`, id, "synthetic preserved record"],
        );
        await client.query(
          'INSERT INTO chat_conversations (id,"userId",title,"updatedAt") VALUES ($1,$2,$3,now())',
          [`app11-chat-${index}`, id, "synthetic preserved conversation"],
        );
        await client.query(
          'INSERT INTO chat_messages (id,"conversationId",role,content) VALUES ($1,$2,$3,$4)',
          [`app11-message-${index}`, `app11-chat-${index}`, "USER", "synthetic preserved message"],
        );
      }
      // Compare inherited Prisma-vs-SQL drift before/after, rather than trying
      // to remove existing intentionally SQL-managed tables from the project.
      let baselineSchema = fs.readFileSync("prisma/schema.prisma", "utf8");
      for (const pattern of [
        /^.*hasUsablePassword\s+Boolean\?[^\n]*\n/m,
        /^.*accountIdentities\s+AccountIdentity\[\][^\n]*\n/m,
        /^.*identityOperations\s+AccountIdentityOperation\[\][^\n]*\n/m,
        /\nenum AccountIdentityKind \{[^}]*\}\n/,
        /\nmodel AccountIdentity \{[^}]*\}\n/,
        /\nenum AccountIdentityOperationPurpose \{[^}]*\}\n/,
        /\nmodel AccountIdentityOperation \{[^}]*\}\n/,
        /\nmodel PhonePasswordChallenge \{[^}]*\}\n/,
        /\nmodel PhonePasswordBudget \{[^}]*\}\n/,
      ]) {
        assert.ok(pattern.test(baselineSchema));
        baselineSchema = baselineSchema.replace(pattern, "");
      }
      fs.writeFileSync(
        process.env.APP11_BASELINE_SCHEMA_PATH || "/tmp/app11-before-schema.prisma",
        baselineSchema,
      );
      fs.writeFileSync(snapshotFile, JSON.stringify(await snapshot(client)));
      console.log("Migration baseline captured: 3 synthetic legacy accounts and related records.");
    } else if (process.argv[2] === "verify") {
      assert.deepEqual(await snapshot(client), JSON.parse(fs.readFileSync(snapshotFile, "utf8")));
      assert.equal(
        (
          await client.query(
            'SELECT count(*)::int AS n FROM users WHERE "hasUsablePassword" IS NULL',
          )
        ).rows[0].n,
        3,
      );
      assert.equal(
        (await client.query("SELECT count(*)::int AS n FROM account_identities")).rows[0].n,
        0,
      );
      console.log(
        "PASS: all baseline fields, IDs, hashes and related records unchanged; legacy password status unknown; no inferred links.",
      );
      console.log(
        "Snapshot SHA256: " +
          crypto
            .createHash("sha256")
            .update(JSON.stringify(await snapshot(client)))
            .digest("hex"),
      );
      await client.query("DELETE FROM users WHERE id LIKE $1", ["app11-legacy-%"]);
    } else throw new Error("Expected seed or verify");
  } finally {
    await client.end();
  }
})().catch(() => {
  console.error("APP11 migration preservation check failed.");
  process.exitCode = 1;
});
