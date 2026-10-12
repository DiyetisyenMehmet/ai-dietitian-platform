import assert from "node:assert/strict";
import test from "node:test";
import { fork, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import jwt from "jsonwebtoken";
import { Client } from "pg";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { signAccessToken } from "../utils/jwt";
import {
  COACH_CHANNEL,
  COACH_LISTENER_ROLE,
  verifyCoachListener,
} from "../modules/ai-chat/coach-events";
import { prepareCoachListenerFixture } from "./helpers/coach-listener-fixture";

interface Frame {
  type: string;
  data: Record<string, string>;
  at: number;
}
interface Metrics {
  userUs: number;
  systemUs: number;
  rss: number;
  heap: number;
  connections: number;
  chatReads: number;
}
const metrics = (child: ChildProcess) =>
  bounded(
    new Promise<Metrics>((resolve) => {
      child.once("message", (message) => resolve(message as Metrics));
      child.send({ command: "metrics" });
    }),
  );
async function waitConnections(child: ChildProcess, expected: number): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if ((await metrics(child)).connections === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail("Temporary Coach connection cleanup deadline exceeded");
}
const bounded = <T>(promise: Promise<T>, ms = 5000): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Coach test deadline exceeded")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
let listenerUrl: string;
async function startServer(
  connectionString = listenerUrl,
): Promise<{ child: ChildProcess; base: string }> {
  const child = fork(path.join(__dirname, "helpers/coach-server.ts"), [], {
    execArgv: ["--import", "tsx"],
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    env: {
      ...process.env,
      NODE_ENV: "test",
      DIEWISH_ENVIRONMENT: "test",
      COACH_SYNC_ENABLED: "true",
      COACH_SYNC_DATABASE_URL: connectionString,
    },
  });
  const port = await bounded(
    new Promise<number>((resolve, reject) => {
      child.once("message", (message) => resolve((message as { port: number }).port));
      child.once("exit", () => reject(new Error("Coach test server exited")));
    }),
    15000,
  );
  return { child, base: `http://127.0.0.1:${port}/api` };
}
async function connect(base: string, token: string) {
  const abort = new AbortController();
  const response = await bounded(
    fetch(base + "/ai-chat/events", {
      headers: { authorization: `Bearer ${token}` },
      signal: abort.signal,
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-encoding"), null);
  assert.ok(response.headers.get("cache-control")?.includes("no-store"));
  const frames: Frame[] = [],
    callbacks = new Set<() => void>();
  const reader = response.body!.getReader();
  const done = (async () => {
    let buffer = "";
    const decoder = new TextDecoder();
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        buffer += decoder.decode(next.value, { stream: true });
        let index: number;
        while ((index = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const lines = frame.split("\n"),
            type = lines
              .find((line) => line.startsWith("event:"))
              ?.slice(6)
              .trim();
          const data = lines.find((line) => line.startsWith("data:"))?.slice(5);
          if (type && data) {
            frames.push({
              type,
              data: JSON.parse(data) as Record<string, string>,
              at: performance.now(),
            });
            for (const callback of callbacks) callback();
          }
        }
      }
    } catch {
      /* Test explicitly aborts streams during cleanup/reconnect. */
    }
  })();
  const wait = (type: string, match: (frame: Frame) => boolean = () => true) =>
    bounded(
      new Promise<Frame>((resolve) => {
        const check = () => {
          const frame = frames.find((item) => item.type === type && match(item));
          if (frame) {
            callbacks.delete(check);
            resolve(frame);
          }
        };
        callbacks.add(check);
        check();
      }),
    );
  await wait("ready");
  return { abort, frames, wait, done };
}

test(
  "three separate Node servers deliver owner-only Coach events via real PostgreSQL",
  { timeout: 60000 },
  async (t) => {
    assert.equal(env.NODE_ENV, "test");
    assert.ok(
      ["localhost", "127.0.0.1"].includes(new URL(env.DATABASE_URL).hostname),
      "Synthetic CI database only",
    );
    const servers = [] as Awaited<ReturnType<typeof startServer>>[];
    const streams = [] as Awaited<ReturnType<typeof connect>>[];
    const users = [] as string[];
    const fixture = await prepareCoachListenerFixture();
    listenerUrl = fixture.url;
    t.after(async () => {
      for (const stream of streams) stream.abort.abort();
      await Promise.all(streams.map((stream) => stream.done));
      await Promise.all(
        servers.map(
          ({ child }) =>
            new Promise<void>((resolve) => {
              if (child.exitCode !== null || child.signalCode !== null) return resolve();
              child.once("exit", () => resolve());
              child.kill("SIGTERM");
            }),
        ),
      );
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      await fixture.cleanup();
      await prisma.$disconnect();
    });
    await t.test(
      "restricted session can LISTEN but cannot read or mutate application tables",
      async () => {
        const listener = new Client({ connectionString: listenerUrl });
        const owner = new Client({ connectionString: env.DATABASE_URL });
        await listener.connect();
        await owner.connect();
        try {
          await verifyCoachListener(listener);
          await assert.rejects(verifyCoachListener(owner), /not restricted/);
          await listener.query(`LISTEN ${COACH_CHANNEL}`);
          for (const table of [
            "users",
            "user_profiles",
            "chat_messages",
            "blood_test_analyses",
            "admin_user_roles",
          ]) {
            await assert.rejects(listener.query(`SELECT * FROM ${table} LIMIT 0`), {
              code: "42501",
            });
            await assert.rejects(listener.query(`DELETE FROM ${table} WHERE false`), {
              code: "42501",
            });
          }
          // Every injected privilege exists only in the disposable local CI service
          // and is restored before the multi-process delivery assertions.
          const unsafe = [
            [
              `ALTER ROLE ${COACH_LISTENER_ROLE} SUPERUSER`,
              `ALTER ROLE ${COACH_LISTENER_ROLE} NOSUPERUSER`,
            ],
            [
              `ALTER ROLE ${COACH_LISTENER_ROLE} INHERIT`,
              `ALTER ROLE ${COACH_LISTENER_ROLE} NOINHERIT`,
            ],
            [
              `ALTER ROLE ${COACH_LISTENER_ROLE} CREATEDB`,
              `ALTER ROLE ${COACH_LISTENER_ROLE} NOCREATEDB`,
            ],
            [
              `ALTER ROLE ${COACH_LISTENER_ROLE} CREATEROLE`,
              `ALTER ROLE ${COACH_LISTENER_ROLE} NOCREATEROLE`,
            ],
            [
              `ALTER ROLE ${COACH_LISTENER_ROLE} BYPASSRLS`,
              `ALTER ROLE ${COACH_LISTENER_ROLE} NOBYPASSRLS`,
            ],
            [
              `ALTER ROLE ${COACH_LISTENER_ROLE} REPLICATION`,
              `ALTER ROLE ${COACH_LISTENER_ROLE} NOREPLICATION`,
            ],
            [
              `GRANT pg_read_all_data TO ${COACH_LISTENER_ROLE}`,
              `REVOKE pg_read_all_data FROM ${COACH_LISTENER_ROLE}`,
            ],
            [
              `GRANT SELECT ON chat_messages TO ${COACH_LISTENER_ROLE}`,
              `REVOKE SELECT ON chat_messages FROM ${COACH_LISTENER_ROLE}`,
            ],
            [
              `GRANT SELECT (id) ON users TO ${COACH_LISTENER_ROLE}`,
              `REVOKE SELECT (id) ON users FROM ${COACH_LISTENER_ROLE}`,
            ],
            [`GRANT SELECT ON users TO PUBLIC`, `REVOKE SELECT ON users FROM PUBLIC`],
            [
              `GRANT CREATE ON SCHEMA public TO ${COACH_LISTENER_ROLE}`,
              `REVOKE CREATE ON SCHEMA public FROM ${COACH_LISTENER_ROLE}`,
            ],
            [
              `GRANT CREATE ON DATABASE diewish_test TO ${COACH_LISTENER_ROLE}`,
              `REVOKE CREATE ON DATABASE diewish_test FROM ${COACH_LISTENER_ROLE}`,
            ],
            [
              `CREATE SEQUENCE coach_listener_fixture_sequence; GRANT USAGE ON SEQUENCE coach_listener_fixture_sequence TO ${COACH_LISTENER_ROLE}`,
              `DROP SEQUENCE coach_listener_fixture_sequence`,
            ],
            [
              `CREATE FUNCTION coach_listener_fixture_function() RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'`,
              `DROP FUNCTION coach_listener_fixture_function()`,
            ],
          ];
          for (const [grant, restore] of unsafe) {
            await owner.query(grant);
            try {
              await assert.rejects(verifyCoachListener(listener), /not restricted/);
            } finally {
              await owner.query(restore);
            }
          }
          await verifyCoachListener(listener);
        } finally {
          await listener.end();
          await owner.end();
        }
      },
    );
    for (let i = 0; i < 3; i++) servers.push(await startServer());
    const user = await prisma.user.create({
      data: {
        email: `${crypto.randomUUID()}@example.invalid`,
        passwordHash: "synthetic-unused",
        onboardingCompleted: true,
      },
    });
    const stranger = await prisma.user.create({
      data: {
        email: `${crypto.randomUUID()}@example.invalid`,
        passwordHash: "synthetic-unused",
        onboardingCompleted: true,
      },
    });
    users.push(user.id, stranger.id);
    const token = signAccessToken({ userId: user.id, email: user.email, role: user.role });
    await t.test(
      "application-owner listener is refused while history API stays available",
      async () => {
        const rejected = await startServer(env.DATABASE_URL);
        servers.push(rejected);
        try {
          const headers = { authorization: `Bearer ${token}` };
          const response = await fetch(rejected.base + "/ai-chat/events", { headers });
          assert.equal(response.status, 503);
          assert.equal(
            ((await response.json()) as { error: { code: string } }).error.code,
            "COACH_SYNC_UNAVAILABLE",
          );
          assert.equal(
            (await fetch(rejected.base + "/ai-chat/conversations", { headers })).status,
            200,
          );
        } finally {
          await bounded(
            new Promise<void>((resolve) => {
              rejected.child.once("exit", () => resolve());
              rejected.child.kill("SIGTERM");
            }),
          );
          servers.pop();
        }
      },
    );
    const otherToken = signAccessToken({
      userId: stranger.id,
      email: stranger.email,
      role: stranger.role,
    });
    const request = async (
      server: number,
      route: string,
      method = "GET",
      body?: unknown,
      bearer = token,
    ) => {
      const response = await fetch(servers[server].base + route, {
        method,
        headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: response.status,
        data:
          response.status === 204
            ? null
            : (
                (await response.json()) as {
                  data: { conversationId: string; conversation: { messages: unknown[] } };
                }
              ).data,
      };
    };
    for (const type of ["TERMS_OF_SERVICE", "MEDICAL_DISCLAIMER", "KVKK_EXPLICIT_CONSENT"])
      assert.equal((await request(2, "/legal/consents", "POST", { type })).status, 200);
    const a = await connect(servers[0].base, token),
      b = await connect(servers[1].base, token),
      other = await connect(servers[1].base, otherToken);
    streams.push(a, b, other);
    await t.test(
      "idle active streams cause zero conversation reads across separate servers",
      async () => {
        const before = await Promise.all(servers.map((server) => metrics(server.child)));
        assert.deepEqual(
          before.map((value) => value.connections),
          [1, 2, 0],
        );
        await new Promise((resolve) => setTimeout(resolve, 11000)); // Measurement window spans two old polling intervals.
        const after = await Promise.all(servers.map((server) => metrics(server.child)));
        assert.deepEqual(
          after.map((value) => value.chatReads),
          before.map((value) => value.chatReads),
        );
        console.log(
          "COACH_IDLE_SERVER_METRICS=" +
            JSON.stringify(
              after.map((value, index) => ({
                connections: value.connections,
                chatReadDelta: value.chatReads - before[index].chatReads,
                cpuUs:
                  value.userUs + value.systemUs - before[index].userUs - before[index].systemUs,
                rssBytes: value.rss,
                heapDeltaBytes: value.heap - before[index].heap,
              })),
            ),
        );
      },
    );
    let id = "",
      version = "";
    await t.test(
      "writer C commits a turn; subscribers A and B both receive tiny post-commit event",
      async () => {
        const start = performance.now();
        const sent = await request(2, "/ai-chat/messages", "POST", { message: "Sentetik mesaj." });
        assert.equal(sent.status, 201);
        id = sent.data!.conversationId;
        const [eventA, eventB] = await Promise.all([
          a.wait("changed", (f) => f.data.conversationId === id),
          b.wait("changed", (f) => f.data.conversationId === id),
        ]);
        version = eventA.data.version;
        for (const event of [eventA, eventB]) {
          assert.deepEqual(Object.keys(event.data).sort(), ["conversationId", "type", "version"]);
          assert.equal(event.data.type, "created");
          const persisted = await prisma.chatMessage.count({ where: { conversationId: id } });
          assert.equal(persisted, 2);
        }
        console.log(
          `COACH_CROSS_SERVER_TEST_DELIVERY_MS=${Math.ceil(Math.max(eventA.at, eventB.at) - start)}`,
        );
      },
    );
    await t.test(
      "rename, pin/unpin, append and delete are owner-scoped and observable across servers",
      async () => {
        for (const [route, body, type] of [
          [`/ai-chat/conversations/${id}`, { title: "Yeni başlık" }, "renamed"],
          [`/ai-chat/conversations/${id}/pin`, { pinned: true }, "pinned"],
          [`/ai-chat/conversations/${id}/pin`, { pinned: false }, "pinned"],
          ["/ai-chat/messages", { conversationId: id, message: "İkinci sentetik mesaj." }, "turn"],
        ] as const) {
          const sent = await request(2, route, type === "turn" ? "POST" : "PATCH", body);
          assert.ok([200, 201].includes(sent.status));
          const previous = version;
          const events = await Promise.all([
            a.wait(
              "changed",
              (f) => f.data.type === type && BigInt(f.data.version) > BigInt(previous),
            ),
            b.wait(
              "changed",
              (f) => f.data.type === type && BigInt(f.data.version) > BigInt(previous),
            ),
          ]);
          version = events[0].data.version;
        }
        assert.equal(await prisma.chatMessage.count({ where: { conversationId: id } }), 4);
        assert.equal(
          (await request(0, `/ai-chat/conversations/${id}/summary`, "GET", undefined, otherToken))
            .status,
          404,
        );
        assert.equal(
          (await request(0, `/ai-chat/conversations/${id}`, "GET", undefined, otherToken)).status,
          404,
        );
        assert.equal(other.frames.filter((f) => f.type === "changed").length, 0);
      },
    );
    await t.test(
      "listener loss is repaired from durable watermark and authoritative history",
      async () => {
        b.abort.abort();
        await b.done;
        await bounded(
          new Promise<void>((resolve) => {
            servers[1].child.once("exit", () => resolve());
            servers[1].child.kill("SIGTERM");
          }),
        );
        const sent = await request(2, "/ai-chat/messages", "POST", {
          conversationId: id,
          message: "Çevrimdışı sentetik mesaj.",
        });
        assert.equal(sent.status, 201);
        servers[1] = await startServer();
        const repaired = await connect(servers[1].base, token);
        streams.push(repaired);
        assert.ok(BigInt(repaired.frames[0].data.version) > BigInt(version));
        assert.equal(
          (await request(1, `/ai-chat/conversations/${id}`)).data!.conversation.messages.length,
          6,
        );
      },
    );
    await t.test(
      "simultaneous turns on separate servers keep both user/assistant pairs exactly once",
      async () => {
        const before = await prisma.chatMessage.count({ where: { conversationId: id } });
        const revision = (
          await prisma.coachSyncRevision.findUniqueOrThrow({ where: { userId: user.id } })
        ).version;
        const messages = ["Eşzamanlı sentetik A.", "Eşzamanlı sentetik B."];
        const sent = await Promise.all(
          messages.map((message, index) =>
            request(index === 0 ? 0 : 2, "/ai-chat/messages", "POST", {
              conversationId: id,
              message,
            }),
          ),
        );
        assert.deepEqual(
          sent.map((response) => response.status),
          [201, 201],
        );
        assert.equal(await prisma.chatMessage.count({ where: { conversationId: id } }), before + 4);
        for (const content of messages)
          assert.equal(
            await prisma.chatMessage.count({
              where: { conversationId: id, role: "USER", content },
            }),
            1,
          );
        assert.equal(
          (await prisma.coachSyncRevision.findUniqueOrThrow({ where: { userId: user.id } }))
            .version,
          revision + 2n,
        );
        await a.wait("changed", (frame) => BigInt(frame.data.version) >= revision + 2n);
      },
    );
    await t.test(
      "connection limits reserve API headroom and release all temporary listeners",
      async () => {
        const temporary: Awaited<ReturnType<typeof connect>>[] = [];
        try {
          for (let i = 0; i < 5; i++) temporary.push(await connect(servers[0].base, token));
          assert.equal(
            (
              await fetch(servers[0].base + "/ai-chat/events", {
                headers: { authorization: `Bearer ${token}` },
              })
            ).status,
            429,
          );
          for (const stream of temporary) stream.abort.abort();
          await Promise.all(temporary.map((stream) => stream.done));
          temporary.length = 0;
          await waitConnections(servers[0].child, 1);
          const before = await metrics(servers[0].child),
            start = performance.now();
          for (let owner = 0; owner < 3; owner++) {
            const fixture = await prisma.user.create({
              data: {
                email: `${crypto.randomUUID()}@example.invalid`,
                passwordHash: "synthetic-unused",
                onboardingCompleted: true,
              },
            });
            users.push(fixture.id);
            const bearer = signAccessToken({
              userId: fixture.id,
              email: fixture.email,
              role: fixture.role,
            });
            for (let client = 0; client < 6; client++)
              temporary.push(await connect(servers[0].base, bearer));
          }
          temporary.push(await connect(servers[0].base, token));
          const after = await metrics(servers[0].child);
          assert.equal(after.connections, 20);
          assert.equal(
            (
              await fetch(servers[0].base + "/ai-chat/events", {
                headers: { authorization: `Bearer ${token}` },
              })
            ).status,
            429,
          );
          assert.equal((await request(0, `/ai-chat/conversations/${id}`)).status, 200);
          console.log(
            "COACH_CAPACITY_SAMPLE=" +
              JSON.stringify({
                connections: after.connections,
                additionalConnections: 19,
                openMs: Math.ceil(performance.now() - start),
                heapDeltaBytes: after.heap - before.heap,
                rssDeltaBytes: after.rss - before.rss,
              }),
          );
        } finally {
          for (const stream of temporary) stream.abort.abort();
          await Promise.all(temporary.map((stream) => stream.done));
        }
        await waitConnections(servers[0].child, 1);
      },
    );
    await t.test(
      "rollback has no watermark or event; malformed notifications never reach clients",
      async () => {
        const revision = (
          await prisma.coachSyncRevision.findUniqueOrThrow({ where: { userId: user.id } })
        ).version;
        await assert.rejects(
          prisma.$transaction(async (tx) => {
            await tx.coachSyncRevision.update({
              where: { userId: user.id },
              data: { version: { increment: 1n } },
            });
            throw new Error("rollback");
          }),
        );
        assert.equal(
          (await prisma.coachSyncRevision.findUniqueOrThrow({ where: { userId: user.id } }))
            .version,
          revision,
        );
        const count = a.frames.length;
        await prisma.$executeRaw`SELECT pg_notify(${COACH_CHANNEL}, ${JSON.stringify({ userId: user.id, conversationId: id, type: "turn", version: (revision + 1n).toString(), content: "must be rejected" })})`;
        // Follow with a valid change as a delivery barrier, rather than arbitrary sleep.
        await request(2, `/ai-chat/conversations/${id}`, "PATCH", { title: "Bariyer" });
        await a.wait("changed", (f) => BigInt(f.data.version) > revision);
        assert.equal(a.frames.length, count + 1);
      },
    );
    await t.test(
      "unauthenticated/query-token access is rejected; expiring access token closes its stream",
      async () => {
        assert.equal(
          (await fetch(servers[0].base + "/ai-chat/events?token=synthetic")).status,
          401,
        );
        const expiring = jwt.sign(
          { type: "access", email: user.email, role: user.role },
          env.JWT_ACCESS_SECRET,
          { subject: user.id, issuer: env.JWT_ISSUER, expiresIn: 2 },
        );
        const short = await connect(servers[0].base, expiring);
        streams.push(short);
        await bounded(short.done, 3500);
      },
    );
    await t.test(
      "delete event follows cascade commit and cannot expose a foreign owner's conversation",
      async () => {
        assert.equal((await request(2, `/ai-chat/conversations/${id}`, "DELETE")).status, 204);
        await a.wait("changed", (f) => f.data.type === "deleted");
        assert.equal(await prisma.chatMessage.count({ where: { conversationId: id } }), 0);
        assert.equal((await request(1, `/ai-chat/conversations/${id}`)).status, 404);
        assert.equal(other.frames.filter((f) => f.type === "changed").length, 0);
      },
    );
  },
);
