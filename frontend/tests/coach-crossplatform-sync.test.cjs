const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const summary = (id, title = "Sohbet", version = 1) => ({
  id,
  title,
  pinnedAt: null,
  updatedAt: `2026-10-10T12:00:0${version}Z`,
  createdAt: "2026-10-10T12:00:00Z",
});
const detail = (row) => ({
  conversation: {
    ...row,
    messages: [
      { id: "u-" + row.id, role: "USER", content: "Message " + row.id, createdAt: row.updatedAt },
    ],
  },
});
function harness(api) {
  const exports = {},
    calls = [],
    subscriptions = new Set();
  let pendingEffect, lastDeps;
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(path.join(__dirname, "../src/application/chat/chat-store.ts"), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
    ).outputText,
    {
      exports,
      require: (name) => {
        if (name === "react")
          return {
            useSyncExternalStore: (subscribe, get) => {
              subscribe(() => {});
              return get();
            },
            useEffect: (fn, deps) => {
              if (!lastDeps || deps.some((v, i) => v !== lastDeps[i])) pendingEffect = fn;
              lastDeps = deps;
            },
          };
        if (name.includes("daily-tracking")) return { dailyTrackingStore: { markChatted() {} } };
        return {
          ApiError: class extends Error {},
          apiRequest: (options) => {
            calls.push(options);
            return api(options);
          },
        };
      },
    },
  );
  return {
    store: exports.chatStore,
    calls,
    state: () => exports.useChatState(),
    render: () => {
      exports.useChatState();
      const effect = pendingEffect;
      pendingEffect = null;
      effect?.();
    },
  };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("mounted coach reloads when parent account hydration resets it; baseline [] effect loses history", async () => {
  const row = summary("persisted");
  const h = harness(async (o) =>
    o.path.endsWith("/conversations") ? { conversations: [row] } : detail(row),
  );
  h.render();
  await h.store.initialize();
  assert.equal(h.state().activeId, row.id);
  h.store.resetSession();
  h.render();
  await settle();
  assert.equal(h.state().activeId, row.id);
  assert.equal(h.calls.filter((o) => o.path.endsWith("/conversations")).length, 2);
});

test("remote list refresh merges by ID, keeps draft, null titles and pinned metadata without duplicates", async () => {
  let rows = [summary("a")];
  const h = harness(async (o) =>
    o.path.endsWith("/conversations")
      ? { conversations: rows }
      : detail(rows.find((r) => o.path.endsWith(r.id))),
  );
  await h.store.initialize();
  h.store.newChat();
  const draft = h.state().activeId;
  rows = [summary("b", null), summary("a", "Renamed", 2), summary("b", null)];
  rows[0].pinnedAt = "2026-10-10T13:00:00Z";
  await h.store.refresh();
  assert.equal(h.state().activeId, draft);
  assert.equal(h.state().conversations.filter((r) => r.id === "b").length, 1);
  assert.equal(h.state().conversations.find((r) => r.id === "b").title, "Sohbet");
  assert.equal(h.state().conversations.find((r) => r.id === "a").title, "Renamed");
  assert.ok(h.calls.every((o) => o.auth === true && o.cache === "no-store"));
});

test("stale old-account list and detail cannot restore another account after reset", async () => {
  for (const stage of ["list", "detail"]) {
    const old = summary("old"),
      current = summary("new");
    const pending = deferred();
    let account = "old";
    const h = harness(async (o) => {
      if (
        account === "old" &&
        (stage === "list" ? o.path.endsWith("/conversations") : !o.path.endsWith("/conversations"))
      )
        return pending.promise;
      return o.path.endsWith("/conversations")
        ? { conversations: [account === "old" ? old : current] }
        : detail(account === "old" ? old : current);
    });
    const first = h.store.initialize();
    await settle();
    h.store.resetSession();
    account = "new";
    await h.store.initialize();
    pending.resolve(stage === "list" ? { conversations: [old] } : detail(old));
    await first;
    assert.deepEqual(
      Array.from(h.state().conversations, (c) => c.id),
      ["new"],
    );
  }
});

test("concurrent refreshes share a request and a local mutation rejects an older list snapshot", async () => {
  const row = summary("a");
  let pending;
  const h = harness(async (o) =>
    o.path.endsWith("/conversations")
      ? pending
        ? pending.promise
        : { conversations: [row] }
      : detail(row),
  );
  await h.store.initialize();
  pending = deferred();
  const count = h.calls.length;
  const first = h.store.refresh(),
    second = h.store.refresh();
  h.store.newChat();
  const draft = h.state().activeId;
  pending.resolve({ conversations: [] });
  await Promise.all([first, second]);
  assert.equal(h.calls.length, count + 1);
  assert.equal(h.state().activeId, draft);
  assert.ok(h.state().conversations.some((c) => c.id === "a"));
});

test("remote message changes invalidate lazy details; deletion is not resurrected", async () => {
  let rows = [summary("a"), summary("b")];
  const h = harness(async (o) =>
    o.path.endsWith("/conversations")
      ? { conversations: rows }
      : detail(rows.find((r) => o.path.endsWith(r.id))),
  );
  await h.store.initialize();
  h.store.selectConversation("b");
  await settle();
  rows = [summary("a"), summary("b", "Sohbet", 2)];
  await h.store.refresh();
  assert.equal(
    h.state().conversations.find((c) => c.id === "b").updatedAt,
    Date.parse(rows[1].updatedAt),
  );
  rows = [summary("a")];
  await h.store.refresh();
  assert.ok(!h.state().conversations.some((c) => c.id === "b"));
  assert.ok(h.state().activeId.startsWith("draft-"));
});

test("sending stays atomic in UI, skips refresh during reply, and reset rejects a late send response", async () => {
  for (const reset of [false, true]) {
    const pending = deferred();
    let rows = [];
    const h = harness(async (o) =>
      o.method === "POST" ? pending.promise : { conversations: rows },
    );
    await h.store.initialize();
    h.store.sendMessage("Merhaba");
    h.store.sendMessage("duplicate");
    await h.store.refresh();
    assert.equal(h.calls.filter((c) => c.method === "POST").length, 1);
    if (reset) h.store.resetSession();
    pending.resolve({
      conversationId: "server-id",
      message: {
        id: "answer",
        role: "ASSISTANT",
        content: "Yanıt",
        createdAt: "2026-10-10T12:00:00Z",
      },
    });
    await settle();
    assert.equal(h.state().isResponding, false);
    assert.equal(
      h.state().conversations.some((c) => c.id === "server-id"),
      !reset,
    );
    if (!reset) assert.equal(h.state().conversations[0].messages.length, 2);
  }
});

test("a list requested during delete cannot resurrect its deleted conversation", async () => {
  const row = summary("a");
  const deletion = deferred(),
    refresh = deferred();
  let loading = false;
  const h = harness(async (o) => {
    if (o.method === "DELETE") return deletion.promise;
    if (o.path.endsWith("/conversations"))
      return loading ? refresh.promise : { conversations: [row] };
    return detail(row);
  });
  await h.store.initialize();
  const removing = h.store.deleteConversation("a");
  loading = true;
  const refreshing = h.store.refresh();
  deletion.resolve(undefined);
  await removing;
  refresh.resolve({ conversations: [row] });
  await refreshing;
  assert.ok(!h.state().conversations.some((c) => c.id === "a"));
});

test("a failed refresh keeps persisted history and a retry can recover", async () => {
  const row = summary("a");
  let fail = false;
  const h = harness(async (o) => {
    if (fail) throw new Error("offline");
    return o.path.endsWith("/conversations") ? { conversations: [row] } : detail(row);
  });
  await h.store.initialize();
  fail = true;
  await h.store.refresh();
  assert.equal(h.state().activeId, "a");
  assert.ok(h.state().error);
  fail = false;
  await h.store.refresh();
  assert.equal(h.state().error, null);
});
