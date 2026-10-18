import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Client } from "pg";
import type { Notification } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { notificationService } from "../modules/notifications/notification.service";
import {
  getNotificationProvider,
  setNotificationProvider,
  type NotificationDeliveryResult,
} from "../modules/notifications/notification.provider";

// Every send is intercepted by a synthetic provider. The gate function exists
// only in the disposable test database; no product query or route exposes it.
if (process.env.NODE_ENV !== "test" || process.env.DIEWISH_ENVIRONMENT !== "test") {
  throw new Error("Concurrent dispatch evidence requires the isolated test environment.");
}
const worker = new AsyncLocalStorage<string>();
let gateFunction: string | null = null;
prisma.$use(async (params, next) => {
  if (
    worker.getStore() === "stale" &&
    gateFunction &&
    params.action === "queryRaw" &&
    typeof params.args?.query === "string" &&
    params.args.query.includes("FOR UPDATE OF n SKIP LOCKED")
  ) {
    // The SQL statement takes its MVCC snapshot, then waits before locking n.
    // All original predicates/parameters and transaction behavior stay intact.
    params.args.query = params.args.query.replace(
      'WHERE n."id" =',
      `WHERE public."${gateFunction}"() AND n."id" =`,
    );
  }
  return next(params);
});
function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function waitForGate(client: Client, name: string) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    const found = await client.query<{ waiting: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid <> pg_backend_pid()
       AND query LIKE $1 AND wait_event_type = 'Lock' AND wait_event = 'advisory') AS waiting`,
      [`%${name}%`],
    );
    if (found.rows[0]?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("The stale claimant did not reach the database snapshot gate.");
}
for (const scenario of [
  "new-state",
  "expired-lease",
  "retry-transition",
  "terminal-transition",
] as const) {
  test(
    `concurrent dispatch preserves claim ownership across a stale join snapshot: ${scenario}`,
    { timeout: 30000 },
    async (t) => {
      const original = getNotificationProvider();
      const controller = new Client({ connectionString: process.env.DATABASE_URL });
      const name = `app8_dispatch_gate_${randomUUID().replaceAll("-", "")}`;
      const key = parseInt(randomUUID().slice(0, 8), 16) % 2147483647;
      const firstSend = latch(),
        secondSend = latch(),
        finishProvider = latch();
      const calls: Array<{ id: string; worker: string | undefined }> = [];
      const pending: Promise<number>[] = [];
      let userId: string | null = null;
      await controller.connect();
      t.after(async () => {
        gateFunction = null;
        await controller.query("SELECT pg_advisory_unlock($1)", [key]);
        finishProvider.resolve();
        await Promise.allSettled(pending);
        setNotificationProvider(original);
        await controller.query(`DROP FUNCTION IF EXISTS public."${name}"()`);
        if (userId) await prisma.user.delete({ where: { id: userId } });
        await controller.end();
      });
      const user = await prisma.user.create({
        data: {
          email: `app8-dispatch-${randomUUID()}@example.invalid`,
          passwordHash: "synthetic-only",
        },
      });
      userId = user.id;
      await notificationService.updatePreferences(user.id, { waterReminders: true });
      const now = new Date();
      const notification = await notificationService.scheduleNotification(
        user.id,
        "WATER_REMINDER",
        "Synthetic notification",
        "No real delivery",
        new Date(now.getTime() - 1000),
      );
      if (scenario === "expired-lease") {
        const expired = new Date(now.getTime() - 1);
        await prisma.$executeRaw`INSERT INTO notification_delivery_state ("notificationId", "claimedUntil", "claimId", "updatedAt") VALUES (${notification.id}, ${expired}, ${randomUUID()}, CURRENT_TIMESTAMP)`;
      }
      // Prove that the experiment cannot accidentally count another due row.
      const due = await prisma.notification.findMany({
        where: { deliveredAt: null, scheduledFor: { lte: now } },
        select: { id: true },
      });
      assert.deepEqual(
        due.map((row) => row.id),
        [notification.id],
      );
      await controller.query(
        `CREATE FUNCTION public."${name}"() RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(${key}); RETURN true; END $$`,
      );
      await controller.query("SELECT pg_advisory_lock($1)", [key]);
      gateFunction = name;
      const disposition =
        scenario === "retry-transition"
          ? "retry"
          : scenario === "terminal-transition"
            ? "permanent_failure"
            : "delivered";
      setNotificationProvider({
        name: "app8-synthetic-only",
        async send(row: Notification): Promise<NotificationDeliveryResult> {
          calls.push({ id: row.id, worker: worker.getStore() });
          if (calls.length === 1) firstSend.resolve();
          else secondSend.resolve();
          await finishProvider.promise;
          return {
            disposition,
            deliveredDeviceKeys: disposition === "delivered" ? ["synthetic-device"] : [],
            code: "SYNTHETIC",
          };
        },
      });
      const stale = worker.run("stale", () => notificationService.dispatchDue(now));
      pending.push(stale);
      await waitForGate(controller, name);
      const first = worker.run("first", () => notificationService.dispatchDue(now));
      pending.push(first);
      await firstSend.promise;
      const leaseBefore = await controller.query(
        `SELECT "claimId" FROM notification_delivery_state WHERE "notificationId" = $1`,
        [notification.id],
      );
      if (scenario === "retry-transition" || scenario === "terminal-transition") {
        finishProvider.resolve();
        await first;
      }
      await controller.query("SELECT pg_advisory_unlock($1)", [key]);
      await Promise.race([secondSend.promise, stale]);
      const leaseAfter = await controller.query(
        `SELECT "claimId" FROM notification_delivery_state WHERE "notificationId" = $1`,
        [notification.id],
      );
      finishProvider.resolve();
      const results = await Promise.all(pending);
      console.log(
        "APP8_DISPATCH_EVIDENCE",
        JSON.stringify({
          scenario,
          calls,
          uniqueNotificationIds: new Set(calls.map((call) => call.id)).size,
          completedDeliveries: results.reduce((sum, count) => sum + count, 0),
          leaseChanged: leaseBefore.rows[0].claimId !== leaseAfter.rows[0].claimId,
        }),
      );
      assert.ok(calls.every((call) => call.id === notification.id));
      assert.equal(
        calls.length,
        1,
        "The same notification must never reach both synthetic senders.",
      );
      const stored = await prisma.notification.findUniqueOrThrow({
        where: { id: notification.id },
      });
      assert.equal(Boolean(stored.deliveredAt), disposition === "delivered");
      const state = await controller.query(
        `SELECT attempts, "nextAttemptAt", "failedAt" FROM notification_delivery_state WHERE "notificationId" = $1`,
        [notification.id],
      );
      assert.equal(state.rows[0].attempts, 1);
      if (disposition === "retry") assert.ok(state.rows[0].nextAttemptAt);
      if (disposition === "permanent_failure") assert.ok(state.rows[0].failedAt);
    },
  );
}
test.after(async () => {
  await prisma.$disconnect();
});
