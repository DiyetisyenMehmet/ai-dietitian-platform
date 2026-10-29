const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function moduleFrom(relative, requireFn) {
  const source = fs.readFileSync(require("node:path").join(__dirname, "../src", relative), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: requireFn });
  return exports;
}
function fixture() {
  let user = "account-a",
    pathname = "/dashboard",
    cursor = 0,
    dirty = true,
    value;
  const hooks = [],
    effects = [],
    requests = [],
    handlers = new Map();
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
  const React = {
    createContext: () => ({ Provider: "Provider" }),
    useRef: (initial) => {
      const i = cursor++;
      return (hooks[i] ??= { current: initial });
    },
    useState: (initial) => {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = initial;
      return [
        hooks[i],
        (next) => {
          hooks[i] = typeof next === "function" ? next(hooks[i]) : next;
          dirty = true;
        },
      ];
    },
    useCallback: (fn, deps) => {
      const i = cursor++;
      if (!same(hooks[i]?.deps, deps)) hooks[i] = { fn, deps };
      return hooks[i].fn;
    },
    useEffect: (fn, deps) => {
      const i = cursor++;
      if (!same(hooks[i]?.deps, deps)) {
        const old = hooks[i];
        hooks[i] = { deps };
        effects.push(() => {
          old?.cleanup?.();
          hooks[i].cleanup = fn();
        });
      }
    },
  };
  const events = {
    addEventListener: (name, fn) => {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(fn);
    },
    removeEventListener: (name, fn) => handlers.get(name)?.delete(fn),
    visibilityState: "visible",
  };
  const domain = moduleFrom("domain/account/mascot-preferences.ts");
  const requireFn = (name) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return { jsx: (_type, props) => ({ props }) };
    if (name === "next/navigation") return { usePathname: () => pathname };
    if (name.includes("auth-store"))
      return {
        useAuth: () => ({
          status: user ? "authenticated" : "unauthenticated",
          user: user ? { id: user } : null,
        }),
      };
    if (name.includes("http-client"))
      return {
        apiRequest: (args) =>
          new Promise((resolve, reject) => requests.push({ args, resolve, reject })),
      };
    if (name.includes("mascot-preferences")) return domain;
    throw new Error(name);
  };
  const source = fs.readFileSync(
    require("node:path").join(
      __dirname,
      "../src/application/account/mascot-preferences-provider.tsx",
    ),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: requireFn, window: events, document: events });
  const flush = () => {
    let limit = 30;
    while (dirty || effects.length) {
      assert.ok(limit-- > 0, "render loop");
      if (dirty) {
        dirty = false;
        cursor = 0;
        value = exports.MascotPreferencesProvider({ children: null }).props.value;
      }
      while (effects.length) effects.shift()();
    }
  };
  flush();
  return {
    requests,
    flush,
    get value() {
      return value;
    },
    changeUser(next) {
      user = next;
      dirty = true;
      flush();
    },
    navigate(next) {
      pathname = next;
      dirty = true;
      flush();
    },
    event(name, detail) {
      for (const fn of handlers.get(name) ?? []) fn({ detail });
      flush();
    },
    async settle(request, preferences) {
      request.resolve({ preferences });
      await new Promise((resolve) => setImmediate(resolve));
      flush();
    },
  };
}
const plain = (value) => JSON.parse(JSON.stringify(value));

test("every original collection identity normalizes without changing legacy preferences", () => {
  const domain = moduleFrom("domain/account/mascot-preferences.ts");
  assert.equal(domain.MASCOT_OPTIONS.length, 16);
  for (const { id } of domain.MASCOT_OPTIONS) {
    assert.deepEqual(
      plain(domain.normalizeMascotPreferences({ mascotId: id, animationEnabled: false })),
      {
        mascotId: id,
        animationEnabled: false,
      },
    );
  }
});

test("Dost is a bounded identity; classic remains default and invalid ids fall back", () => {
  const domain = moduleFrom("domain/account/mascot-preferences.ts");
  assert.deepEqual(
    plain(domain.normalizeMascotPreferences({ mascotId: "dost", animationEnabled: false })),
    {
      mascotId: "dost",
      animationEnabled: false,
    },
  );
  assert.equal(domain.normalizeMascotPreferences({ mascotId: "unknown" }).mascotId, "classic");
  assert.equal(domain.DEFAULT_MASCOT_PREFERENCES.mascotId, "classic");
});

test("classic defaults, confirmed-only saves and partial preference writes", async () => {
  const f = fixture();
  assert.equal(f.requests.length, 1);
  assert.deepEqual(plain(f.value.preferences), { mascotId: "classic", animationEnabled: true });
  await f.settle(f.requests[0], { mascotId: "classic", animationEnabled: true });
  const saving = f.value.save({ mascotId: "mirmir" });
  f.flush();
  assert.equal(f.value.preferences.mascotId, "classic");
  assert.equal(f.value.saving, true);
  assert.equal(f.requests[1].args.method, "PATCH");
  assert.deepEqual(JSON.parse(f.requests[1].args.body), { mascotId: "mirmir" });
  f.event("focus");
  assert.equal(f.requests.length, 2, "focus cannot overwrite in-flight save");
  await f.settle(f.requests[1], { mascotId: "mirmir", animationEnabled: true });
  assert.equal(await saving, true);
  assert.equal(f.value.preferences.mascotId, "mirmir");
});
test("late old-account loads and saves never populate a new account", async () => {
  const f = fixture();
  const oldLoad = f.requests[0];
  f.changeUser("account-b");
  await f.settle(oldLoad, { mascotId: "mirmir", animationEnabled: false });
  assert.equal(f.value.preferences.mascotId, "classic");
  await f.settle(f.requests[1], { mascotId: "classic", animationEnabled: true });
  const oldSave = f.value.save({ mascotId: "mirmir" });
  f.changeUser("account-c");
  await f.settle(f.requests[2], { mascotId: "mirmir", animationEnabled: false });
  assert.equal(await oldSave, false);
  assert.equal(f.value.preferences.mascotId, "classic");
});
test("failed GET blocks selection until a confirmed reload; failed PATCH keeps that confirmation", async () => {
  const f = fixture();
  f.requests[0].reject(new Error("unavailable"));
  await new Promise((resolve) => setImmediate(resolve));
  f.flush();
  assert.equal(f.value.error, true);
  assert.equal(await f.value.save({ mascotId: "mirmir" }), false);
  const reload = f.value.reload();
  await f.settle(f.requests[1], { mascotId: "mirmir", animationEnabled: true });
  await reload;
  const save = f.value.save({ animationEnabled: false });
  f.requests[2].reject(new Error("save failed"));
  assert.equal(await save, false);
  f.flush();
  assert.equal(f.value.error, false, "a failed PATCH is not a failed GET");
  assert.equal(f.value.preferences.animationEnabled, true);
});

for (const status of [422, 503]) {
  test(`PATCH ${status} preserves the confirmed choice and permits an explicit retry without GET`, async () => {
    const f = fixture();
    await f.settle(f.requests[0], { mascotId: "dost", animationEnabled: false });
    const save = f.value.save({ mascotId: "mirmir" });
    f.requests[1].reject(Object.assign(new Error("synthetic failure"), { status }));
    assert.equal(await save, false);
    f.flush();
    assert.equal(f.value.error, false);
    assert.equal(f.value.saving, false);
    assert.deepEqual(plain(f.value.preferences), { mascotId: "dost", animationEnabled: false });
    const retry = f.value.save({ mascotId: "mirmir" });
    assert.equal(f.requests.length, 3);
    assert.equal(f.requests[2].args.method, "PATCH");
    await f.settle(f.requests[2], { mascotId: "mirmir", animationEnabled: false });
    assert.equal(await retry, true);
    assert.equal(f.value.preferences.mascotId, "mirmir");
  });
}

test("rapid saves and concurrent focus/reload cannot duplicate or overwrite a failed save", async () => {
  const f = fixture();
  await f.settle(f.requests[0], { mascotId: "dost", animationEnabled: true });
  const save = f.value.save({ mascotId: "mirmir" });
  assert.equal(await f.value.save({ mascotId: "classic" }), false);
  f.event("focus");
  await f.value.reload();
  assert.equal(f.requests.length, 2);
  f.requests[1].reject(new Error("synthetic failure"));
  assert.equal(await save, false);
  f.flush();
  assert.equal(f.value.error, false);
  assert.equal(f.value.preferences.mascotId, "dost");
  const retry = f.value.save({ mascotId: "mirmir" });
  await f.settle(f.requests[2], { mascotId: "mirmir", animationEnabled: true });
  assert.equal(await retry, true);
});

test("a late GET cannot replace the outcome of a newer PATCH", async () => {
  const f = fixture();
  await f.settle(f.requests[0], { mascotId: "dost", animationEnabled: true });
  f.event("focus");
  const pendingGet = f.requests[1];
  const save = f.value.save({ mascotId: "mirmir" });
  await f.settle(f.requests[2], { mascotId: "mirmir", animationEnabled: false });
  assert.equal(await save, true);
  await f.settle(pendingGet, { mascotId: "classic", animationEnabled: true });
  assert.equal(f.value.preferences.mascotId, "mirmir");
  assert.equal(f.value.error, false);
});

test("a late failed old-account PATCH cannot affect the new account or release its save lock", async () => {
  const f = fixture();
  await f.settle(f.requests[0], { mascotId: "dost", animationEnabled: false });
  const oldSave = f.value.save({ mascotId: "mirmir" });
  f.changeUser("account-b");
  await f.settle(f.requests[2], { mascotId: "classic", animationEnabled: true });
  const newSave = f.value.save({ mascotId: "lina" });
  f.requests[1].reject(new Error("old-account failure"));
  assert.equal(await oldSave, false);
  f.flush();
  assert.equal(f.value.saving, true);
  assert.equal(f.value.error, false);
  assert.equal(f.value.preferences.mascotId, "classic");
  f.event("focus");
  assert.equal(f.requests.length, 4);
  await f.settle(f.requests[3], { mascotId: "lina", animationEnabled: true });
  assert.equal(await newSave, true);
});

test("session loss never confirms a late save or keeps the old account's mascot", async () => {
  const f = fixture();
  await f.settle(f.requests[0], { mascotId: "dost", animationEnabled: false });
  const save = f.value.save({ mascotId: "mirmir" });
  f.changeUser(null);
  await f.settle(f.requests[1], { mascotId: "mirmir", animationEnabled: false });
  assert.equal(await save, false);
  assert.equal(f.value.preferences.mascotId, "classic");
  assert.equal(await f.value.save({ mascotId: "dost" }), false);
  assert.equal(f.requests.length, 2);
});
test("route return/native resume revalidate while admin and logout clear visual identity", async () => {
  const f = fixture();
  await f.settle(f.requests[0], { mascotId: "mirmir", animationEnabled: true });
  f.navigate("/ai");
  assert.equal(f.requests.length, 2);
  await f.settle(f.requests[1], { mascotId: "mirmir", animationEnabled: false });
  f.event("diewish:app-visibility", { active: false });
  assert.equal(f.requests.length, 2);
  f.event("diewish:app-visibility", { active: true });
  assert.equal(f.requests.length, 3);
  f.navigate("/admin");
  assert.equal(f.value.preferences.mascotId, "classic");
  assert.equal(f.requests.length, 3);
  f.changeUser(null);
  await f.settle(f.requests[2], { mascotId: "mirmir", animationEnabled: true });
  assert.equal(f.value.preferences.mascotId, "classic");
});
