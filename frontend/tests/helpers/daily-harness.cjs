const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function harness() {
  let time = new Date(2026, 9, 2, 10).getTime();
  let timerId = 0;
  const timers = new Map();
  const subscriptions = new Map();
  class Clock extends Date {
    constructor(...args) {
      super(...(args.length ? args : [time]));
    }
    static now() {
      return time;
    }
  }
  const client = {
    listWater: async () => ({ logs: [] }),
    logWater: async (amountMl) => ({
      log: { id: "water", amountMl, loggedAt: new Clock().toISOString() },
    }),
    deleteWater: async () => {},
    getWeightCheckIn: async () => ({ checkIn: null }),
  };
  const mealsClient = {
    listMeals: async () => ({ logs: [] }),
    logMeal: async (input) => ({
      log: {
        id: "meal",
        name: null,
        calories: null,
        proteinG: null,
        carbsG: null,
        fatG: null,
        sodiumMg: null,
        sugarG: null,
        ...input,
        loggedAt: new Clock().toISOString(),
      },
    }),
    deleteMeal: async () => {},
  };
  const activityClient = {
    listActivities: async () => ({ activities: [] }),
    logActivity: async (input) => ({
      activity: {
        id: "activity",
        caloriesBurned: null,
        ...input,
        loggedAt: new Clock().toISOString(),
      },
    }),
    deleteActivity: async () => {},
  };
  const sleepClient = {
    dailyAssessment: async (date) => ({
      assessment: { date, entries: 0, totalDurationMinutes: 0 },
    }),
  };
  let checkIn = null;
  const profile = {
    startWeightKg: 80,
    currentWeightKg: 79,
    targetWeightKg: 70,
    workScheduleType: "REGULAR",
  };
  const react = {
    useSyncExternalStore: (subscribe, get) => {
      if (!subscriptions.has(subscribe))
        subscriptions.set(
          subscribe,
          subscribe(() => {}),
        );
      return get();
    },
    useMemo: (fn) => fn(),
    useState: () => [new Clock(), () => {}],
    useEffect: () => {},
  };
  const mocks = {
    react: react,
    "@/infrastructure/tracking/tracking-client": { trackingClient: client },
    "@/infrastructure/tracking/meals-client": { mealsClient },
    "@/infrastructure/activity/activity-client": { activityClient },
    "@/infrastructure/sleep/sleep-client": { sleepClient },
    "@/application/health/weight-store": { useWeightCheckInStatus: () => checkIn },
    "@/application/health/health-profile-store": {
      useHealthProfile: () => profile,
      healthProfileStore: { update() {} },
    },
  };
  const cache = new Map();
  function evaluate(file, imports) {
    const exports = {};
    vm.runInNewContext(
      ts.transpileModule(fs.readFileSync(file, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
        },
      }).outputText,
      {
        exports,
        require: imports,
        Date: Clock,
        Set,
        Map,
        window: {},
        setTimeout: (fn) => {
          timers.set(++timerId, fn);
          return timerId;
        },
        clearTimeout: (id) => timers.delete(id),
      },
    );
    return exports;
  }
  function load(relative) {
    const file = path.resolve("src", relative);
    if (cache.has(file)) return cache.get(file);
    const exports = evaluate(file, (name) => {
      const key = name.startsWith(".")
        ? "@/" + path.relative(path.resolve("src"), path.resolve(path.dirname(file), name))
        : name;
      if (key in mocks) return mocks[key];
      if (key.startsWith("@/")) return load(key.slice(2) + ".ts");
      throw Error("Missing mock " + key);
    });
    cache.set(file, exports);
    return exports;
  }
  function render(relative, exportName, extra = {}) {
    const wrapper = ({ children }) => React.createElement("div", null, children);
    const dummy = () => null;
    const imports = {
      react: React,
      "react/jsx-runtime": require("react/jsx-runtime"),
      "next/link": { default: wrapper },
      "lucide-react": new Proxy({}, { get: () => dummy }),
      sonner: { toast: { success() {}, error() {} } },
      "@/shared/lib/utils": { cn: () => "" },
      "@/shared/lib/format": {
        formatNumber: (n) => String(n),
        toPercent: (a, b) => Math.round((a / b) * 100),
      },
      "@/presentation/components/ui/card": { Card: wrapper, CardContent: wrapper },
      "@/presentation/components/ui/button": { Button: wrapper },
      "@/presentation/components/ui/input": { Input: dummy },
      "@/presentation/components/ui/progress-bar": { ProgressBar: dummy },
      "@/presentation/components/history/diewish-history-mark": { DiewishHistoryMark: dummy },
      "@/presentation/components/health/health-icon": { healthIcon: () => dummy },
      ...mocks,
      react: React,
      ...extra,
    };
    const exports = evaluate(path.resolve("src", relative), (name) =>
      name in imports ? imports[name] : load(name.slice(2) + ".ts"),
    );
    return renderToStaticMarkup(React.createElement(exports[exportName]));
  }
  const water = load("application/health/daily-tracking-store.ts");
  const meals = load("application/meals/meals-store.ts");
  const activity = load("application/health/activity-store.ts");
  const sleep = load("application/health/sleep-store.ts");
  return {
    load,
    render,
    client,
    mealsClient,
    activityClient,
    sleepClient,
    water,
    meals,
    activity,
    sleep,
    profile,
    mocks,
    setCheckIn: (v) => {
      checkIn = v;
    },
    now: () => new Clock(),
    iso: () => new Clock().toISOString(),
    advance: (ms) => {
      time += ms;
    },
    rollover: () => {
      time += 86400000;
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((fn) => fn());
    },
    journey: () => load("application/health/use-journey-engine.ts").useJourneyEngine(),
    reset: () => {
      water.dailyTrackingStore.reset();
      meals.mealsStore.reset();
      activity.activityStore.reset();
      sleep.sleepStore.reset();
    },
  };
}
module.exports = { harness, deferred };
