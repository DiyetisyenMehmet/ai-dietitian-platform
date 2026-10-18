import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { errorHandler } from "../middleware/error-handler";
import { notificationRouter } from "../modules/notifications/notification.routes";
import { notificationService } from "../modules/notifications/notification.service";
import { signAccessToken } from "../utils/jwt";

type Inbox = {
  notifications: { id: string; readAt: string | null }[];
  unreadCount: number;
  readBefore: string;
};

test("bulk inbox read is owner-scoped, unpaginated, durable and bounded to the observed deliveries", async (t) => {
  const [owner, other] = await Promise.all(
    ["owner", "other"].map((name) =>
      prisma.user.create({
        data: {
          email: `bulk-${name}-${randomUUID()}@example.invalid`,
          passwordHash: "synthetic-only",
        },
      }),
    ),
  );
  const app = express();
  app.use(express.json());
  app.use("/notifications", notificationRouter);
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/notifications`;
  const token = () => signAccessToken({ userId: owner.id, email: owner.email, role: owner.role });
  const request = (path: string, body?: unknown, bearer: string | null = token()) =>
    fetch(base + path, {
      method: body ? "PATCH" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
    await prisma.$disconnect();
  });
  const old = new Date(Date.now() - 86400000);
  const readAt = new Date(old.getTime() + 1);
  const future = new Date(Date.now() + 86400000);
  const row = (id: string, userId = owner.id) => ({
    id,
    userId,
    type: "PROACTIVE_MESSAGE" as const,
    title: "Sağlık koçundan bir mesaj",
    body: `Synthetic ${id}`,
    scheduledFor: old,
    deliveredAt: old,
  });
  const ids = Array.from({ length: 130 }, () => randomUUID());
  const already = randomUUID(),
    undelivered = randomUUID(),
    scheduled = randomUUID(),
    foreign = randomUUID();
  await prisma.notification.createMany({
    data: [
      ...ids.map((id, index) => ({ ...row(id), scheduledFor: new Date(old.getTime() + index) })),
      { ...row(already), readAt },
      { ...row(undelivered), deliveredAt: null },
      { ...row(scheduled), scheduledFor: future },
      row(foreign, other.id),
    ],
  });
  const beforeContent = await prisma.notification.findMany({
    where: { userId: owner.id },
    orderBy: { id: "asc" },
  });
  const snapshot = ((await (await request("/")).json()) as { data: Inbox }).data;
  assert.equal(snapshot.notifications.length, 100);
  assert.equal(snapshot.unreadCount, 130);
  assert.ok(snapshot.readBefore);
  assert.equal((await request("/read-all", { before: snapshot.readBefore }, null)).status, 401);
  assert.equal((await request("/read-all", { before: future.toISOString() })).status, 400);
  assert.equal((await request("/read-all", { before: "invalid" })).status, 422);
  assert.equal(
    (await request("/read-all", { before: snapshot.readBefore, userId: other.id })).status,
    422,
  );
  const boundary = new Date(snapshot.readBefore);
  const during = randomUUID(),
    exact = randomUUID();
  await prisma.notification.createMany({
    data: [
      { ...row(during), deliveredAt: new Date(boundary.getTime() + 1) },
      { ...row(exact), deliveredAt: boundary },
    ],
  });
  const responses = await Promise.all([
    request("/read-all", { before: snapshot.readBefore }),
    request("/read-all", { before: snapshot.readBefore }),
  ]);
  assert.ok(responses.every((response) => response.status === 200));
  const results = await Promise.all(
    responses.map((response) => response.json() as Promise<{ data: { updatedCount: number } }>),
  );
  assert.equal(
    results.reduce((sum, result) => sum + result.data.updatedCount, 0),
    130,
  );
  const fresh = new PrismaClient();
  try {
    assert.equal(
      await fresh.notification.count({ where: { id: { in: ids }, readAt: { not: null } } }),
      130,
    );
    for (const id of [undelivered, scheduled, foreign, during, exact]) {
      assert.equal((await fresh.notification.findUniqueOrThrow({ where: { id } })).readAt, null);
    }
    assert.equal(
      (await fresh.notification.findUniqueOrThrow({ where: { id: already } })).readAt?.getTime(),
      readAt.getTime(),
    );
    for (const original of beforeContent) {
      const current = await fresh.notification.findUniqueOrThrow({ where: { id: original.id } });
      assert.deepEqual({ ...current, readAt: null }, { ...original, readAt: null });
    }
  } finally {
    await fresh.$disconnect();
  }
  // An old local Android push outside the newest 100 still receives canonical read state.
  const withNative = (
    (await (await request(`/?nativeServerIds=${ids[0]},${foreign}`)).json()) as { data: Inbox }
  ).data;
  assert.ok(
    withNative.notifications.find(
      (item: { id: string; readAt: string | null }) => item.id === ids[0],
    )?.readAt,
  );
  assert.ok(!withNative.notifications.some((item: { id: string }) => item.id === foreign));
  const reentry = ((await (await request("/")).json()) as { data: Inbox }).data;
  assert.equal(reentry.unreadCount, 2);
  assert.equal((await notificationService.markAllRead(owner.id, boundary)).updatedCount, 0);
  const empty = await notificationService.markAllRead(other.id, old);
  assert.equal(empty.updatedCount, 0);
});
