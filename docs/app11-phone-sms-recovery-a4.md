# APP11-PHONE-PASSWORD-SMS-RECOVERY-A4

A4 adds only SMS password recovery, default off. It does not rerun accepted A3
registration/login tests or merge any existing PR. Production/main, staging
runtime/database, APK and Admin Management Center implementation are untouched.

## Dependency foundation and manager decision

A dedicated isolated foundation branch combines the exact approved dependency
source: #49 plus final #58 `905fb8c30f01a4219270c072ce6b5a86b6495c47`, the
#54/#55/#57 stack plus final #59 `a960577a51b8abdd75040018af6d220202879400`,
and only #63's compatible phone-verification helper
`68d09e2e4f1bf6667d08d40c22dfc06a87a3c8f9`. Existing PR branches are unchanged;
A4's PR targets this foundation so its diff contains only A4. The foundation is
preparation, not approval to merge/release the dependencies. SMTP and account
service/security guards are preserved; no parallel security repair is introduced.
The only shared password-writer extension accepts an existing transaction; its
#58 expected-state check, version increment and refresh revocation stay intact.

Manager explicitly selected "Karma hesapları da kapsa": mixed Google/email
accounts qualify if their PHONE anchor was independently verified before this
recovery intent and they already have a usable Diewish password. No passwordless
Google account, unknown legacy password, inferred phone or reactivation is added.
The PHONE anchor is immutable-owner registry data, not profile similarity.

Staging checked: HEAD `12c15074c71c6bc3c84fc7a32b02eaa71f4f32c7`, TREE
`b48efe9fbcf229858dfd959a2c6de3304937ee66`. #57 itself is not redeveloped.
Its minimal A4 extensions are a flag-controlled recovery entry and purpose
filters preventing its initial-password routes from consuming recovery proof.
#63's remaining A3 screen lifecycle integration is a separate prerequisite; the
new A4 view owns a persistent number/code badge host, keeps memoryOnly fourth,
passes its cancellation signal fifth and cleans only its owned widget on exit.

## One account, one password

Both previous phone flags and new `PHONE_SMS_RECOVERY_ENABLED` default false.
Before activation: approved dependency/migration integration, existing A2 rollout
prerequisites, security acceptance, separately authorized real SMS/device QA.
The new endpoints do not enable a method or return a health-data session.

1. `/identity/sms-recovery/begin` creates a five-minute, browser-bound intent for
   the requested E.164 phone. Its generic response does not reveal user
   existence. Eligible credential/identity state is bound internally before SMS
   delivery, so a concurrent reset/change invalidates even an unverified intent. Per-IP and durable HMAC-keyed per-phone limits apply (5 starts/10m).
2. Existing Firebase SMS verifies a NEW actual phone authentication. The provider
   token must be online-verified, fresh, match the exact requested number, and not
   predate the intent. A linked phone in a Google token is insufficient.
3. `/verify` resolves only a prior verified PHONE anchor, checks a normal active
   non-deleting account with hasUsablePassword=true, and binds exact user and
   password/authVersion/lifecycle/identity security state. Five failed proofs lock
   the intent. Existing A2/A3 event uniqueness blocks cross-flow replay. Expiry is
   never extended by verification, reload or token refresh.
4. `/complete` requires its exact HttpOnly proof cookie and matching password/
   confirmation with the existing Diewish policy, 72-byte bound and old/equivalent
   password rejection. It locks user then identifier and rechecks security state,
   lifecycle, expiry and attempt count after hashing/waiting.
5. In ONE transaction: consume the SMS operation; call #58's existing guarded
   password write; increment existing #49 authVersion and revoke refresh sessions;
   invalidate outstanding email reset/delivery and pending link/phone operations.
   A failed write rolls everything back. Old access/refresh tokens, old password
   and stale session issuance fail. A concurrent newer reset/change wins safely.
6. Return only `{reset:true}`; clear recovery and existing refresh cookies; clear
   client auth memory. The user explicitly signs in normally with the new shared
   password. No new User, automatic merge, identity transfer or health relation
   write is performed. Google anchor and verified email remain on the same User.

The existing phone operation table is extended additively with purpose,
verification time and bounded failures. Existing A3 rows default to
INITIAL_PASSWORD; A4 is SMS_PASSWORD_RESET. Purpose checks isolate the flows.
Hashes only for browser secrets/auth events; no raw password, SMS code, provider
token or identity values in logs. Firebase proof state uses memory-only mode.
JSON/custom-header/allowed-Origin checks, scoped Secure/HttpOnly/SameSite cookies,
no-store/no-referrer headers and no URL/storage secrets protect browser handling.
Closing/reloading after verification resumes an empty password form until expiry;
closing before provider verification requires a new SMS. Cookie loss requires a
new proof. A lost successful response is recovered by normal new-password login.

## Validation and boundaries

Only `.github/workflows/phone-sms-recovery.yml` runs new A4 checks. Disposable
PostgreSQL16 migration preservation includes existing account, PHONE anchor,
health/Coach/subscription records and an old A3 pending operation. New integration
checks cover eligibility (including approved mixed accounts), no session from SMS,
current target proof, purpose isolation, expiry/cancel/replay/attempt bounds,
password policy, reset/change races, rollback, old-session invalidation and data
preservation. Synthetic Chromium exercises only the new recovery view, including
memory-only proof, persistent badge, unmount cancellation, reload, no auto-login,
closed flags and mobile widths. No accepted A3 or security-specialist suite is
rerun; new recovery tests exercise integration with those preserved protections.
No real inbox/SMS, physical Android/iOS acceptance or live feature activation is
claimed. No further phase/release is started by this work.
