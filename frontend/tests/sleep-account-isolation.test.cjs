const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { harness, deferred } = require("./helpers/daily-harness.cjs");

// Capture the actual SleepView refresh callback during render, then drive its
// real Promise.allSettled flow with controlled endpoint responses.
function sleepViewRefresh(h) {
  const callbacks = [];
  const errors = [];
  h.render("presentation/components/sleep/sleep-view.tsx", "SleepView", {
    react: {
      ...React,
      useCallback(fn, deps) {
        callbacks.push(fn);
        return React.useCallback(fn, deps);
      },
    },
    sonner: { toast: { error: (message) => errors.push(message) } },
  });
  return { refresh: callbacks[0], errors };
}

for (const outcome of ["resolve", "reject"]) {
  test(`SleepView: A's late ${outcome} cannot change B's daily sleep or Journey`, async () => {
    const h = harness();
    const pendingA = deferred();
    let dailyCalls = 0;
    let logsCalls = 0;
    let weeklyCalls = 0;
    h.sleepClient.list = async () => { logsCalls++; return { sleeps: [] }; };
    h.sleepClient.weeklyAnalysis = async () => { weeklyCalls++; return { analysis: {} }; };
    h.sleepClient.dailyAssessment = (date) => {
      dailyCalls++;
      return dailyCalls === 1 ? pendingA.promise : Promise.resolve({
        assessment: { date, entries: 1, totalDurationMinutes: 480 },
      });
    };

    const { refresh } = sleepViewRefresh(h);
    const requestA = refresh();
    assert.equal(dailyCalls, 1);
    assert.equal(logsCalls, 1);
    assert.equal(weeklyCalls, 1);
    h.sleep.sleepStore.reset();
    assert.equal(await h.sleep.sleepStore.hydrateTodayFromBackend(), true);
    const snapshotB = h.sleep.useSleepDaily();
    assert.equal(snapshotB.assessment.totalDurationMinutes, 480);
    assert.equal(h.journey().sufficiency.sleep, "KNOWN");

    if (outcome === "resolve") pendingA.resolve({
      assessment: { date: snapshotB.dayKey, entries: 1, totalDurationMinutes: 360 },
    });
    else pendingA.reject(new Error("A's old request failed"));
    await requestA;

    assert.strictEqual(h.sleep.useSleepDaily(), snapshotB);
    assert.equal(h.sleep.useSleepDaily().assessment.totalDurationMinutes, 480);
    assert.equal(h.sleep.useSleepDaily().readiness, "KNOWN");
    assert.equal(h.journey().sufficiency.sleep, "KNOWN");
  });
}

test("SleepView keeps independent logs/weekly requests and reports daily partial failure", async () => {
  const h = harness();
  let logsCalls = 0;
  let weeklyCalls = 0;
  h.sleepClient.list = async () => { logsCalls++; return { sleeps: [] }; };
  h.sleepClient.weeklyAnalysis = async () => { weeklyCalls++; return { analysis: {} }; };
  h.sleepClient.dailyAssessment = async () => { throw new Error("offline"); };
  const { refresh, errors } = sleepViewRefresh(h);
  await refresh();
  assert.equal(logsCalls, 1);
  assert.equal(weeklyCalls, 1);
  assert.equal(h.sleep.useSleepDaily().readiness, "UNKNOWN");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /bir bölümü yüklenemedi/);
});
