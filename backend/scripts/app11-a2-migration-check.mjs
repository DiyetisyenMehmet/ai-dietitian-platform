import assert from "node:assert/strict";
import fs from "node:fs";
import { URL } from "node:url";
import { PrismaClient } from "@prisma/client";

const url = new URL(process.env.DATABASE_URL);
assert.equal(process.env.APP11_ALLOW_DISPOSABLE_DB, "1");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
assert.equal(url.pathname, "/app11_a2_test");
const prisma = new PrismaClient({ log: [] });
const id = "app11-a2-existing-fixture";
const snapshotPath = process.env.APP11_A2_SNAPSHOT_FILE || "/tmp/app11-a2-migration.json";
const snapshot = () =>
  prisma.user.findUniqueOrThrow({
    where: { id },
    include: {
      accountIdentities: true,
      weightLogs: true,
      chatConversations: { include: { messages: true } },
      subscriptions: true,
    },
  });
try {
  if (process.argv[2] === "seed") {
    assert.equal(await prisma.user.count(), 0);
    await prisma.user.create({
      data: {
        id,
        email: "a2-migration@example.com",
        passwordHash: "synthetic-existing-hash",
        hasUsablePassword: null,
        accountIdentities: {
          create: {
            kind: "GOOGLE",
            identifier: "synthetic-existing-google-sub",
            verifiedAt: new Date("2026-01-01"),
          },
        },
        weightLogs: { create: { weightKg: 70, note: "synthetic-existing-health" } },
        chatConversations: {
          create: {
            title: "synthetic-existing-Coach",
            messages: { create: { role: "USER", content: "synthetic-existing-message" } },
          },
        },
        subscriptions: { create: { tier: "PREMIUM", status: "ACTIVE", provider: "IYZICO" } },
      },
    });
    fs.writeFileSync(snapshotPath, JSON.stringify(await snapshot()));
    let before = fs.readFileSync("prisma/schema.prisma", "utf8");
    for (const pattern of [
      /^.*identityOperations\s+AccountIdentityOperation\[\][^\n]*\n/m,
      /\nenum AccountIdentityOperationPurpose \{[^}]*\}\n/,
      /\nmodel AccountIdentityOperation \{[^}]*\}\n/,
    ]) {
      assert.ok(pattern.test(before));
      before = before.replace(pattern, "");
    }
    fs.writeFileSync(process.env.APP11_A2_BASELINE_SCHEMA || "/tmp/app11-a2-before.prisma", before);
    console.log(
      "A2 baseline captured: pre-existing user, verified Google identity, health, Coach and subscription.",
    );
  } else if (process.argv[2] === "verify") {
    assert.equal(JSON.stringify(await snapshot()), fs.readFileSync(snapshotPath, "utf8"));
    assert.equal(await prisma.accountIdentityOperation.count(), 0);
    await prisma.user.delete({ where: { id } });
    console.log(
      "PASS: A2 migration preserved all pre-existing fixture fields and created no identity operations.",
    );
  } else throw new Error("Expected seed or verify");
} finally {
  await prisma.$disconnect();
}
