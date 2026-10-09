# APP5-ANDROID-SESSION-RESTORE-A1

Owner: 🛠️ Uygulama Çalışan 5 — Android Oturum / Auth

Handoff status: READY FOR QA RECHECK (candidate fix, not a real-device PASS).

## Source and scope

Started from freshly verified `feature/staging-preview`:
HEAD `872601622880accb59448cc9eb0e6a59bafa2c5f`, TREE `3272db9c10acfb4db3aa25663c2bf14a16a88d90`.
Work branch: `feature/app5-android-session-restore-a1`.
Only Android product code and targeted regression tests changed. Web/backend product auth,
QA workflows, `qa/platform/**`, staging access policy, iOS, design, health logic,
subscriptions and Admin were not changed. No staging merge/deployment or Main/production operation.

## Evidence and causal boundary

The preserved Work Mode 4 run `37927968661` proves real UI login, Dashboard/Coach/preferences/profile,
force-stop, a new native process and WebView, online staging document, then LOGIN at
`SESSION_RESTORE_DASHBOARD_READY`. Its logs do not contain a captured startup refresh status
or cookie-presence evidence. They do **not** distinguish missing cookie from a stale rotated
cookie rejected by the server. No such missing evidence is invented here.

The proven source defect is an absent durable checkpoint after asynchronous auth-cookie
mutation. `onPageFinished` can flush before login/refresh fetch completes; normal lifecycle
flushes do not guarantee execution on abrupt force-stop. Rotation can therefore leave either
no login cookie or an obsolete predecessor on disk, even though the access token still makes
the running UI authenticated. A controlled memory/disk test reproduces this failure with the
old page-finished/lifecycle contract and restores successfully with the completion checkpoint.
This is category B at the **contract** level. Its causality for the actual staging failure still
requires the existing real Android recheck; categories A/C/D/F/J cannot be conclusively closed
from the preserved runtime diagnostics alone.

Frontend hydration already waits in `loading`; duplicate hydrate calls share one promise;
401 recovery is single-flight while authenticated and retries only once. Late hydration cannot
resurrect a cleared session or overwrite a newer account. No rewrite or arbitrary timeout was added.

Live public staging bundle inspection confirms `apiBaseUrl: "/api"`.
Frontend origin: `https://staging.diewish.com`; browser-facing API origin is identical.
Existing Next rewrite forwards `/api` to the configured backend Cloud Run service.
The backend refresh cookie remains host-only (no Domain), HttpOnly, Secure in production runtime,
SameSite=Lax, Path=/api/auth, with Expires matching refresh-token expiry; no Max-Age override was added.
Android uses the ordinary app WebView data directory, accepts first-party cookies, rejects
third-party cookies, and does not clear cookies/data on startup. Actual cookie acceptance,
SQLite persistence and startup cookie transmission on a real device were not inspected here.

## Native-only implementation

- Add AndroidX WebKit 1.17.1 for the official document-start script API.
- Register the write-only `DiewishSessionCookies.persist()` bridge before the first load.
  The method has zero arguments, returns no credential and checks the existing trusted-page predicate.
  `CookieManager.flush()` runs synchronously on WebView's JavaBridge thread.
- Install a short fetch observer at document start, restricted to the exact configured HTTPS
  app origin. It checkpoints only successful POSTs to the existing auth/identity cookie-changing
  endpoints, before returning the original Response to the existing HTTP client.
- Preserve request arguments, credentials, Response identity, rejection and backend auth validation.
  Do not read headers, bodies, cookie/token values or password material.
- Reuse an idempotent bootstrap at page finish and preserve pause/stop/destroy/back persistence.
  Remove the JS bridge when the WebView is destroyed. There is no periodic timer/poll or general API flush.

The document-start registration prevents missing a hydration fetch already in flight when the
page finishes. No new frontend publication is necessary: the native host observes the existing
published frontend. QA must build/install this branch's APK while retaining its existing QA harness.

Old WebView providers lacking `DOCUMENT_START_SCRIPT` retain safe page-finished/lifecycle fallback.
There is no guaranteed checkpoint for their pre-bootstrap in-flight startup refresh. Authentication
still fails closed; there is no third-party-cookie/TLS/storage workaround. The real QA provider
must report/verify document-start support; old-provider full persistence remains a limitation.

## Validation

- Frontend complete suite: 197/197; final targeted auth/native-script suite: 12/12.
  One additional final test covers document-start + in-flight refresh across page finish.
- Backend unit suite: 265/265.
- Backend auth/security/onboarding integration: 3/3, including local fresh login, cookie restore,
  logout, missing cookie, server-expired DB session, revoke, account isolation, rotation and replay.
  These ran on a disposable local PGlite PostgreSQL engine with a single connection and PgBouncer
  compatibility. This is not a stock multi-connection PostgreSQL concurrency validation.
- Real Chromium browser E2E: 3/3, ordinary UI login without cookie/storage injection; reload,
  new same-context page, isolated empty context, logout/reopen and server revoke/reload.
  Dashboard, Coach, profile, notification preferences and Nutrition Plan navigation remain authenticated.
- Android Robolectric unit tests: 32/32 (7 session/host tests); actual MainActivity creation/destruction,
  recreated WebView, bridge registration before load, exact origin, cookie policy, lifecycle and
  safe unsupported-provider fallback. Persistence/process-death assertions use an explicit test
  disk model, not real Chromium cookie storage.
- Android debug APK: `:app:assembleDebug` PASS with Java 17, Gradle 9.6.0, SDK 36, staging-only URL.
- Frontend/backend type checks, scoped frontend lint, full backend lint and both builds: PASS.
  Frontend build retains existing unrelated lint warnings.
- Full Android lint: FAIL, 8 errors/13 warnings in existing scanner/camera/theme code; no rule
  suppression/baseline was added. A detached checkout of the exact starting staging SHA produced the same 8 error signatures and 12 warnings. The added WebKit dependency introduces one additional detector warning, MissingOnRenderProcessGone, for the existing host's absent renderer-crash handler; renderer-crash recovery is outside this process-restart auth fix. No warning/error was suppressed.
- npm production dependency audit: frontend 0, backend 0 vulnerabilities.
  Full audit: frontend 7 high findings and backend 9 high findings in unchanged development/build
  tool chains. JS lockfiles/package manifests are unchanged; these findings were not hidden or fixed
  outside this auth scope. AndroidX new dependency version was verified against Google's Maven metadata.
  Its external OSV query could not complete due to the environment's network-approval cancellation.
- No credential/cookie/header logging or new persistent token/password storage was introduced.
  Access token stays memory-only; refresh stays HttpOnly; Secure/TLS/rotation/revoke/origin protections stay intact.

## Required independent recheck

Work Mode 4 should use its existing protected staging account and unchanged harness, building
this branch's native host. Do not replace its QA branch with this branch: the newer harness is
separate from the product source. Re-run the original Dashboard → Coach → preferences → profile →
force-stop → relaunch → Dashboard → Coach scenario. Require
`SESSION_RESTORE_DASHBOARD_READY = PASS` without logging in again, injecting cookies/storage,
changing access policy or converting failure into success. Verify logout/revoked/expired/data-reset
negative cases remain LOGIN. No test credentials were requested or new staging secrets created here.

Actual authenticated Android result: NOT RUN here (no approved QA credentials/runtime).
The branch is a reviewable, technically tested fix candidate; actual runtime causality and acceptance
remain unverified. Preserve this distinction in Work Mode 3's independent product verdict.
