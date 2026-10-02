# Journey / Goal Engine foundation — reconciled

## Verified bases and accepted work

- Original Journey base: `6f114afc0f56fe3294cff3bbf95217468b9f6ba8`.
- Accepted Journey commits: `a9fcd475dacb6a4826008101fe0954a6b0fd5784`, `3dd8bd1fffc962359c788bbe98cf16ba79db668d`.
- Reconciliation base HEAD: `62c0226d2e2c0f57f77250da8b28a0d73577a717`.
- Reconciliation base TREE: `d34c23ff693428817a4b065f2edf5a8a99740e7c`.
- All five Daily Health Data Reliability commits are retained as ancestors. Remote objects were read through the GitHub connector and imported locally with every blob, tree and commit SHA verified because shell network access was unavailable.

The old patch fails to apply in activity-store, daily-tasks, daily-tracking-store and meals-store. It was not applied over those changes. The accepted pure engine, companion result hooks and completion gates were retained; their source adapter was reconciled to the new daily-readiness stores. Profile hydration's real sleep source and reset coverage were preserved.

## Shared decision contract

`journey-engine.ts` remains pure. `use-journey-engine.ts` adapts real stores. Existing `useDailyJourney()` and `useDailyTasks()` signatures remain intact. Companion result hooks expose engine status: only `all-done` enables completion messaging, including in the actual rendered sections. Empty projections and partially known completed sources cannot claim all-done.

The engine selects at most one pending step with a real action destination. Priority is due weekly check-in, breakfast, lunch, dinner. With no candidate, it returns null and distinguishes all-done, insufficient-data and no-actionable-step. Weight timing comes from the backend check-in response, uses exact nextDueAt and local-day measurement identity, and respects inactive status. Synthetic profile baseline rows do not establish check-in completion.

Goal direction is target versus starting weight: lose/gain/maintain, or null if unavailable. Goal-aware reasons remain conservative; no calorie adaptation, medical recommendation or pace prediction. Current weight cannot silently reverse the goal. Task projection preserves action-oriented copy without duplicating decisions. Only explicit REGULAR schedules apply local 12:00/17:00/23:00 cutoffs; null, undefined and shift schedules do not. The skipped UI badge is unchanged.

Optional snacks are acknowledged only when recorded; coach visits are not mandatory. Activity acknowledges persisted minutes rather than prescribing an exercise goal. There is no independent /water route, so the water step remains non-tappable and cannot be recommended.

## Daily reliability and confirmed writes

The existing `dayKey` and UNKNOWN / KNOWN_ZERO / KNOWN readiness model is authoritative for daily collection completeness. Journey no longer adds a second loaded-date model. Fetch failure is UNKNOWN, never known zero; previous-day rows are filtered and subscribed caches reset at midnight. Steps, exercise targets and estimates entered only on the client cannot substitute for persisted activity evidence.

The new real sleep daily-assessment source now supplies Journey sleep sufficiency. No sleep task, sleep target or health advice was added. Health score continues to exclude UNKNOWN meal/water/activity aggregates, including partially confirmed successful writes.

A successful write and a complete daily aggregate are different facts:

- Water retains confirmed POST receipts by ID for the current day and exposes `confirmedWaterMl` separately from aggregate readiness. The existing amount text displays confirmed additions even if the subsequent full-day GET fails. Percent/goal completion stays hidden/UNKNOWN until the collection is authoritative. Removal, day rollover and account reset clear the applicable receipts.
- Meals retain persisted foods and meal check-ins in their existing record list while collection readiness stays UNKNOWN. Individual records stay visible; totals are not certified by one POST.
- Activity retains persisted entries while readiness stays UNKNOWN. The existing record list remains visible in this case; the daily aggregate stays neutral.
- Account generations reject responses from requests started before a reset. Write revisions prevent an earlier GET from erasing a later successful write. Writes recheck the local day after awaiting the backend, so yesterday cannot be reintroduced at midnight. Profile hydration rejects an older account's delayed profile before it starts more source reads.

## Behavioral validation

Frontend regression coverage uses actual transpiled stores and hooks with controlled API promises and clock/timers, plus React server rendering of the actual Journey, Tasks, Water and Activity components. It exercises successful and failed reads/writes, partial display, removal, midnight, filtered dates, account resets, delayed responses, score exclusions and real sleep readiness. The engine's 1,152-case recommendation invariant and goal/schedule tests remain. The obsolete daily-task source-pattern assertion was replaced with an authoritative check-in behavioral assertion.

Final validation commands and results are recorded for this reconciliation, not inherited from the earlier patch:

- `node --test --test-isolation=none tests/*.test.cjs`: 110 frontend tests PASS. Node 24's non-isolated runner exposes individual test counts in this sandbox.
- `TZ=Europe/Istanbul node --test --test-isolation=none tests/journey-sources.test.cjs`: 30 local-calendar/source tests PASS with UTC+3.
- Frontend TypeScript and targeted ESLint: PASS.
- Existing Playwright weight data regression: 4 PASS.
- Backend unit files run individually with the existing tsx loader and test-only configuration: 230 PASS; 3 tests blocked by `listen EPERM` on local test server creation (auth-rate-limit, blood-test upload, scheduler-trigger). Backend source is unchanged. This is not a claim that the full backend suite passed in the restricted environment.
- Backend database integrations could not be rerun because the sandbox blocks the local Docker socket/network and additional-permission attempts did not complete. Prior patch rounds' successful integration runs are not counted as current reconciliation validation.

No dashboard layout/classes, Android parity files, health-score display changes from the new base, subscriptions, admin, backend source or schema were overwritten. Presentation edits only gate completion and preserve visibility of confirmed records. No deploy, deployment marker, production access or force push.
