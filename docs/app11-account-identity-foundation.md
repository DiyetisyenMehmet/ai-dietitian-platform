# APP11 unified account identity foundation — phase 1

Issue #53. Base staging: `de3bbc689d8e5f8b6bdfa74e93f6ba6877fb79b5`,
tree `bd2003432e1fc7d817a8d3122d67c1390043fc88`.
This phase prepares persistence and authenticated metadata. It does not implement
phone/password login, SMS recovery, first-password setup, new linking UI or any
new authority to access health records. Those remain #51/#52 and approved later phases.

## Server source of truth

| Stored fact | Meaning |
| --- | --- |
| `User.id` | Unchanged canonical account; every health/session/subscription relation continues to reference it. |
| `User.hasUsablePassword = true` | User-chosen Diewish password was set or the current local password was successfully proven. |
| `User.hasUsablePassword = false` | Newly created external/guest account has no user-chosen password. The random internal hash is not a usable credential. |
| `User.hasUsablePassword = null` | Legacy provenance unknown. Never infer true from `passwordHash`, or false from a synthetic address. It does not gate existing login. |
| `AccountIdentity(EMAIL, identifier)` | Separately recorded verified email, canonical lowercase with plus aliases preserved. |
| `AccountIdentity(PHONE, identifier)` | Server-verified E.164 phone, including country code. |
| `AccountIdentity(GOOGLE, identifier)` | Stable Google provider subject, case-sensitive; never email or Firebase UID. |

The existing bcrypt `passwordHash` remains the **only** password verifier; no
second password, secret copy or new identity provider is introduced. Registration,
proven local login, guest conversion, and the existing password writes maintain
the metadata. New external secrets are explicitly false. No legacy batch guess
or automatic link backfill runs.

Each identity kind/identifier is globally unique, and a user has at most one
identifier of each kind. A foreign key cascades only when the same user is deleted.
A database trigger rejects reassignment of owner, kind or identifier by update;
format checks and unique indexes back the application checks. No merge, transfer,
replacement or delete/link route exists.

## Read contract

`GET /api/identity/account-methods` uses the existing normal-user authentication
middleware, loads the principal from the database, and returns only that user's
metadata. Caller-supplied user selectors have no effect. Guest, inactive,
deletion-pending and Admin principals are rejected. Response: `Cache-Control:
no-store`; no raw address, number, provider subject, password/hash, token or health
data is returned.

`email.verification` is `VERIFIED`, `UNVERIFIED` or `NOT_SET`, with a source
`REGISTRY`, `LEGACY` or `NONE`. A legacy email verification flag is reported as
legacy, **not upgraded to a fresh account-link/recovery proof**. Missing phone and
Google registry entries return `null` (unknown), not a false assertion that an old
user never used these methods. Password `usable` is also tri-state.
`linkingEnabled` is always false. This response grants no login/recovery rights.
No existing frontend client or AuthUser response is changed.

## Internal registry boundary

`recordVerifiedAccountIdentity(tx, input)` is a persistence primitive with **no
runtime caller or HTTP write route in phase 1**. It is not an ownership proof
validator. It must only be used by a future approved flow after proof consumption
and current-session reauthentication in the same transaction. It checks normal
active-user eligibility, legacy email/phone reservations, canonical identifiers,
unique ownership and same-user idempotence. Conflicts return a fixed generic error
without the other owner's identity. Insert races use `ON CONFLICT DO NOTHING` and
read the winning owner, rather than exposing raw unique-constraint exceptions.
Unexpected persistence exceptions are replaced with a fixed sanitized error.
The new code contains no OTP/password/token/identifier logging.

## Explicit limits and phase 2 prerequisites

- Existing external sign-in still uses the legacy `accountEmail` lookup. Its
  historical Google subject was never stored. Phase 1 does not retroactively
  infer provider ownership from a matching email, rewrite #50, or lock legacy
  external users out. The new registry is **not used for sign-in/recovery yet**.
  Consequently, this PR does not claim to eliminate legacy email-based external
  matching. Before activating account linking, phase 2 must replace that behavior
  with verified stable-provider bindings and a safe legacy transition. Ambiguous
  old Google/email accounts require existing-account reauthentication; silent
  email-based adoption is prohibited. No real account is migrated by this PR.
- The later linking service must consume short-lived single-use ownership proof,
  enforce recent reauthentication, risk/attempt/rate controls and transactional
  rollback. A supplied timestamp or an existing login session is not sufficient.
  Reuse the existing email token/recovery and SMS systems; do not add a second one.
- All later email/phone claim and registration writers must share a serialization
  contract for legacy identifier reservations. The internal preflight lookup is
  conservative but is not a cross-table concurrent registration reservation.
  No public phase-1 caller can create that race. Registry-to-registry ownership
  races are covered by actual database unique constraints.
- Linking, unlinking, recovery and first-password flows remain disabled until
  their own security review and manager authorization. No last-method removal,
  SIM-transfer decision or lost-Google recovery policy is introduced here.

## Preserve parallel work

#49 remains the email recovery owner. This PR only adds password provenance to
its existing password writes. When integrating #49 and this phase, retain
`authVersion` increment, expiry/role checks, delivery completion, session
revocation and `hasUsablePassword: true` in the **same** successful reset write.
Do not keep either side of an overlapping hunk wholesale. #49's changes to
external token provider checks must also survive; the synthetic identity fixtures
use provider-bearing tokens so they can run with both implementations.
#50's Android/native/frontend changes, #31's Coach changes and #51/#52 are not
copied or changed. No Admin implementation file or health relation is modified.

## Migration and verification boundary

Migration `20261017123000_account_identity_foundation` adds one nullable metadata
column and an initially empty identity table/indexes/constraints/trigger. It
updates no existing data and never guesses email/phone/Google ownership. No
staging database operation, deploy, APK build, production/main write or PR merge
is authorized or performed. A separately authorized integration must apply the
migration before running the new Prisma client/endpoint.

The dedicated `Account identity foundation checks` workflow uses disposable
PostgreSQL 16, read-only repository permissions and no deployment/native steps.
It applies the old migrations, seeds three synthetic legacy account types with
weight/chat/message records, snapshots all fields, applies the new migration,
and proves byte-equivalent row data (except the new null column) and no inferred
links. It then runs schema validation/generation, type/lint/build checks,
foundation security tests, relevant auth/lifecycle/onboarding/Admin compatibility
and a Prisma schema-drift check. Fixture script refuses non-local URLs and any
database name other than `app11_test`, and requires an explicit disposable marker.

Local PGlite results are supplementary only; they do not prove PostgreSQL 16
parallel-connection behavior. The real PostgreSQL workflow result is authoritative
for that check. No real phone/SMS/mailbox/Google device flow is claimed by phase 1.
