const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  ts = require("typescript");
const before = "2026-10-18T08:00:00.000Z",
  old = Date.parse(before) - 1000;
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  const state = {
    owner: "a",
    native: [],
    remote: [],
    writes: 0,
    nativeWrites: [],
    fail: false,
    nativeFail: false,
    gate: null,
  };
  const client = {
    async getCenter(ids = []) {
      const owned = state.remote.filter((r) => r.owner === state.owner);
      const rows = [...owned.slice(0, 100), ...owned.filter((r) => ids.includes(r.id))];
      return {
        notifications: [...new Map(rows.map((r) => [r.id, { ...r }])).values()],
        unreadCount: owned.filter((r) => !r.readAt).length,
        readBefore: before,
      };
    },
    async markAllRead(boundary) {
      state.writes++;
      if (state.gate) await state.gate;
      if (state.fail) throw Error("offline");
      const rows = state.remote.filter(
        (r) => r.owner === "a" && !r.readAt && r.deliveredAt < boundary,
      );
      rows.forEach((r) => {
        r.readAt = before;
      });
      return { updatedCount: rows.length };
    },
    async markRead(rowId) {
      const row = state.remote.find((r) => r.id === rowId && r.owner === state.owner);
      if (!row || state.fail) throw Error("unavailable");
      row.readAt = before;
      return { notification: row };
    },
  };
  const window = {
    DiewishReminders: {
      notificationInboxJson: () => JSON.stringify(state.native),
      markNotificationRead: (rowId) => {
        state.nativeWrites.push(rowId);
        if (!state.nativeFail) state.native.find((r) => r.id === rowId).readAt = Date.parse(before);
      },
    },
  };
  function load(relative) {
    const exports = {},
      code = ts.transpileModule(
        fs.readFileSync(path.join(__dirname, "../src/", relative + ".ts"), "utf8"),
        { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
      ).outputText;
    vm.runInNewContext(code, {
      exports,
      window,
      console,
      require(name) {
        if (name.includes("auth-store"))
          return {
            authStore: {
              getSnapshot: () => ({ status: "authenticated", user: { id: state.owner } }),
            },
          };
        if (name.endsWith("notification-client")) return { notificationClient: client };
        if (name.endsWith("notification-lifecycle"))
          return load("infrastructure/notifications/notification-lifecycle");
        if (name.includes("water-reminder-plan")) return load("domain/account/water-reminder-plan");
        throw Error(name);
      },
    });
    return exports;
  }
  return {
    state,
    api: () => load("infrastructure/notifications/notification-center"),
    remote: (n, read = false) => ({
      id: id(n),
      owner: "a",
      type: "PROACTIVE_MESSAGE",
      title: "Koç mesajı",
      body: `Synthetic ${n}`,
      scheduledFor: new Date(old).toISOString(),
      deliveredAt: new Date(old).toISOString(),
      readAt: read ? before : null,
    }),
    native: (name, serverId = null) => ({
      id: name,
      serverId,
      title: "Bildirim",
      body: "Synthetic",
      target: "/ai",
      occurredAt: old,
      readAt: null,
    }),
  };
}
test("130 mixed server rows and Android matching persist, with one request and new arrivals unread", async () => {
  const f = fixture(),
    api = f.api();
  f.state.remote = Array.from({ length: 130 }, (_, i) => f.remote(i, i === 1));
  f.state.native = [f.native("push-old", id(125)), f.native("water-old")];
  const snapshot = await api.getNotificationCenterSnapshot();
  assert.equal(snapshot.unreadCount, 130);
  const contents = JSON.stringify(f.state.remote.map(({ readAt, ...r }) => r));
  let release;
  f.state.gate = new Promise((r) => {
    release = r;
  });
  const first = api.markAllNotificationCenterRead(snapshot),
    second = api.markAllNotificationCenterRead(snapshot);
  assert.equal(first, second);
  const newer = f.remote(131);
  newer.deliveredAt = "2026-10-18T08:00:00.001Z";
  f.state.remote.push(newer);
  f.state.native.push({ ...f.native("water-new"), occurredAt: old + 2000 });
  release();
  const result = await first;
  assert.equal(f.state.writes, 1);
  assert.equal(result.unreadCount, 2);
  assert.ok(f.state.native[0].readAt);
  assert.ok(f.state.native[1].readAt);
  assert.equal(f.state.native[2].readAt, null);
  assert.equal(newer.readAt, null);
  assert.equal(JSON.stringify(f.state.remote.slice(0, 130).map(({ readAt, ...r }) => r)), contents);
  assert.equal((await f.api().getNotificationCenterSnapshot()).unreadCount, 2);
});
test("server failure never marks local records or reports success", async () => {
  const f = fixture(),
    api = f.api();
  f.state.remote = [f.remote(1), f.remote(2)];
  f.state.native = [f.native("local")];
  const snap = await api.getNotificationCenterSnapshot();
  f.state.fail = true;
  await assert.rejects(api.markAllNotificationCenterRead(snap), /offline/);
  assert.deepEqual(f.state.nativeWrites, []);
  assert.equal((await api.getNotificationCenterSnapshot()).unreadCount, 3);
});
test("partial native failure is explicit after server commit and a retry converges", async () => {
  const f = fixture(),
    api = f.api();
  f.state.remote = [f.remote(1)];
  f.state.native = [f.native("local")];
  f.state.nativeFail = true;
  await assert.rejects(
    api.markAllNotificationCenterRead(await api.getNotificationCenterSnapshot()),
    /incomplete/,
  );
  assert.ok(f.state.remote[0].readAt);
  assert.equal(f.state.native[0].readAt, null);
  f.state.nativeFail = false;
  assert.equal(
    (await api.markAllNotificationCenterRead(await api.getNotificationCenterSnapshot()))
      .unreadCount,
    0,
  );
});
test("account switch during a request never touches the new account inbox", async () => {
  const f = fixture(),
    api = f.api();
  f.state.native = [f.native("a-local")];
  f.state.remote = [f.remote(1), { ...f.remote(2), owner: "b" }];
  const snap = await api.getNotificationCenterSnapshot();
  let release;
  f.state.gate = new Promise((r) => {
    release = r;
  });
  const pending = api.markAllNotificationCenterRead(snap);
  f.state.owner = "b";
  f.state.native = [f.native("b-local")];
  release();
  await assert.rejects(pending, /account changed/);
  assert.equal(f.state.remote[1].readAt, null);
  assert.deepEqual(f.state.nativeWrites, []);
});
test("remote read reconciles Android records outside the newest 100 and the badge", async () => {
  const f = fixture(),
    api = f.api();
  f.state.remote = Array.from({ length: 130 }, (_, i) => f.remote(i, true));
  f.state.native = [f.native("old-push", id(125))];
  const snap = await api.getNotificationCenterSnapshot();
  assert.equal(snap.unreadCount, 0);
  assert.ok(f.state.native[0].readAt);
  assert.equal(f.state.writes, 0);
  assert.ok(snap.items.every((r) => r.read));
});
test("a replacement local ID arriving during a request is not marked read", async () => {
  const f = fixture(),
    api = f.api();
  f.state.native = [f.native("same-id")];
  const snap = await api.getNotificationCenterSnapshot();
  f.state.native[0].occurredAt++;
  await api.markAllNotificationCenterRead(snap);
  assert.equal(f.state.native[0].readAt, null);
});
