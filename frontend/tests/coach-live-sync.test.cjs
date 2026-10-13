const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise(setImmediate);
};

function harness({
  fail = false,
  busy = false,
  disabled = false,
  status = null,
  code = null,
} = {}) {
  const window = new EventTarget(),
    document = new EventTarget();
  document.visibilityState = "visible";
  let session = { status: "authenticated", user: { id: "owner-a" } };
  let now = 0,
    uid = 0,
    stopped = false;
  const timers = new Map(),
    authListeners = new Set(),
    chatListeners = new Set();
  const streams = [],
    calls = [],
    snapshots = [],
    changes = [];
  const authStore = {
    getSnapshot: () => session,
    subscribe: (fn) => {
      authListeners.add(fn);
      return () => authListeners.delete(fn);
    },
  };
  const chatStore = {
    resetSession: () => calls.push("reset"),
    initialize: async () => calls.push("initialize"),
    isBusy: () => busy,
    refresh: async () => calls.push("legacy"),
    subscribe: (fn) => {
      chatListeners.add(fn);
      return () => chatListeners.delete(fn);
    },
    syncSnapshot: async () => {
      snapshots.push(now);
      return true;
    },
    syncConversation: async (change) => {
      changes.push(change);
      return true;
    },
  };
  const schedule = (fn, delay, interval = false) => {
    const id = ++uid;
    timers.set(id, { fn, at: now + delay, delay, interval });
    return id;
  };
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(path.join(__dirname, "../src/application/chat/coach-live-sync.ts"), "utf8"),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      },
    ).outputText,
    {
      exports,
      window,
      document,
      navigator: { onLine: true },
      AbortController,
      TextDecoder,
      queueMicrotask,
      setTimeout: (fn, ms) => schedule(fn, ms),
      clearTimeout: (id) => timers.delete(id),
      setInterval: (fn, ms) => schedule(fn, ms, true),
      clearInterval: (id) => timers.delete(id),
      require: (name) =>
        name.includes("auth-store")
          ? { authStore }
          : name.includes("chat-store")
            ? { chatStore }
            : {
                apiStream: async (options) => {
                  calls.push(options);
                  if (fail) throw new Error("offline");
                  if (status) return Response.json({ error: { code } }, { status });
                  if (disabled)
                    return Response.json(
                      { error: { code: "COACH_SYNC_DISABLED" } },
                      { status: 409 },
                    );
                  let controller;
                  const body = new ReadableStream({
                    start(c) {
                      controller = c;
                    },
                  });
                  const stream = {
                    options,
                    send: (type, data) =>
                      controller.enqueue(
                        new TextEncoder().encode(
                          `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`,
                        ),
                      ),
                    beat: () => controller.enqueue(new TextEncoder().encode(": keepalive\n\n")),
                    end: () => controller.close(),
                  };
                  streams.push(stream);
                  return new Response(body, { headers: { "content-type": "text/event-stream" } });
                },
              },
    },
  );
  const cleanup = exports.mountCoachSync();
  return {
    exports,
    calls,
    snapshots,
    changes,
    streams,
    timers,
    stop: () => {
      stopped = true;
      cleanup();
    },
    async ready(version = "0") {
      await settle();
      streams.at(-1).send("ready", { version });
      await settle();
    },
    async send(version, type = "turn", id = "11111111-1111-4111-8111-111111111111") {
      streams.at(-1).send("changed", { version, type, conversationId: id });
      await settle();
    },
    async visibility(visible) {
      document.visibilityState = visible ? "visible" : "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
      await settle();
    },
    async event(type, detail) {
      const event = new Event(type);
      event.detail = detail;
      window.dispatchEvent(event);
      await settle();
    },
    async account(id) {
      session = id
        ? { status: "authenticated", user: { id } }
        : { status: "unauthenticated", user: null };
      for (const fn of authListeners) fn();
      await settle();
    },
    async busy(value) {
      busy = value;
      for (const fn of chatListeners) fn();
      await settle();
    },
    async advance(ms) {
      await settle();
      const target = now + ms;
      for (let attempts = 0; attempts < 100; attempts++) {
        const next = [...timers]
          .filter(([, v]) => v.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, timer] = next;
        now = timer.at;
        if (timer.interval) timer.at += timer.delay;
        else timers.delete(id);
        timer.fn();
        await settle();
      }
      now = target;
      if (stopped) assert.equal(timers.size, 0);
    },
  };
}

test("healthy stream has zero periodic list/detail queries over 30 simulated minutes", async () => {
  const h = harness();
  await h.ready();
  assert.equal(h.snapshots.length, 1);
  for (let i = 0; i < 72; i++) {
    h.streams[0].beat();
    await h.advance(25000);
  }
  assert.equal(h.snapshots.length, 1);
  assert.equal(h.changes.length, 0);
  assert.ok([...h.timers.values()].every((timer) => !timer.interval));
  assert.equal(h.calls.filter((c) => c === "legacy").length, 0);
  assert.ok(h.streams[0].options.auth);
  assert.equal(h.streams[0].options.path, "/ai-chat/events");
  h.stop();
});
test("duplicate/older events are ignored; version gaps resync rather than overwrite newer state", async () => {
  const h = harness();
  await h.ready("10");
  await h.send("11");
  await h.send("11");
  await h.send("9");
  assert.equal(h.changes.length, 1);
  await h.send("13");
  await h.send("12");
  assert.equal(h.snapshots.length, 2);
  assert.equal(h.changes.length, 2);
  h.stop();
});
test("hidden, native background, offline and pagehide abort; resume recovers missed changes", async () => {
  const h = harness();
  await h.ready();
  for (const [close, open] of [
    [() => h.visibility(false), () => h.visibility(true)],
    [
      () => h.event("diewish:app-visibility", { active: false }),
      () => h.event("diewish:app-visibility", { active: true }),
    ],
    [() => h.event("offline"), () => h.event("online")],
    [() => h.event("pagehide"), () => h.event("pageshow")],
  ]) {
    const previous = h.streams.at(-1);
    await close();
    assert.ok(previous.options.signal.aborted);
    const count = h.calls.length;
    await h.advance(600000);
    assert.equal(h.calls.length, count);
    await open();
    await h.ready("1");
    assert.ok(h.snapshots.length >= 2);
  }
  h.stop();
});
test("account change aborts old stream and clears queued events; same-owner token rotation keeps one stream", async () => {
  const h = harness({ busy: true });
  await h.ready();
  await h.send("1");
  const old = h.streams[0];
  await h.account("owner-b");
  assert.ok(old.options.signal.aborted);
  await h.ready();
  await h.busy(false);
  assert.equal(h.changes.length, 0);
  const count = h.streams.length;
  await h.account("owner-b");
  assert.equal(h.streams.length, count);
  await h.account(null);
  assert.ok(h.streams.at(-1).options.signal.aborted);
  h.stop();
});
test("pending remote events wait for local reply/composer operation without polling", async () => {
  const h = harness();
  await h.ready();
  await h.busy(true);
  await h.send("1");
  assert.equal(h.changes.length, 0);
  assert.ok([...h.timers.values()].every((timer) => !timer.interval));
  await h.busy(false);
  assert.equal(h.changes.length, 1);
  h.stop();
});
test("coalesced title/pin changes retain earlier message invalidation; deletion wins", async () => {
  for (const firstType of ["created", "turn"]) {
    const h = harness();
    await h.ready();
    await h.busy(true);
    await h.send("1", firstType);
    await h.send("2", "renamed");
    await h.send("3", "pinned");
    await h.busy(false);
    assert.equal(h.changes.length, 1);
    assert.equal(h.changes[0].type, "turn");
    assert.equal(h.changes[0].version, "3");
    h.stop();
  }
  const h = harness();
  await h.ready();
  await h.busy(true);
  await h.send("1", "turn");
  await h.send("2", "deleted");
  await h.busy(false);
  assert.equal(h.changes.length, 1);
  assert.equal(h.changes[0].type, "deleted");
  h.stop();
});
test("server stream rotation with unchanged watermark never reloads a full list", async () => {
  const h = harness();
  await h.ready("5");
  h.streams[0].end();
  await settle();
  await h.advance(1300);
  await h.ready("5");
  assert.equal(h.streams.length, 2);
  assert.equal(h.snapshots.length, 1);
  h.stop();
});
test("network failures back off and never silently fall back to list polling", async () => {
  const h = harness({ fail: true });
  await settle();
  await h.advance(500);
  assert.equal(h.calls.filter((c) => c.path).length, 1);
  await h.advance(800);
  assert.equal(h.calls.filter((c) => c.path).length, 2);
  await h.advance(2200);
  assert.equal(h.calls.filter((c) => c.path).length, 3);
  assert.equal(h.snapshots.length, 0);
  assert.ok(!h.calls.includes("legacy"));
  h.stop();
});
test("only explicit disabled switch enables the preserved P1 rollback; leaving Coach stops it", async () => {
  const h = harness({ disabled: true });
  await settle();
  await h.advance(5000);
  assert.ok(h.calls.includes("legacy"));
  h.stop();
  const count = h.calls.length;
  await h.advance(60000);
  assert.equal(h.calls.length, count);
});
test("decoder preserves split Unicode/CRLF frames, ignores keepalive and bounds memory", async () => {
  const h = harness();
  const received = [],
    encoder = new TextEncoder();
  const bytes = encoder.encode('event: ready\r\ndata: {"version":"1"}\r\n\r\n: keepalive\r\n\r\n');
  const body = new ReadableStream({
    start(c) {
      for (const b of bytes) c.enqueue(Uint8Array.of(b));
      c.close();
    },
  });
  await h.exports.readCoachEvents(
    new Response(body, { headers: { "content-type": "text/event-stream" } }),
    new AbortController().signal,
    (type, data) => received.push({ type, data }),
  );
  assert.deepEqual(JSON.parse(JSON.stringify(received)), [
    { type: "ready", data: { version: "1" } },
  ]);
  await assert.rejects(
    h.exports.readCoachEvents(
      new Response("x".repeat(65537), { headers: { "content-type": "text/event-stream" } }),
      new AbortController().signal,
      () => {},
    ),
    /too large/,
  );
  h.stop();
});

test("cross-server revision invalidates once; duplicate and stale revisions are ignored", async () => {
  const h = harness();
  await h.ready("5");
  h.streams[0].send("revision", { version: "7" });
  await settle();
  assert.equal(h.snapshots.length, 2);
  assert.equal(h.changes.length, 0);
  h.streams[0].send("revision", { version: "7" });
  h.streams[0].send("revision", { version: "6" });
  await settle();
  assert.equal(h.snapshots.length, 2);
  h.stop();
});
test("explicit transport-unavailable uses P1 only while active and stops on logout", async () => {
  const h = harness({ status: 503, code: "COACH_SYNC_UNAVAILABLE" });
  await settle();
  await h.advance(5000);
  assert.ok(h.calls.includes("legacy"));
  await h.visibility(false);
  const count = h.calls.length;
  await h.advance(20000);
  assert.equal(h.calls.length, count);
  await h.visibility(true);
  await settle();
  await h.account(null);
  const loggedOutCount = h.calls.length;
  await h.advance(20000);
  assert.equal(h.calls.length, loggedOutCount);
  h.stop();
});
test("auth, capacity and unrelated errors never enable P1 polling", async () => {
  for (const status of [401, 403, 429, 500, 503]) {
    const h = harness({ status, code: "UNRELATED" });
    await settle();
    await h.advance(5000);
    assert.ok(!h.calls.includes("legacy"));
    h.stop();
  }
});
