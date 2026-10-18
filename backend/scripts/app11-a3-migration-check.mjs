import assert from "node:assert/strict";
import fs from "node:fs";
import { URL } from "node:url";
import { PrismaClient } from "@prisma/client";
const url = new URL(process.env.DATABASE_URL);
assert.equal(process.env.APP11_ALLOW_DISPOSABLE_DB, "1");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
assert.equal(url.pathname, "/app11_a3_test");
const prisma = new PrismaClient({ log: [] });
const snapshotPath = process.env.APP11_A3_SNAPSHOT_FILE || "/tmp/app11-a3-migration.json";
const snapshot = () =>
  prisma.user.findMany({
    orderBy: { id: "asc" },
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
    for (const [kind, address, hasUsablePassword] of [
      ["PHONE", "phone.905551234567@phone.diewish.invalid", null],
      ["EMAIL", "a3-migration@example.com", true],
      ["GOOGLE", "a3-google@example.com", false],
    ]) {
      await prisma.user.create({
        data: {
          id: `a3-migration-${kind}`,
          email: address,
          passwordHash: "synthetic-existing-hash",
          hasUsablePassword,
          accountIdentities: {
            create: {
              kind,
              identifier:
                kind === "PHONE"
                  ? "+905551234567"
                  : kind === "EMAIL"
                    ? address
                    : "a3-existing-google-subject",
              verifiedAt: new Date("2026-01-01"),
            },
          },
          weightLogs: { create: { weightKg: 70 } },
          chatConversations: {
            create: {
              title: "synthetic-existing-Coach",
              messages: { create: { role: "USER", content: "synthetic-existing-message" } },
            },
          },
          subscriptions: { create: { tier: "PREMIUM", status: "ACTIVE", provider: "IYZICO" } },
        },
      });
    }
    fs.writeFileSync(snapshotPath, JSON.stringify(await snapshot()));
    let before = fs.readFileSync("prisma/schema.prisma", "utf8");
    for (const model of ["PhonePasswordChallenge", "PhonePasswordBudget"])
      before = before.replace(new RegExp("\\nmodel " + model + " \\{[^}]*\\}\\n"), "");
    fs.writeFileSync(process.env.APP11_A3_BASELINE_SCHEMA || "/tmp/app11-a3-before.prisma", before);
    console.log("A3 baseline captured: existing phone/email/Google fixtures and related records.");
  } else if (process.argv[2] === "verify") {
    assert.equal(JSON.stringify(await snapshot()), fs.readFileSync(snapshotPath, "utf8"));
    assert.equal(await prisma.phonePasswordChallenge.count(), 0);
    assert.equal(await prisma.phonePasswordBudget.count(), 0);
    await prisma.user.deleteMany({ where: { id: { startsWith: "a3-migration-" } } });
    console.log(
      "PASS: A3 additive migration preserved all pre-existing fields and inferred no accounts or passwords.",
    );
  } else throw new Error("Expected seed or verify");
} finally {
  await prisma.$disconnect();
}
