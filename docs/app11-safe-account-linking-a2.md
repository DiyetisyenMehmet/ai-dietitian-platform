# APP11 safe account linking — A2

This is phase 2 of #53, based on accepted PR #54 head
`8cde82a67214339d754040f6dcf498b86b2d2d10`, tree
`9a66c6493e5c7990a7230706506e90cb193056bc`. The separate PR is stacked on the
phase-1 branch to show only A2 changes; #54 itself is not merged or rewritten.
Staging was checked at `12c15074c71c6bc3c84fc7a32b02eaa71f4f32c7`, tree
`b48efe9fbcf229858dfd959a2c6de3304937ee66`. Its only change since the phase-1
base is the release marker, which this work never changes.

## Runtime boundary

`ACCOUNT_SAFE_LINKING_ENABLED=false` by default. No environment value, deployment,
staging database, production/main branch, APK or other worker's PR is changed.
The new endpoints and stable-Google routing are prepared behind this explicit
security/release gate. Before enabling: integrate accepted schema/code, retain
#49's secure transport/session checks, finish the transition confirmation UI,
and obtain security acceptance. This is server foundation, not a full phone
registration/password/recovery UI or a new login system.

The old Google-email matching is retained only on the disabled legacy path.
Enabling the gate uses the stable verified Google subject, never email similarity.
There is no silent backfill or automatic claim of old Google/email accounts.
Old sessions/passwords/SMS access remain while the gate is off; no passwordless
legacy user is reclassified or locked for lacking a Diewish password.

## Proof and one-time operation

`POST /identity/links/start` requires the existing authenticated user and a fresh
old-method proof: current Diewish password, fresh verified Google authentication
matching an already bound subject, or fresh SMS matching an already bound phone.
An old SMS-only account can prove its original phone placeholder without first
having a password. A Google email match or existing access token alone is never
reauthentication. Wrong-password starts consume a durable per-user attempt budget.

The start fixes the target kind/identifier and binds it to the user, exact access
session, current credential/binding security stamp and real reauthentication
time. Operations expire within five minutes, allow five failed proof attempts,
and share a five-starts-per-ten-minutes database budget under a user row lock.
Changing passwords (including #49 resets), methods or account eligibility
invalidates pending work. There is no separate Diewish password verifier.

`POST /identity/links/complete` consumes the operation and creates the verified
registry entry in one transaction. Email uses a random 256-bit secret sent only
to the target mailbox, with only its SHA-256 stored. Phone uses a fresh Firebase
SMS-authenticated token whose claimed number matches the online verified number.
Google uses the actual token's Google sign-in provider and stable provider subject
matching the online lookup and verified token identities. A linked profile method
or stale token is insufficient. Successful Firebase proof events are unique to
one completed operation. Cross-user/session use, replacement, expired/replayed
proof and ownership conflicts fail without moving a user or data.

The email adapter calls only #49's exported configured encrypted `deliver`.
If #49 is absent or SMTP is unavailable, it fails closed instead of calling the
old log-only mailer. Delivery failures spend the operation and create no binding.
Raw email secrets, OTPs, passwords, identity tokens and provider exceptions are
not persisted in logs by this implementation. Links carry secrets in the fragment;
the future `/identity-link` UI must scrub it and POST the proof without URL queries.
No claim of live mailbox/SMS/device acceptance is made by fixture tests.

## Existing Google transition

With the gate enabled, `/identity/external` resolves Google sign-in using the
verified stable Google subject. Existing bindings keep the same userId even when
email or Firebase UID changes. If no binding exists, legacy email/UID-derived/
phone aliases are candidate discovery only: they cannot authorize login or create
a second profile. Ambiguous candidates fail closed. Truly new Google accounts and
their stable anchor are created atomically; a collision rolls everything back.

`POST /identity/google-transition/start` requires fresh Google authentication and
exactly one eligible old account. It sends a new one-time proof to that account's
existing real mailbox that was already verified on the old account, never a supplied replacement or unverified address. Completion requires
both the same verified Google token and the emailed secret; it atomically records
the stable Google binding and preserves the original userId/password/data. It
uses the existing shared session issuer and HttpOnly refresh-cookie contract.
A lost mailbox, synthetic mailbox or ambiguous ownership has no bypass: use a
previously available old method to reauthenticate or stop for separate recovery
policy. An already authenticated SMS user can link Google through the normal
proof-bound linking operation without claiming another account.

New recovery-phone binding does not accidentally enable SMS-only normal login or
make `/identity/external` create a second profile. Normal phone+password and first
password creation remain #51/#52. The Android #50 request/response/native path and
frontend files are untouched.

## Cross-table ownership reservations

The A1 verified registry remains the only identity registry. The additive A2
migration adds scoped operation state, not another account/password system.
Database triggers serialize legacy `User.email` and registry claims on the same
canonical email/phone advisory-lock key. Existing registration, guest conversion
and other user-email writers cannot race a link and steal its identifier, even
if they do not call the new service. Case variants and original phone placeholders
are reserved too. The existing registry unique indexes and immutable-owner trigger
remain. No existing row is backfilled, renamed, moved or merged. Admin module code,
health relations, subscriptions, Coach and user preferences are not edited.

## #49 coordination

#49 stays open and owned by its existing worker. Do not copy its SMTP/recovery
implementation or discard its authVersion/session/expiry/provider checks.
A2 uses its real mailer through a guarded adapter and the existing shared session
issuer. Password changes invalidate operations through a keyed security stamp
of the current hash/bindings; no raw password/hash copy goes into the operation.
When combining the branches, preserve #49's actual token-provider verification
alongside A2's verified provider facts; neither trusts merely a linked provider
list. The A1 overlap resolution rules still apply to schema/auth/account files.

## Targeted verification only

The dedicated `Safe account linking A2 checks` workflow uses disposable
PostgreSQL 16 and read-only repository permission. It runs only the new A2 tests,
not the 35 accepted A1 checks or prior recovery/device suites. It verifies the A2
migration against pre-existing verified identity, health, Coach and subscription
fixtures; inherited SQL-managed schema drift must remain unchanged. New cases
cover independent old/target proof, session binding, durable attempt limits,
expiry/reset/lifecycle invalidation, replay, concurrent completion, cross-table
registration races, rollback, legacy transition and preservation. Schema
validation/generation, types, lint and build cover the changed server source.
No deployment/native/device/mailbox test is triggered by this workflow.

The same workflow also prepares an isolated integration preview from pinned #49
head `e5291d66b8537bcc24f3dc3053869e9883b14bb6`. Known A1 overlaps are resolved
explicitly, its real SMTP and account service stay byte-identical, and its exact
provider/reset/authVersion/session guards are asserted before only the new A2
checks run on the combined source. No GitHub branch is merged or altered by that
preview, and unknown conflicts abort for review.
