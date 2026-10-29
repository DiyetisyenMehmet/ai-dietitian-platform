# G1 / #103 — plan meal check-in contract v1

Implementation branch: `fix/app13-g1-meal-checkin-phase2`. Backend only; no frontend integration or shared database activation is included.

## Identity and state

The authenticated account, immutable plan row ID, real calendar day number,
zero-based meal index and server-validated scheduled local date identify one
confirmation. Two SNACK meals have different indexes. Plan revisions create new
plan IDs; confirmations are not copied between them. An inactive, pending,
deleted, foreign or malformed plan is rejected.

The persisted calendar's `cycleIndex` is followed exactly, without modulo or
MealType inference. `dateOffsetDays` accounts for plan pauses. In meal order, a
clock time less than or equal to the previous time rolls forward one calendar
day, matching the existing plan reminder/Journey schedule. Thus a 00:30 meal
after a 22:00 meal uses the following local date, while retaining its original
plan day number/index. No device clock, server timezone or current UTC date
changes this identity. Missing/ambiguous calendar data is not reconstructed.

GET presents a missing confirmation as `active=false, revision=0, id=null`.
Every accepted new intent advances the revision, including a deliberate same-state
intent based on the current revision. An exact replay returns the immediate
successor only when its target state matches. Any older revision gets 409.
Undo stores an inactive row; it does not physically delete the state or food logs.
Undo before the first confirmation also stores a revision, blocking a delayed
revision-zero confirmation. A re-confirmation after undo requires a fresh explicit
user action using the current revision. Never automatically retry 409 with a new
revision: read and display current state first.

## Endpoints (mounted under `/api/tracking`)

| Operation | Request | Successful response |
| --- | --- | --- |
| Read one plan day/date | `GET /meal-check-ins?planId=<uuid>&dayNumber=1&localDate=2026-10-29` | `{success:true,data:{day:{contractVersion:1,source:"PLAN_CHECK_INS_ONLY",legacyMealLogsExcluded:true,unplannedSupported:false,planId,planVersion,dayNumber,localDate,planDate,checkIns,total,completed,allDone}}}` |
| Explicit “Yedim” | `PUT /meal-check-ins/<planId>/<dayNumber>/<mealIndex>?localDate=YYYY-MM-DD`, header `If-Match: "0"`, empty body | `{success:true,data:{checkIn:{contractVersion:1,planId,planVersion,dayNumber,mealIndex,localDate,id,active:true,revision:1}}}` |
| Undo confirmation | Same path/query, `DELETE`, header `If-Match: "1"`, empty body | Same identity/ID, `active:false,revision:2` |
| Exact network retry | Identical method/path/date/expected revision; body remains empty | Same ID/state/revision, status 200 |

Mutation responses return an ETag containing the quoted revision. All reads and
mutations use `Cache-Control: no-store`. Unknown body fields, including userId,
calories and food data, are rejected. Identity is never taken from the body.

Status codes: 401 invalid/inactive session, 403 guest or missing write consent,
404 missing/deleted/foreign plan, 409 inactive/pending/ambiguous plan or stale
revision (`MEAL_CHECK_IN_REVISION_CONFLICT`), 422 invalid date/index/header/input,
503 missing reviewed storage (`MEAL_CHECK_IN_NOT_READY`). A 503 must not cause
fallback or dual writes through the legacy endpoint.

GET and DELETE preserve existing read/delete access after consent withdrawal;
PUT retains the existing health consent guard. No new access policy is introduced.

## Transition and frontend integration boundary

The new endpoint is the only authority for **exact planned-meal confirmation**.
The existing `POST/GET/PATCH/DELETE /meals` remains unchanged and append-only for
creates; it serves food records and legacy generic confirmations. Legacy rows
are neither converted, merged, cleaned, removed nor counted in the new endpoint.
Food names/macros, a scanner result or an old SNACK log never imply consumption
of a particular plan meal. New confirmations never write MealLog rows.

An upgraded client must select one confirmation source for a plan/date: after a
successful v1 GET, use only returned exact identities/states. Do not OR, sum or
union them with legacy confirmations, foods, local storage or the old slot state.
No response means unknown/unavailable, not successful consumption. Do not send
new plan identity fields to the legacy POST: its validation strips those fields.

`completed`, `total`, and `allDone` refer only to the requested **plan day and
scheduled local date**, not the whole plan, nutrition totals, water, or all daily
Journey goals. A post-midnight portion is a separate date response. The client
must aggregate exact identities for the visible calendar day across applicable
plan day numbers; it must not call one scoped `allDone` the completion of the
whole daily nutrition plan. A zero-meal response has total=0 and allDone=false.

7/14/30-day plans use the same contract. Plans without an exact valid calendar
remain unsupported. A user with no plan retains the legacy breakfast/lunch/dinner
flow; plan-level cross-device idempotency for that unplanned flow is **BLOCKED**
and is not claimed here. No synthetic plan ID is created.

“Farklı yedim” and scanner returns continue to use existing explicit food entry
and deviation flows. They must not also confirm a plan meal automatically.
“Yemedim”, UI wiring, handling an undo button, scanner navigation and Journey
11-B are future separately assigned frontend work. Existing “Takip dışı” remains
until the new API is actually available and the UI integration is reviewed.

## Storage, deployment and rollback boundary

Prisma adds `MealCheckIn`, its two inverse relations and a redundant `(id,userId)`
unique index on NutritionPlan for an owner-safe composite foreign key. Only the
new confirmation table has the logical-identity unique constraint and positive
revision/day/index checks. MealLog columns, indexes, records and all other module
queries stay unchanged. All state changes execute under user-row FOR UPDATE and
plan-row FOR SHARE locks in one READ COMMITTED transaction; a DB unique constraint
backs up first creation across processes. Transaction failure leaves no half-state.

SQL lives in `prisma/migration-drafts/20261029000100_meal_check_ins/migration.sql`,
outside the deployment migration chain. It is reviewed code, not authorization to
apply it to Neon/Test2/staging/production. The application needs the new table
before a future separately approved backend rollout; missing storage yields 503.
Promotion to the normal migration chain and shared DB application need explicit
approval. No existing data backfill or destructive cleanup is needed.

Rollback disables the new UI/API usage or restores earlier code; retain the added
table and its state. Never drop it or erase user confirmations as a rollout undo.
On later reactivation the persisted revision history must remain intact. Standard
account/plan deletion cascades use the existing owner deletion semantics; this
change does not initiate such operations.

## Reproducible isolated PostgreSQL verification

The dedicated workflow runs only tests, with read-only repository permissions
and a fresh `postgres:16-alpine` service. It has no cloud identity, shared DB URL,
deploy, merge, APK or production step. Existing migrations initialize the empty
local service; guarded acceptance tests apply the draft to that disposable DB.

Local reproduction requires a fresh disposable PG 16 database named
`app13_mealcheckin_<suffix>` listening at literal 127.0.0.1, baseline migrations,
`NODE_ENV=test`, synthetic JWT secrets and both explicit variables:
`MEAL_CHECK_IN_LOCAL_TEST=1` and `MEAL_CHECK_IN_TEST_DATABASE_URL=<local URL>`.
There is no DATABASE_URL fallback. Run:

```
node --import tsx --test src/modules/tracking/meal-check-in.postgres.test.ts
```

Two separate Node server processes use different real PostgreSQL connections.
The race test holds a third transaction's user lock until both server connections
are observed waiting in pg_stat_activity, then verifies a single row/revision.
Response-loss tests sever the socket after persistence. An insert trigger forces
a transaction exception to verify rollback. Schema before/after checks preserve
all existing columns and seeded food data. The old 14 baseline checks remain
legacy compatibility evidence; they are not new solution acceptance.
