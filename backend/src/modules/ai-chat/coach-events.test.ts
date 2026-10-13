import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import {
  changeSchema,
  recordCoachChange,
  publishCoachChange,
  CoachEventBroker,
  coachBroker,
  readCoachVersions,
} from "./coach-events";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
const userId = "11111111-1111-4111-8111-111111111111";
const conversationId = "22222222-2222-4222-8222-222222222222";
const waitUntil = async (check: () => boolean) => {
  const deadline = Date.now() + 1500;
  while (!check()) {
    assert.ok(Date.now() < deadline, "bounded test deadline");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};
const observer = () => {
  const versions: string[] = [],
    changes: unknown[] = [];
  let disconnects = 0;
  return {
    versions,
    changes,
    get disconnects() {
      return disconnects;
    },
    subscriber: {
      revised: (version: string) => {
        versions.push(version);
      },
      changed: (event: unknown) => {
        changes.push(event);
      },
      disconnected: () => {
        disconnects++;
      },
    },
  };
};
test("event envelope strictly excludes PHI, credentials and extra fields", () => {
  const valid = { userId, conversationId, type: "turn", version: "1" };
  assert.ok(changeSchema.safeParse(valid).success);
  for (const field of ["content", "health", "token", "title", "allergies"]) {
    assert.ok(!changeSchema.safeParse({ ...valid, [field]: "secret" }).success);
  }
  for (const version of ["-1", "1.5", "0", "1e3"])
    assert.ok(!changeSchema.safeParse({ ...valid, version }).success);
});
test("durable watermark increment uses the caller's transaction and owner", async () => {
  let argumentsReceived: unknown;
  const tx = {
    coachSyncRevision: {
      upsert: async (args: unknown) => {
        argumentsReceived = args;
        return { version: 9007199254740993n };
      },
    },
  };
  const change = await recordCoachChange(
    tx as unknown as Prisma.TransactionClient,
    userId,
    conversationId,
    "deleted",
  );
  assert.equal(change.version, "9007199254740993");
  assert.deepEqual(argumentsReceived, {
    where: { userId },
    create: { userId, version: 1n },
    update: { version: { increment: 1n } },
  });
});

test("metadata reader scopes and bounds the existing pool query without conversation data", async () => {
  const original = prisma.coachSyncRevision.findMany;
  let args: unknown;
  try {
    prisma.coachSyncRevision.findMany = (async (value: unknown) => {
      args = value;
      return [];
    }) as typeof original;
    await readCoachVersions([userId]);
    assert.deepEqual(args, {
      where: { userId: { in: [userId] } },
      select: { userId: true, version: true },
      take: 20,
    });
  } finally {
    prisma.coachSyncRevision.findMany = original;
  }
});
test("one metadata batch fans out only to its owner, stops idle, and ignores duplicate revisions", async () => {
  let revision = 1n;
  const queried: string[][] = [];
  const broker = new CoachEventBroker(async (ids) => {
    queried.push(ids);
    return [{ userId, version: revision }];
  }, 10);
  const a = observer(),
    b = observer(),
    stranger = observer();
  const releases = await Promise.all([
    broker.subscribe(userId, a.subscriber),
    broker.subscribe(userId, b.subscriber),
    broker.subscribe(conversationId, stranger.subscriber),
  ]);
  try {
    await waitUntil(() => queried.length >= 2);
    assert.deepEqual(a.versions, ["1"]);
    assert.deepEqual(b.versions, ["1"]);
    assert.deepEqual(stranger.versions, ["0"]);
    assert.deepEqual(queried[0], [userId, conversationId]);
    revision = 2n;
    await waitUntil(() => a.versions.length === 2);
    assert.deepEqual(b.versions, ["1", "2"]);
    assert.deepEqual(stranger.versions, ["0"]);
  } finally {
    releases.forEach((release) => release());
  }
  const reads = queried.length;
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(queried.length, reads);
  assert.equal(broker.activeConnections, 0);
});
test("simultaneous subscriptions enforce account and process caps atomically", async () => {
  const broker = new CoachEventBroker(async () => []);
  try {
    const subscriptions = await Promise.allSettled(
      Array.from({ length: 20 }, () => broker.subscribe(userId, observer().subscriber)),
    );
    assert.equal(subscriptions.filter((x) => x.status === "fulfilled").length, 6);
    for (let i = 0; i < 14; i++) await broker.subscribe(`owner-${i}`, observer().subscriber);
    assert.equal(broker.activeConnections, 20);
    await assert.rejects(broker.subscribe("overflow", observer().subscriber), /capacity/);
  } finally {
    broker.close();
  }
});
test("stalled query closes streams and cannot multiply queries or deliver to a new session", async () => {
  let resolveRead!: (value: { userId: string; version: bigint }[]) => void;
  let reads = 0;
  const broker = new CoachEventBroker(
    () => {
      reads++;
      return new Promise((resolve) => {
        resolveRead = resolve;
      });
    },
    5,
    20,
  );
  const a = observer();
  await broker.subscribe(userId, a.subscriber);
  await waitUntil(() => a.disconnects === 1);
  assert.equal(broker.activeConnections, 0);
  assert.equal(broker.available, false);
  await assert.rejects(broker.subscribe(userId, observer().subscriber), /unavailable/);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(reads, 1);
  resolveRead([{ userId, version: 7n }]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(a.versions, []);
  assert.equal(reads, 1);
  broker.close();
});
test("released group never receives a late result, even for a newly opened same-owner stream", async () => {
  let resolveRead!: (value: { userId: string; version: bigint }[]) => void;
  const broker = new CoachEventBroker(
    () =>
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    5,
  );
  const old = observer(),
    next = observer();
  const release = await broker.subscribe(userId, old.subscriber);
  await waitUntil(() => !!resolveRead);
  release();
  await broker.subscribe(userId, next.subscriber);
  resolveRead([{ userId, version: 9n }]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(old.versions, []);
  assert.deepEqual(next.versions, []);
  broker.close();
});
test("query failure disconnects only current subscribers and enters cooldown", async () => {
  const broker = new CoachEventBroker(async () => {
    throw new Error("synthetic failure");
  }, 5);
  const a = observer();
  await broker.subscribe(userId, a.subscriber);
  await waitUntil(() => a.disconnects === 1);
  assert.equal(broker.available, false);
  assert.equal(broker.activeConnections, 0);
  broker.close();
});
test("local post-commit path is owner-only, validates its envelope, and stays inert when disabled", async () => {
  const enabled = env.COACH_SYNC_ENABLED;
  const a = observer(),
    other = observer();
  await coachBroker.subscribe(userId, a.subscriber);
  await coachBroker.subscribe(conversationId, other.subscriber);
  try {
    env.COACH_SYNC_ENABLED = false;
    publishCoachChange({ userId, conversationId, type: "turn", version: "1" });
    assert.equal(a.changes.length, 0);
    env.COACH_SYNC_ENABLED = true;
    publishCoachChange({ userId, conversationId, type: "turn", version: "2" });
    assert.equal(a.changes.length, 1);
    assert.equal(other.changes.length, 0);
    publishCoachChange({ userId, conversationId, type: "turn", version: "2" });
    assert.equal(a.changes.length, 1);
    const original = coachBroker.publish;
    try {
      coachBroker.publish = () => {
        throw new Error("delivery failure");
      };
      assert.doesNotThrow(() =>
        publishCoachChange({ userId, conversationId, type: "turn", version: "3" }),
      );
    } finally {
      coachBroker.publish = original;
    }
  } finally {
    env.COACH_SYNC_ENABLED = enabled;
    coachBroker.close();
  }
});
