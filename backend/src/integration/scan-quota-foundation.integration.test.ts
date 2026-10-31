import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import { PrismaClient, type Prisma } from "@prisma/client";
import { createApp } from "../app";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/api-error";
import { signAccessToken } from "../utils/jwt";
import { createScanQuotaService } from "../modules/ai-usage/scan-quota.service";
import { readEffectiveSubscriptionState } from "../modules/payments/subscription-state";
import { googlePlayEntitlementsRepository } from "../modules/payments/google-play-entitlements.repository";

const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  process.env.NODE_ENV !== "test" ||
  process.env.DIEWISH_ENVIRONMENT !== "test" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) ||
  database.pathname !== "/diewish_scan_quota_test"
) {
  throw new Error("Scan quota fixtures require the named disposable loopback test database.");
}

const config = {
  ...env,
  SCAN_QUOTA_FOUNDATION_ENABLED: true,
  SCAN_QUOTA_HASH_SECRET: "synthetic-scan-hash-secret-not-for-live-use",
};
const secondDb = new PrismaClient(); // Independent connection pool, like another device/server.
const service = createScanQuotaService(prisma, () => config);
const secondService = createScanQuotaService(secondDb, () => config);
const matches = (code: string) => (e: unknown) => e instanceof ApiError && e.code === code;
const photo = (text: string = randomUUID(), idempotencyKey: string = randomUUID()) => ({
  feature: "PHOTO_SCAN" as const,
  input: Buffer.from(text),
  idempotencyKey,
});
function barcode(index: number) {
  const body = `869${String(index).padStart(9, "0")}`;
  const total = [...body].reduce((sum, char, i) => sum + Number(char) * (i % 2 ? 3 : 1), 0);
  return `${body}${(10 - (total % 10)) % 10}`;
}
const product = (index: number, idempotencyKey = randomUUID()) => ({
  feature: "BARCODE_SCAN" as const,
  barcode: barcode(index),
  idempotencyKey,
});
const persist =
  (userId: string, feature: "PHOTO_SCAN" | "BARCODE_SCAN") =>
  async (tx: Prisma.TransactionClient) => {
    // Existing result stores, synthetic content only; quota rows keep references.
    const rows =
      feature === "PHOTO_SCAN"
        ? await tx.$queryRaw<Array<{ id: bigint }>>`
          INSERT INTO nutrition_photo_scans (user_id, dish_name, payload)
          VALUES (${userId}, 'Synthetic fixture', '{}'::jsonb) RETURNING id
        `
        : await tx.$queryRaw<Array<{ id: bigint }>>`
          INSERT INTO nutrition_barcode_scans (user_id, barcode, provider, payload)
          VALUES (${userId}, ${barcode(1)}, 'SYNTHETIC', '{}'::jsonb) RETURNING id
        `;
    return {
      resultRef: `${feature === "PHOTO_SCAN" ? "photo" : "barcode"}:${rows[0].id}`,
      provider: "SYNTHETIC",
      model: "scan-quota-test",
    };
  };

test(
  "scan foundation: real PostgreSQL reservations, atomic success and isolation",
  { timeout: 120_000 },
  async (t) => {
    const ids: string[] = [];
    const fixture = async () => {
      const user = await prisma.user.create({
        data: {
          email: `quota-${randomUUID()}@example.invalid`,
          passwordHash: "synthetic-not-a-login",
        },
      });
      ids.push(user.id);
      return user.id;
    };
    t.after(async () => {
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
      await secondDb.$disconnect();
      await prisma.$disconnect();
    });
    const succeed = async (userId: string, input = photo()) => {
      const op = await service.reserve(userId, input);
      assert.equal(op.disposition, "RESERVED");
      return service.complete(
        userId,
        op.operationId,
        op.attemptToken!,
        persist(userId, input.feature),
      );
    };

    await t.test(
      "three successful photos consume three lifetime rights; fourth reservation is rejected",
      async () => {
        const user = await fixture();
        for (let used = 0; used < 3; used++) {
          const op = await service.reserve(user, photo());
          assert.equal(op.quota.remaining, 3 - used);
          assert.equal(op.quota.inFlight, 1);
          const done = await service.complete(
            user,
            op.operationId,
            op.attemptToken!,
            persist(user, "PHOTO_SCAN"),
          );
          assert.equal(done.quota.used, used + 1);
          assert.equal(done.quota.remaining, 2 - used);
          assert.equal(done.quota.inFlight, 0);
          assert.equal(done.quota.resetsAt, null);
        }
        await assert.rejects(service.reserve(user, photo()), matches("FREE_SCAN_QUOTA_EXHAUSTED"));
        assert.equal((await service.getStatus(user, "BARCODE_SCAN")).remaining, 3);
      },
    );

    await t.test(
      "two independent clients compete for the final right: one reservation, one success",
      async () => {
        const user = await fixture();
        await succeed(user);
        await succeed(user);
        const results = await Promise.allSettled([
          service.reserve(user, photo()),
          secondService.reserve(user, photo()),
        ]);
        const granted = results.filter((x) => x.status === "fulfilled");
        const refused = results.filter((x) => x.status === "rejected");
        assert.equal(granted.length, 1);
        assert.equal(refused.length, 1);
        assert.equal(matches("SCAN_QUOTA_IN_PROGRESS")(refused[0].reason), true);
        const op = granted[0].value;
        await service.complete(user, op.operationId, op.attemptToken!, persist(user, "PHOTO_SCAN"));
        assert.equal((await service.getStatus(user, "PHOTO_SCAN")).used, 3);
      },
    );

    await t.test(
      "double click and lost responses replay one operation; a changed input conflicts",
      async () => {
        const user = await fixture(),
          input = photo();
        const [first, second] = await Promise.all([
          service.reserve(user, input),
          secondService.reserve(user, input),
        ]);
        assert.equal(first.operationId, second.operationId);
        assert.deepEqual([first.disposition, second.disposition].sort(), [
          "IN_PROGRESS",
          "RESERVED",
        ]);
        const worker = first.attemptToken ? first : second;
        let writes = 0;
        const callback = async (tx: Prisma.TransactionClient) => {
          writes++;
          return persist(user, "PHOTO_SCAN")(tx);
        };
        const [a, b] = await Promise.all([
          service.complete(user, worker.operationId, worker.attemptToken!, callback),
          secondService.complete(user, worker.operationId, worker.attemptToken!, callback),
        ]);
        assert.equal(writes, 1);
        assert.equal(a.resultRef, b.resultRef);
        const replay = await service.reserve(user, input);
        assert.equal(replay.disposition, "REPLAY");
        assert.equal(replay.attemptToken, null);
        assert.equal((await service.getOperation(user, replay.operationId)).quota.used, 1);
        await assert.rejects(
          service.reserve(user, photo("changed", input.idempotencyKey)),
          matches("SCAN_QUOTA_REQUEST_MISMATCH"),
        );
      },
    );

    await t.test(
      "provider failure and explicit cancellation release capacity without decrement",
      async () => {
        const user = await fixture();
        for (const outcome of ["FAILED", "CANCELED"] as const) {
          const op = await service.reserve(user, photo());
          const released = await service.release(user, op.operationId, op.attemptToken!, outcome);
          assert.equal(released.status, outcome);
          assert.equal(released.quota.used, 0);
          assert.equal(released.quota.remaining, 3);
          assert.equal(released.quota.inFlight, 0);
          await assert.rejects(
            service.complete(user, op.operationId, op.attemptToken!, persist(user, "PHOTO_SCAN")),
            matches("SCAN_QUOTA_OPERATION_CLOSED"),
          );
          assert.equal(
            (await service.release(user, op.operationId, op.attemptToken!, outcome)).quota.used,
            0,
          );
        }
      },
    );

    await t.test("empty/invalid success never consumes; invalid input never reserves", async () => {
      const user = await fixture();
      await assert.rejects(service.reserve(user, photo("")), matches("SCAN_QUOTA_INPUT_INVALID"));
      await assert.rejects(
        service.reserve(user, { ...product(1), barcode: "not-a-barcode" }),
        matches("INVALID_BARCODE"),
      );
      const op = await service.reserve(user, photo());
      for (const invalid of [null, { resultRef: "", provider: "SYNTHETIC", model: "test" }])
        await assert.rejects(
          service.complete(user, op.operationId, op.attemptToken!, async () => invalid),
          matches("SCAN_QUOTA_RESULT_INVALID"),
        );
      assert.equal((await service.getStatus(user, "PHOTO_SCAN")).remaining, 3);
      assert.equal(await prisma.aiUsageEvent.count({ where: { userId: user } }), 0);
      await service.release(user, op.operationId, op.attemptToken!, "FAILED");
    });

    await t.test(
      "database failure after result and usage writes rolls everything back",
      async () => {
        const user = await fixture(),
          op = await service.reserve(user, photo());
        const name = `quota_fail_${randomUUID().replaceAll("-", "")}`;
        // Identifiers/UUID are generated test fixtures, never request content.
        await prisma.$executeRawUnsafe(`CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW."userId" = '${user}' AND NEW."status" = 'SUCCEEDED'
      THEN RAISE EXCEPTION 'synthetic commit failure'; END IF; RETURN NEW; END $$`);
        await prisma.$executeRawUnsafe(
          `CREATE TRIGGER "${name}" BEFORE UPDATE ON scan_quota_operations FOR EACH ROW EXECUTE FUNCTION "${name}"()`,
        );
        try {
          await assert.rejects(
            service.complete(user, op.operationId, op.attemptToken!, persist(user, "PHOTO_SCAN")),
          );
          assert.equal(await prisma.aiUsageEvent.count({ where: { userId: user } }), 0);
          const rows = await prisma.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT COUNT(*) AS count FROM nutrition_photo_scans WHERE user_id = ${user}`;
          assert.equal(Number(rows[0].count), 0);
          assert.equal((await service.getOperation(user, op.operationId)).status, "RESERVED");
          assert.equal((await service.getStatus(user, "PHOTO_SCAN")).remaining, 3);
        } finally {
          await prisma.$executeRawUnsafe(`DROP TRIGGER "${name}" ON scan_quota_operations`);
          await prisma.$executeRawUnsafe(`DROP FUNCTION "${name}"()`);
        }
        const done = await service.complete(
          user,
          op.operationId,
          op.attemptToken!,
          persist(user, "PHOTO_SCAN"),
        );
        assert.equal(done.quota.used, 1);
      },
    );

    await t.test(
      "expired barcode lease can be replaced; its late completion cannot consume",
      async () => {
        const user = await fixture(),
          first = await service.reserve(user, product(1));
        await prisma.scanQuotaOperation.update({
          where: { id: first.operationId },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
        assert.equal((await service.getOperation(user, first.operationId)).status, "EXPIRED");
        assert.equal((await service.getStatus(user, "BARCODE_SCAN")).inFlight, 0);
        const next = await service.reserve(user, product(1));
        assert.notEqual(next.operationId, first.operationId);
        await assert.rejects(
          service.complete(
            user,
            first.operationId,
            first.attemptToken!,
            persist(user, "BARCODE_SCAN"),
          ),
          matches("SCAN_QUOTA_OPERATION_CLOSED"),
        );
        await service.complete(
          user,
          next.operationId,
          next.attemptToken!,
          persist(user, "BARCODE_SCAN"),
        );
        assert.equal((await service.getStatus(user, "BARCODE_SCAN")).used, 1);
      },
    );

    await t.test(
      "normalized barcode and retry-key aliases share one success; aliases cannot change input",
      async () => {
        const user = await fixture(),
          a = product(1),
          b = { ...product(1), barcode: ` ${barcode(1).slice(0, 4)}-${barcode(1).slice(4)} ` };
        const [first, second] = await Promise.all([
          service.reserve(user, a),
          secondService.reserve(user, b),
        ]);
        assert.equal(first.operationId, second.operationId);
        const worker = first.attemptToken ? first : second;
        await service.complete(
          user,
          worker.operationId,
          worker.attemptToken!,
          persist(user, "BARCODE_SCAN"),
        );
        const alias = product(1);
        const reopened = await service.reserve(user, alias);
        assert.equal(reopened.disposition, "REPLAY");
        assert.equal(reopened.quota.used, 1);
        assert.equal(await prisma.scanQuotaRequest.count({ where: { userId: user } }), 3);
        await assert.rejects(
          service.reserve(user, product(2, alias.idempotencyKey)),
          matches("SCAN_QUOTA_REQUEST_MISMATCH"),
        );
        const stored = await prisma.scanQuotaOperation.findUniqueOrThrow({
          where: { id: worker.operationId },
        });
        assert.notEqual(stored.subjectHash, barcode(1));
        assert.equal(stored.subjectHash?.length, 64);
        await assert.rejects(
          prisma.scanQuotaOperation.create({
            data: {
              userId: user,
              feature: "BARCODE_SCAN",
              inputHash: stored.inputHash,
              subjectHash: stored.subjectHash,
              expiresAt: new Date(Date.now() + 60_000),
            },
          }),
          (e: unknown) => e instanceof Error && "code" in e && e.code === "P2002",
        );
      },
    );

    await t.test(
      "three new barcode products exhaust quota, but an old product remains free",
      async () => {
        const user = await fixture();
        for (const index of [1, 2, 3]) {
          const op = await service.reserve(user, product(index));
          const done = await service.complete(
            user,
            op.operationId,
            op.attemptToken!,
            persist(user, "BARCODE_SCAN"),
          );
          assert.equal(done.quota.remaining, 3 - index);
        }
        await assert.rejects(
          service.reserve(user, product(4)),
          matches("FREE_SCAN_QUOTA_EXHAUSTED"),
        );
        const old = await service.reserve(user, product(1));
        assert.equal(old.disposition, "REPLAY");
        assert.equal(old.quota.used, 3);
        assert.equal(old.quota.inFlight, 0);
      },
    );

    await t.test(
      "account isolation, request scope and wrong worker token reject writes",
      async () => {
        const owner = await fixture(),
          other = await fixture(),
          input = photo();
        const a = await service.reserve(owner, input),
          b = await service.reserve(other, input);
        assert.notEqual(a.operationId, b.operationId);
        await assert.rejects(
          service.getOperation(other, a.operationId),
          matches("SCAN_QUOTA_OPERATION_NOT_FOUND"),
        );
        await assert.rejects(
          service.complete(other, a.operationId, a.attemptToken!, persist(other, "PHOTO_SCAN")),
          matches("SCAN_QUOTA_OPERATION_NOT_FOUND"),
        );
        await assert.rejects(
          service.release(other, a.operationId, a.attemptToken!, "CANCELED"),
          matches("SCAN_QUOTA_OPERATION_NOT_FOUND"),
        );
        await assert.rejects(
          service.complete(owner, a.operationId, randomUUID(), persist(owner, "PHOTO_SCAN")),
          matches("SCAN_QUOTA_ATTEMPT_MISMATCH"),
        );
        await assert.rejects(
          service.release(owner, a.operationId, randomUUID(), "FAILED"),
          matches("SCAN_QUOTA_ATTEMPT_MISMATCH"),
        );
        await assert.rejects(
          prisma.scanQuotaRequest.create({
            data: {
              userId: other,
              feature: "PHOTO_SCAN",
              idempotencyKey: randomUUID(),
              inputHash: "a".repeat(64),
              operationId: a.operationId,
            },
          }),
        );
        assert.equal((await service.getStatus(other, "PHOTO_SCAN")).used, 0);
      },
    );

    await t.test(
      "cancellation/completion races are terminal; post-success cancellation is not a refund",
      async () => {
        const user = await fixture(),
          op = await service.reserve(user, photo());
        const results = await Promise.allSettled([
          service.complete(user, op.operationId, op.attemptToken!, persist(user, "PHOTO_SCAN")),
          secondService.release(user, op.operationId, op.attemptToken!, "CANCELED"),
        ]);
        assert.ok(results.some((x) => x.status === "fulfilled"));
        const final = await service.getOperation(user, op.operationId);
        assert.ok(final.status === "SUCCEEDED" || final.status === "CANCELED");
        assert.equal(final.quota.used, final.status === "SUCCEEDED" ? 1 : 0);
        const success = await succeed(user);
        const row = await prisma.scanQuotaOperation.findUniqueOrThrow({
          where: { id: success.operationId },
        });
        const late = await service.release(user, success.operationId, row.attemptToken, "CANCELED");
        assert.equal(late.status, "SUCCEEDED");
        assert.equal(late.quota.used, success.quota.used);
      },
    );

    await t.test(
      "canonical paid/Support/Play rights are not rewritten or given invented scan quotas",
      async () => {
        for (const source of ["IYZICO", "GOOGLE_PLAY", "ADMIN_SUPPORT"] as const) {
          const user = await fixture(),
            expiresAt = new Date(Date.now() + 86_400_000);
          if (source === "IYZICO") {
            await prisma.user.update({
              where: { id: user },
              data: { subscriptionTier: "PREMIUM" },
            });
            await prisma.subscription.create({
              data: {
                userId: user,
                tier: "PREMIUM",
                status: "ACTIVE",
                currentPeriodStart: new Date(),
                currentPeriodEnd: expiresAt,
              },
            });
          } else if (source === "GOOGLE_PLAY") {
            await googlePlayEntitlementsRepository.grantVerified({
              userId: user,
              tier: "PREMIUM",
              purchaseTokenHash: randomUUID(),
              linkedPurchaseTokenHash: null,
              productId: "synthetic-no-store-call",
              orderId: null,
              rawState: "SUBSCRIPTION_STATE_ACTIVE",
              startedAt: new Date(),
              expiresAt,
            });
          } else
            await prisma.adminSupportEntitlement.create({
              data: { userId: user, tier: "PREMIUM_PLUS", expiresAt },
            });
          const before = await readEffectiveSubscriptionState(user);
          const state = await service.getStatus(user, "PHOTO_SCAN");
          assert.equal(state.tier, before!.tier);
          assert.equal(state.reason, "SCAN_QUOTA_PAID_POLICY_UNDEFINED");
          await assert.rejects(
            service.reserve(user, photo()),
            matches("SCAN_QUOTA_PAID_POLICY_UNDEFINED"),
          );
          const after = await readEffectiveSubscriptionState(user);
          assert.deepEqual(after, before);
          assert.equal(await prisma.scanQuotaOperation.count({ where: { userId: user } }), 0);
        }
        const stale = await fixture();
        await prisma.user.update({
          where: { id: stale },
          data: { subscriptionTier: "PREMIUM_PLUS" },
        });
        assert.equal((await service.getStatus(stale, "PHOTO_SCAN")).tier, "FREE");
        assert.equal(
          (await prisma.user.findUniqueOrThrow({ where: { id: stale } })).subscriptionTier,
          "PREMIUM_PLUS",
        );
      },
    );

    await t.test(
      "success survives history deletion; account deletion still cascades safely",
      async () => {
        const user = await fixture(),
          done = await succeed(user);
        await prisma.$executeRaw`DELETE FROM nutrition_photo_scans WHERE user_id = ${user}`;
        assert.equal((await service.getStatus(user, "PHOTO_SCAN")).remaining, 2);
        await prisma.user.delete({ where: { id: user } });
        assert.equal(await prisma.scanQuotaOperation.count({ where: { userId: user } }), 0);
        assert.equal(await prisma.scanQuotaRequest.count({ where: { userId: user } }), 0);
        assert.equal(await prisma.aiUsageEvent.count({ where: { userId: user } }), 0);
        await assert.rejects(
          service.getOperation(user, done.operationId),
          matches("SCAN_QUOTA_OPERATION_NOT_FOUND"),
        );
      },
    );

    await t.test(
      "default OFF HTTP usage response still contains exactly the original three features",
      async () => {
        assert.equal(env.SCAN_QUOTA_FOUNDATION_ENABLED, false);
        const user = await fixture();
        const server = createApp().listen(0, "127.0.0.1");
        await once(server, "listening");
        try {
          const address = server.address();
          assert.ok(address && typeof address !== "string");
          const token = signAccessToken({
            userId: user,
            email: "quota-http@example.invalid",
            role: "USER",
          });
          const endpoint = `http://127.0.0.1:${address.port}/api/ai-usage`;
          const blocked = await fetch(endpoint, {
            headers: { authorization: `Bearer ${token}` },
          });
          assert.equal(blocked.status, 403);
          const rejection = (await blocked.json()) as { error: { code: string } };
          assert.equal(rejection.error.code, "ONBOARDING_REQUIRED");
          await prisma.user.update({ where: { id: user }, data: { onboardingCompleted: true } });
          const response = await fetch(endpoint, {
            headers: { authorization: `Bearer ${token}` },
          });
          assert.equal(response.status, 200);
          const payload = (await response.json()) as {
            data: { usage: Array<{ feature: string }> };
          };
          assert.deepEqual(payload.data.usage.map((x) => x.feature).sort(), [
            "BLOOD_TEST_ANALYSIS",
            "DIETITIAN_CHAT",
            "NUTRITION_PLAN",
          ]);
          assert.equal(await prisma.scanQuotaOperation.count({ where: { userId: user } }), 0);
        } finally {
          await new Promise<void>((resolve, reject) =>
            server.close((e) => (e ? reject(e) : resolve())),
          );
        }
      },
    );
  },
);
