# Nutrition smart preparation — phase 2

This change extends the existing five-day validated meal generator. It never starts speculative preparation, edits payment/provider records, or deploys staging.

## Release controls

- Default: `NUTRITION_JOBS_ENABLED=false`. Production activation is rejected by the nutrition entry-point guards.
- Development/test or explicitly identified staging must also set `NUTRITION_RIGHTS_EFFECTIVE_AT` to the reviewed policy cutover instant. The CI-only year-2000 fixture date is never a release configuration.
- All runtime traffic must use the reviewed release before pilot activation; old replicas must not keep exposing synchronous legacy generation.
- A separate authenticated `/api/internal/scheduler/nutrition-step` request executes one bounded step. No nutrition AI is appended to notification `/tick`.
- Existing scheduler identity verification is reused; notification timing and permissions remain unchanged. No scheduler/IAM resources are created by this PR.
- The development-only runner drains explicitly requested jobs. Cloud CPU after an HTTP response and process-local timers are not relied upon for durable progress.
- Staging activation needs a separately approved schedule shorter than the current five-minute notification cadence. Step budget is 100s, claim lease 120s, existing backend request limit 170s; the external nutrition request deadline must cover the step and persistence. No deploy configuration is changed here.

## Persistence and invariants

`NutritionGenerationJob`, `NutritionGenerationBatch`, `NutritionJobRequest`, `NutritionRightsEvent`, and `NutritionWorkerAttempt` are additive models. `NutritionPlan.originPlanId` preserves per-plan-day meal rights across immutable versions. Owner foreign keys cascade on account deletion.

User advisory locks share the existing W1 lock key. Database constraints enforce one active user job, unique job/range checkpoint, unique request receipt and one delivery event. Claim-token and lease checks fence stale workers. No database transaction spans an AI call.

Pause is `PAUSED`, not deletion. It preserves accepted checkpoints and allows an already-admitted valid response to checkpoint without activating the plan. New calls and validation/transport retries are denied after pause. Repeated pause is safe. An in-flight paused call must settle before resume or another request.

Jobs/checkpoints are retained for seven days; cleanup removes sensitive input/output without spending allowance. Delivered jobs keep a minimal receipt, clear health context/input, and retain the immutable plan/history and successful rights event.

Restart resumes from stored checkpoints after an expired claim. A crash after provider response and before checkpoint can repeat an external paid call; no exactly-once billing guarantee is claimed. Persistent days, plans and successful rights consumption are deduplicated.

## Safety and reuse

The current consent, account lifecycle, weight check-in, profile safety, target calculations, blood-test freshness, allergy, meal structure and rolling realism checks are reused. Revalidation runs at start, continuation, checkpoint completion and delivery. Neither nutrition tolerances nor validators are weakened.

Unchanged health/target context preserves accepted chunks. A new start date, water-only change or wake/sleep clock-only change with identical meal count/names/calorie shares may reuse foods; deterministic clock/water metadata is updated at delivery. Health, allergy, preference, target, meal-structure/schedule or relevant analysis changes invalidate old food checkpoints conservatively. Active plan/deviation fingerprints prevent silently overwriting edits made during preparation.

New delivered plans store a server-only health-context fingerprint. Selected-meal and scoped revision reuse requires the original verified context to match the current one. Legacy plans without this evidence fail closed and require a newly prepared plan; current safety is not assumed retroactively. The manager must review this legacy-pilot boundary together with recurring FREE eligibility before activation. Internal fingerprints/lineage fields are removed from public plan responses.

Single-meal replacement uses the existing `generateRange` engine with the remaining daily nutrient budget after retained meals. The generated meal is merged with exactly the original other meals; totals are computed from their actual values. Complete-plan validation must pass before READY and delivery. Nutrients are never scaled to pass a check. Other-meal and day-level deviation records are preserved.

Existing day/from-day refresh and extension use the same durable worker and immutable version repository; preserved days remain byte-equivalent. These scoped plan revisions consume a new-plan allowance, while the explicit single-meal operation uses only meal-change allowance.

## Rights

- FREE: 7-day only; one successful plan every five calendar months, clamping month-end to the last valid day. No lifetime cap or additional daily/monthly plan cap in the enabled policy.
- PREMIUM: 2/day and 5/subscription-month successful plan deliveries.
- PREMIUM PLUS: 3/day and 10/subscription-month successful plan deliveries.
- Paid single-meal rights are independently 2/5 and 3/10. FREE has one successful selected-meal change per origin-plan day, independently across seven days.
- Daily windows use Türkiye calendar days. Monthly windows derive from the current canonical subscription start (or original Play start), preserving original month-end anniversaries even within annual subscriptions.
- A missing paid-period anchor fails closed with a clear message; an arbitrary calendar period is not invented.
- Paid subscription records created before the explicit cutover retain their existing 15/100 or 60/600 new-plan limits and their original UTC-day/calendar-month windows until a separately reviewed promise migration. They are not bulk rewritten. Existing successful legacy usage before the cutover remains counted; failed/abandoned work has no successful usage event.
- Plan, successful usage, rights event and consumed-job link commit/roll back together. Display, pause/resume, failure and incomplete work do not consume a delivered-plan allowance.
- Coach chat and blood-test limits are unchanged. The existing AI usage endpoint projects the new nutrition-only policy when enabled, without editing payment state.

## Cost limits and observability

The initial configurable global limits are one worker (maximum two), 50 admitted batches/day and 150 actual provider requests/day; a user is limited to 40 provider requests/day. Provider admission is reserved before transport, including retries. Paused calls can still incur cost if already started.

Where returned, actual prompt/output/thinking token counts are stored with provider/model, elapsed time, started-call count and failure code. Unknown usage is not presented as zero monetary cost. No pricing, billing or model-provider change is made. Worker logs contain only safe error codes; no health inputs or AI bodies.

## Review dependencies and QA

PR #33 remains open and unchanged. Its shared generator/service/store changes require manager integration ordering. This branch preserves the existing source and adds compatible hooks; the asynchronous worker records operational timings separately. After #33 integration, connect its optional phase-timing context to the worker without duplicating the instrumentation.

The local development database is disposable and contains synthetic fixtures only. Tests cover horizons, duration gates, pause/resume/checkpoint/lease recovery, separate rights, incomplete output, stale context, manual edits, persistence rollback, concurrent workers and delivery. Browser tests cover reload, pause confirmation and single-meal counters; native Android and dependency scanning run in isolated CI.

Physical Android close/reopen, long disconnect, multi-device real sessions, real-provider 7/14/30 timings, subscription promise audit and final release QA remain a separate manager-controlled activity. Passing development checks is not final real-device QA.
