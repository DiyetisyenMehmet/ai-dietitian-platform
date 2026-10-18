import assert from "node:assert/strict";
import fs from "node:fs";
import { URL } from "node:url";
import { PrismaClient } from "@prisma/client";
const url = new URL(process.env.DATABASE_URL);
assert.equal(process.env.APP11_ALLOW_DISPOSABLE_DB, "1");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
assert.equal(url.pathname, "/app11_a4_test");
const prisma = new PrismaClient({ log: [] }),
  id = "app11-a4-preexisting-fixture";
const file = process.env.APP11_A4_SNAPSHOT_FILE || "/tmp/app11-a4-snapshot.json";
const snapshot = async () => ({
  user: await prisma.user.findUniqueOrThrow({
    where: { id },
    include: {
      accountIdentities: true,
      weightLogs: true,
      chatConversations: { include: { messages: true } },
      subscriptions: true,
    },
  }),
  proof:
    await prisma.$queryRaw`SELECT id, "phoneNumber", "secretHash", "proofEventHash", "expectedUserId", "securityStamp", "expiresAt", "consumedAt", "createdAt" FROM phone_password_challenges WHERE id = ${id}`,
});
try {
  if (process.argv[2] === "seed") {
    await prisma.user.create({
      data: {
        id,
        email: "phone.905551234567@phone.diewish.invalid",
        passwordHash: "synthetic-existing-hash",
        hasUsablePassword: true,
        accountIdentities: {
          create: {
            kind: "PHONE",
            identifier: "+905551234567",
            verifiedAt: new Date("2026-01-01"),
          },
        },
        weightLogs: { create: { weightKg: 70 } },
        chatConversations: {
          create: {
            title: "existing-Coach",
            messages: { create: { role: "USER", content: "synthetic existing message" } },
          },
        },
        subscriptions: { create: { tier: "PREMIUM", status: "ACTIVE", provider: "IYZICO" } },
      },
    });
    await prisma.$executeRaw`INSERT INTO phone_password_challenges (id, "phoneNumber", "secretHash", "proofEventHash", "expiresAt") VALUES (${id}, '+905551234567', ${"a".repeat(64)}, ${"b".repeat(64)}, CURRENT_TIMESTAMP + INTERVAL '1 minute')`;
    fs.writeFileSync(file, JSON.stringify(await snapshot()));
    let before = fs.readFileSync("prisma/schema.prisma", "utf8");
    const block = before.match(/model PhonePasswordChallenge \{[^}]*\}/)[0];
    const old = block
      .replace(/^.*purpose\s+String[^\n]*\n/m, "")
      .replace(/^.*verifiedAt\s+DateTime\?[^\n]*\n/m, "")
      .replace(/^.*failedAttempts\s+Int[^\n]*\n/m, "")
      .replace(/proofEventHash String\?/, "proofEventHash String");
    fs.writeFileSync(
      process.env.APP11_A4_BASELINE_SCHEMA || "/tmp/app11-a4-before.prisma",
      before.replace(block, old),
    );
    console.log(
      "A4 baseline saved: existing account, verified phone, pending A3 operation and related records.",
    );
  } else if (process.argv[2] === "verify") {
    assert.equal(JSON.stringify(await snapshot()), fs.readFileSync(file, "utf8"));
    const proof = await prisma.phonePasswordChallenge.findUniqueOrThrow({ where: { id } });
    assert.equal(proof.purpose, "INITIAL_PASSWORD");
    assert.equal(proof.verifiedAt, null);
    assert.equal(proof.failedAttempts, 0);
    await prisma.phonePasswordChallenge.delete({ where: { id } });
    await prisma.user.delete({ where: { id } });
    console.log(
      "PASS: A4 migration preserved existing account/data/A3 proof and enabled no recovery.",
    );
  } else throw new Error("Expected seed or verify");
} finally {
  await prisma.$disconnect();
}
