# APP11 phone/password registration — A3 (#53, #51)

Based on accepted A2 PR #55 head `c347ce18248e09f925c54db6a0fe054b8bbe0714`,
tree `e54faf951b08634b2455c867ba2fbbe699e699a4`; stacked on that branch.
Staging checked at `12c15074c71c6bc3c84fc7a32b02eaa71f4f32c7`, tree
`b48efe9fbcf229858dfd959a2c6de3304937ee66`. #54/#55 remain open and unmerged.

## Release boundary

Both `PHONE_PASSWORD_AUTH_ENABLED` and accepted A2's
`ACCOUNT_SAFE_LINKING_ENABLED` must be true for the new paths. Both default off;
no runtime setting has been changed. Requiring A2 prevents an old Google token
with a merely linked phone from entering a new phone/password account through
legacy email matching. The remaining unsupported external-provider path also
refuses to claim a phone from linked profile metadata. All A2 activation prerequisites still apply, including
its old-Google confirmation UI, secure mail readiness and security acceptance.

No staging migration, deploy, APK, production/main change, force push or other
worker's PR merge. New migration is prepared, additive and tested only on a
throwaway PostgreSQL service. No real SMS or external account is used in tests.

## Registration and normal login

The existing `/phone-auth` page requests the runtime gate. When off it retains
the previous SMS UI; configuration failure fails closed. When enabled it offers
normal phone/password login, registration/initial-password setup, and an explicit
old-SMS-only transition entry. Normal login never initializes Firebase or asks
for SMS. Google/native Android and email recovery implementations are untouched.

Registration uses the existing Firebase SMS/reCAPTCHA client and online server
verifier. Require actual SMS provider, matching signed/lookup E.164 phone and
fresh auth_time. SMS alone creates no User or Diewish session for a new phone.
`/identity/phone-password/start` creates only pending state with a random 256-bit
HttpOnly cookie and its server-side hash. Never return the secret in JSON or
put codes/passwords/provider tokens in local/session storage or URLs.

The cookie is API-path scoped and uses the existing Secure/SameSite policy.
No-store/no-referrer headers, strict JSON schemas, a custom request header and
an explicit allowed-Origin check protect the cookie operation. Number/userId
cannot be supplied again to the completion endpoint. Expiry is at most five
minutes from the actual SMS event, not from token refresh or page reload.

The password/confirmation use the existing Diewish strength policy, with an
explicit bcrypt 72 UTF-8 byte bound. On completion, consume the pending operation,
create the same User and verified PHONE anchor, and write the one existing
bcrypt passwordHash in the SAME transaction. Only then issue the existing
Diewish session/HttpOnly refresh cookie and follow the unchanged consent then
age/weight/goal onboarding. Email is not marked verified by phone proof.

Phone login resolves only a verified PHONE anchor and delegates to the existing
auth service/verifier/session implementation. Verified email and phone therefore
share one password. No second password database or Firebase password is created.

## Old users and interrupted operations

The registry and original legacy phone identifier must agree. Any ambiguity,
another owner's identifier, or a recovery phone belonging to an email/Google
account blocks registration/first-password setup; it never merges accounts.

Known unusable-password legacy SMS accounts require a fresh original SMS proof.
Unknown legacy provenance is not guessed from a placeholder: additionally require
an existing authenticated Diewish principal for that exact account. The UI first
obtains that original SMS account session through its retained transition route,
then requests setup using the principal and the new SMS proof. A different user,
a session alone, or an external profile's linked phone is insufficient.

Only an original SMS account with no proven usable password keeps SMS access.
New phones cannot create accounts via `/identity/external`; proven password
accounts are told to use phone/password and cannot bypass it with normal SMS.
Self-deactivated legacy SMS owners may restore after fresh original proof;
Admin, suspended and deletion-pending accounts stay blocked. After initial
password establishment, the transition SMS channel is closed for that account.

No real account backfill, identity reassignment or health relation write.
UserId, health/Coach/subscription rows and onboarding status stay unchanged.
Old refresh sessions, pending reset tokens and unfinished linking operations are
invalidated on initial-password establishment. When combined with #49, its
existing authVersion increments atomically, so previous access tokens fail too.
Without #49 old access tokens retain their existing bounded expiry; enable only
after approved #49 integration if immediate revocation is required.

Reload/close can resume the password form through the short-lived HttpOnly cookie;
password and confirmation are always empty. Missing/expired/cancelled cookie
requires new SMS. Same-browser restart invalidates its old operation. Proof-event
uniqueness is shared transactionally with A2 using an additive database trigger.
Two submits/parallel registrations cannot create two owners or overwrite a winner.
If the response is lost after successful commit, normal phone/password login
recovers access; replay cannot change the password again.

IP limits remain, with new durable HMAC-keyed per-number limits: five setup
starts and ten login attempts in ten minutes, shared across server instances.
Raw ORM query/error output is disabled because its exceptions can embed identity
values/hash arguments before sanitized service handling. New provider/database
errors expose only fixed operational messages; no raw proof/credential logging.
Pending state has expiry but periodic physical deletion/retention is a later
operational policy; expired rows never authorize and proof replay tombstones
must not be deleted while a proof can still be accepted.

## Validation

Only new A3 tests are run; accepted A1/A2 suites are not repeated. Workflow:
`.github/workflows/phone-password-registration.yml`.
- Additive migration compares complete pre-existing phone/email/Google fixture
  fields and related health/Coach/subscription records before/after.
- Targeted A3 PostgreSQL integration: proof/provider/phone mismatch, stale proof,
  gate-off behavior, hashing, no pre-password account, browser-bound resume,
  password policy, one-time/replay/cross-flow proof, transaction races, legacy
  identity/data preservation, auth/reset invalidation, CSRF, shared budgets.
- Same new suite against isolated pinned #49 source; SMTP/account service remain
  byte-identical except accepted provenance writes, recovery UI guards/headers
  retained. No actual GitHub merge. #50 native source/contract remain untouched.
- New synthetic Chromium flows cover registration, wrong SMS/password/mismatch,
  resumed empty password form, one submit, cancel, no-SMS normal login, default-off
  fallback, configuration failure and mobile widths. These are not real SMS,
  physical Android/iOS or provider-runtime acceptance.

Before rollout: approved dependency integration and migration, A2 prerequisites,
security acceptance, and separately authorized real SMS/device acceptance.
Google recovery, full SMS reset, all profile linking UI, Admin and payment
behavior remain outside A3. Stop here; no following phase or release is implied.
