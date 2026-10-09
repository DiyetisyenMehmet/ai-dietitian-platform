# WORKMODE4-CROSSPLATFORM-QA-INFRA-A1 — Operator handoff

Owner: 🧩 Çalışma Modu 4 — Platform QA Altyapısı. Independent product verdict owner: 🧪 Çalışma Modu 3.

This infrastructure exercises the **existing staging deployment**, not the branch's web product code. No deployment, migration, auth/access change or product fix is included. Use the QA branch or integrate its infrastructure only after source review.

## Runtime contract

Evidence is under `.qa-artifacts/<run>/<platform>/<runtime>/`. Each scenario has a JSON outcome and an explicitly named PNG; `manifest.json` indexes the run. WebKit is `web/webkit`, never iOS. Android is classified from the actual ADB serial; a physical device requires an explicit opt-in. iOS screenshots come only from XCTest/simctl in an actual Simulator.

Records include: platform, runtime, scenario, timestamp, harness Git SHA, app version, viewport/device, keyed account alias, PASS/FAIL/BLOCKED, screenshot and structured log reference. `harnessGitSha` means the harness source; `deployedGitSha=null` / web `appVersion=unknown` means the deployed website does not expose verified immutable release metadata. Never substitute the checked-out source SHA or the old frontend/DEPLOY_REVISION file for the deployed web SHA. Android user-agent version and iOS shell version are native-host versions, not deployed web versions.

`PASS` means the infrastructure operation (e.g. navigate/capture/record) completed. A sync `observed=false` is deliberately compatible with an infrastructure PASS. Every record has `productVerdict: NOT_ASSESSED`. Work Mode 3 evaluates parity, persisted/retrieved conversations and update behavior. Structured JSON is the safe log artifact; raw browser/native/XCTest logs, API bodies and traces are not exported.

Public smoke produces only an **empty login surface** screenshot. Authenticated smoke produces Dashboard, Coach list, Notification Preferences, Profile and session-relaunch evidence only after approved test-account verification. Missing credentials are **BLOCKED**, not a skipped product PASS. With `QA_AUTHENTICATED_REQUIRED=NO`, a public-only CI job can finish green while its manifest records authenticated-smoke BLOCKED. With `YES`, missing credentials or login failure fails the run.

## Secure account contract

Configure the following in the existing approved **staging GitHub environment**, using its existing access controls; do not add a bypass or expand an allowlist:

| Secret / variable               | Purpose                                                        |
| ------------------------------- | -------------------------------------------------------------- |
| `QA_EMAIL`                      | Existing authorized staging account login                      |
| `QA_PASSWORD`                   | Existing authorized account password                                |
| `QA_ACCOUNT_ID`                 | Optional expected ID; otherwise derived from verified login          |
| `QA_ACCOUNT_HMAC_KEY`           | Optional shared key; otherwise random 32-byte in-memory job key  |
| `QA_SYNTHETIC_ACCOUNT=YES`      | Operator attests dedicated account with minimal synthetic data |
| `QA_AUTHENTICATED_REQUIRED=YES` | Fail closed if full authenticated smoke cannot run             |

Only the existing user-authorized account is accepted; its email is pinned by SHA-256 in the harness. No account is created and the staging access allowlist is unchanged.

`authenticated-run.cjs` verifies the ordinary staging login and completed onboarding, derives the ID from its trusted response, checks any supplied expected ID, revokes only that extra preflight session, and passes the ID/key through process memory to the runtime. When no HMAC secret is supplied, it generates 32 cryptographically random bytes. The ephemeral keys are scoped to one job/process tree: aliases across separate jobs are intentionally not comparable. Use one prepared process tree or an existing shared protected HMAC secret for simultaneous sync. Never transfer generated keys through GitHub outputs, artifacts or env files.

Do not paste credentials into chat, Git, command-line arguments, reports or screenshots. Load them through protected environment injection. The account must already have required consents, completed onboarding and staging entitlement/access. The harness does not grant consent, create users, modify subscription, bypass safety or create a new access identity. Read-only feature screens require minimal prepared synthetic data. Coach sync creates only a neutral synthetic conversation/message and may consume the test account's ordinary Coach allowance; it does not delete/revoke all sessions afterwards.

Web/Android verify the account ID from the actual successful UI login response, held only in memory. The iOS QA host observes the existing web application's login/me/refresh responses, forwards only the user ID through its restricted QA channel, compares the expected account, and retains only an HMAC alias. It clears that proof on navigation/logout/401. Manual preflight immediately logs out **only its own additional temporary session**. A successful preflight alone is never proof of the actual iOS session. Missing secrets are a dependency; configuring a new staging-access identity or widening allowlists requires the user's approval.

## Web

```bash
npm ci --prefix frontend
(cd frontend && npx playwright install --with-deps chromium webkit)
node qa/platform/authenticated-run.cjs web chromium
node qa/platform/authenticated-run.cjs web webkit
```

Both launch real browser engines at 390×844 and Europe/Istanbul. WebKit is a browser rendering check, not a native iOS test. `QA_TIMEZONE=UTC` selects an independent browser context for UTC. `QA_CHROMIUM_EXECUTABLE` supports an installed official Chromium executable. `QA_PROXY_URL` is an optional existing operator network proxy; it does not bypass staging auth or TLS. Local proxy CA trust must be installed by the environment; certificate errors stay fatal.

Credential guard tests use a **DOM fixture**, not staging product evidence:

```bash
node --test qa/platform/credential-screenshot.spec.cjs
QA_BROWSER_ENGINE=webkit node --test qa/platform/credential-screenshot.spec.cjs
```

No trace/HAR/storageState/video/raw console dump is enabled. Capture waits for finite UI animations and font loading to settle, failing rather than recording a faded transitional screen. Login screenshots are refused if email/password fields are populated; checkbox defaults do not trigger this guard. Authenticated web evidence masks the exact test email. Android capture temporarily masks the matching rendered identity only during capture and restores it immediately.

## Android

Use the repository's existing Java 17, Gradle 9.6.0 and Android SDK 36 requirements. The dedicated CI AVD uses Google APIs API 35 (app target SDK remains 36) and actual KVM. The Android setup action explicitly requests `platform-tools`, not the removed legacy `tools` package.

```bash
gradle --no-daemon -p android :app:testDebugUnitTest :app:assembleDebug \
  -PDIEWISH_WEB_BASE_URL=https://staging.diewish.com
adb devices
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
node qa/platform/authenticated-run.cjs android
```

One authenticated ADB device must be present, or set `QA_ANDROID_SERIAL` to the observed serial. Debug WebView inspection already exists in MainActivity; no product-side QA hook was added. Playwright attaches to the **installed native app's WebView**, while screenshots come from the whole actual device. A relaunch force-stops only com.diewish.app and reopens it, retaining the existing WebView data.

The Android-only authenticated entry point is `.github/workflows/crossplatform-qa-android-authenticated.yml` (`authenticated=true`, `platform=android`). CI invokes `bash qa/platform/android-ci-run.sh` after the native build. The emulator action has a 180-second boot limit, uses no snapshots, and the evidence step has a 12-minute limit. A 600-second process-group watchdog terminates the dedicated runtime command and its child drivers; the runtime child itself has a 480-second limit. These limits fail the job rather than turning incomplete evidence into PASS.

Every critical Android stage prints only a fixed stage name, RUNNING/PASS/FAIL/TIMEOUT and elapsed milliseconds. ADB readiness (20s), boot/package-manager readiness (90s), APK installation (120s), native activity readiness (30s), app launch/process checks (20s/15s), WebView discovery/attachment (45s each), staging origin/DOM readiness (45s/35s), login, scenario navigation/readiness, native capture (20s), relaunch (180s) and resource cleanup (5s) are bounded. Screenshots still require the credential guard, settled finite animations/fonts, the trusted staging origin and actual native-device capture. No raw ADB output, page content, request material or private exception text is emitted by these stage logs.

The cancelled Android job in run `37840830014` had already booted the emulator and installed the APK. It emitted a runtime-open timeout after approximately 45 seconds, then stayed alive until the job timeout because device/driver resources created before `openRuntime` returned were not owned by the caller's cleanup. The adapter now owns all discovered devices immediately and closes them on failed attachment. Relaunch selects the WebView belonging to the current app PID, avoiding a stale discovery-cache entry from the force-stopped process. Bounded cleanup and explicit CLI exit preserve the actual failure exit code.

Run `37923039500` narrowed the initial-load failure to guest-network readiness: the attached WebView was a complete network-error document with `navigator.onLine=false`; it remained on that error document after the network came online. Boot completion alone is insufficient. CI now waits up to 120 seconds for the **active default network agent** to report both INTERNET and VALIDATED before the first native activity launch. ConnectivityService output stays private in memory; stale validation history or another network cannot satisfy the check. The staging-origin and subsequent actual login checks remain mandatory; the harness does not navigate around or accept the error page.

Run `37923841847` passed network readiness, staging origin, actual UI login and all four authenticated screen captures. Its remaining failure was an immediate empty `pidof` after force-stop/start. The adapter now uses `am start -W` and polls process creation for at most 10 seconds within the existing 15-second process-readiness stage. Only the running process's WebView is selected. Missing/crashed processes still time out; no relaunch scenario is skipped or marked PASS before its actual authenticated Coach page and screenshot exist.

Relaunch also waits for the native host's initial **authenticated Dashboard and its visible content** before navigating to Coach. `DOMContentLoaded` alone does not prove the asynchronous application/session recovery has finished. Navigating away from a startup document during its refresh exchange can interfere with that exchange. This readiness check is bounded at 60 seconds and fails if Dashboard cannot restore; it does not log in again, seed cookies, change session storage or bypass a failed session. Safe route diagnostics emit only LOGIN/DASHBOARD/COACH/OTHER categories, never actual URLs.

Run `37925755284` restored the native process and fresh WebView successfully but its untouched native startup Dashboard redirected to LOGIN, despite a complete document and online network. This is now an observable session-restoration failure rather than the previous runner hang. Diagnosis observes only the trusted refresh response's HTTP status when it occurs after attachment; cookie names/values and response bodies are never read or logged. Android WebView does not support Playwright's browser cookie-enumeration protocol (`37927049901`); that diagnostic was removed. If restoration ends on the exact staging login URL, a guarded empty-login native screenshot is exported as **failure** evidence, retaining the failed exit code. There is no automatic login retry after process stop. Work Mode 3 owns the independent product verdict; successful four-screen capture must not be advertised as a successful session-reopen test.

Physical device: `QA_ALLOW_PHYSICAL=YES` plus observed ADB serial; screenshots are then labeled android-physical. The destructive lifecycle-control script always refuses physical devices.

FCM is present in the product but the default debug build has no Firebase client config. For push testing, use the existing approved staging notification test APK or provide the existing staging public client Gradle properties (`DIEWISH_FIREBASE_PROJECT_ID`, `DIEWISH_FIREBASE_APP_ID`, `DIEWISH_FIREBASE_API_KEY`, `DIEWISH_FIREBASE_SENDER_ID`). No service account private key belongs in an APK. The A1 default runtime smoke does not assert push delivery.

## iOS

Architecture decision and missing native capabilities: `crossplatform-ios-adr.md`.

On a Mac with installed Xcode and a compatible iOS simulator:

```bash
node qa/platform/authenticated-run.cjs ios
```

The script selects a real installed iPhone/device/runtime compatible with the **active Xcode simulator SDK**, creates an isolated device, boots, builds with local ad-hoc signing for ARM64 Simulator, verifies install/launch, runs XCTest, exports only named approved PNGs and safe JSON, then removes its temporary simulator and private logs. Ad-hoc signing uses no Apple account, developer subscription, provisioning profile or production certificate. Native project: `ios/DiewishQA.xcodeproj`, shared scheme DiewishQA, simulator-only com.diewish.qa.

For live multi-runtime manual sessions, open the project in Xcode, choose an installed iPhone simulator and run the same scheme. Keep it open together with Web/Android, log in through the standard existing staging login, and obtain its UDID from `xcrun simctl list devices booted`. Use the QA toolbar for Dashboard/Coach/preferences/profile/back/refresh. The toolbar is QA host UI and must not be mistaken for production iOS UX.

With the approved account contract injected into the local protected environment, set the observed `QA_IOS_UDID` and run `bash qa/platform/ios-live.sh` **before** opening the sync target list. This launches the already installed shell with in-memory expected identity/HMAC settings; no password enters the native shell. On each iOS target checkpoint press the native `QA` button before answering the harness: populated login fields are refused, displayed emails are masked, and a recent alias-only readiness proof is written in the Simulator app's private temporary directory. The manual harness checks that proof before simctl capture. Web targets open a visible browser (a local display is required); `QA_HEADLESS=NO` also enables visible standalone browser operation.

XCTest secrets are injected into a mode-0600 **temporary xctestrun**; XCTest results and action logs can contain typed text and are never uploaded. Only specifically named screenshots are exported; automatic failure screenshots are excluded. Dedicated synthetic profile data can appear in authenticated iOS screenshots; never use a real user. Simulator app build and public login smoke are separate from authenticated account acceptance.

## Six-direction synchronization

| Direction     | Automation                                     |
| ------------- | ---------------------------------------------- |
| Android → Web | `node qa/platform/authenticated-run.cjs sync android web`   |
| Web → Android | `node qa/platform/authenticated-run.cjs sync web android`   |
| Android → iOS | `node qa/platform/authenticated-run.cjs sync-manual android ios` |
| Web → iOS     | `node qa/platform/authenticated-run.cjs sync-manual web ios`     |
| iOS → Android | `node qa/platform/authenticated-run.cjs sync-manual ios android` |
| iOS → Web     | `node qa/platform/authenticated-run.cjs sync-manual ios web`     |

Run on a machine that can actually reach all selected runtimes at the same time. Separate GitHub Linux/macOS jobs are **smoke jobs**, not evidence of simultaneous synchronization. For all-platform sync, a Mac + Android emulator/ADB device + browser is the simplest single-machine topology. iOS-involving tests are intentionally semi-automatic, not advertised as fully automated.

The source sends one neutral message with a generated marker; automatic Web/Android mode records the server conversation ID from the successful Coach response without dumping the response/token. Manual mode asks only for that server ID and visible yes/no/blocked observations. Obtain it from the permitted request inspector; never paste an Authorization header or token. The target list must be open **before** the source message. The five checkpoint order is: already-open (10-second observation window), list-reopen, refresh, relaunch, logout/login. Screenshots and server ID link the evidence. No conversation deletion or product fix is performed.

For a target iOS simulator, set `QA_IOS_UDID` to the observed 36-character booted UDID. `sync-manual.cjs` invokes simctl screenshot directly. For web/Android targets the harness keeps its real target runtime open while the operator performs each checkpoint. Source iOS is operated in the open Xcode app. There is no image-file import path that could label a mockup as native evidence.

## Lifecycle / network / clock / permissions

| Trigger             | Web                                                                                      | Android dedicated AVD                                            | iOS Simulator                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Refresh             | Real page.reload                                                                         | Attached WebView reload                                          | QA toolbar refresh                                                                                     |
| Kill/relaunch       | New page in same context; browser process restart is a separate manual case              | `android-controls.sh relaunch`                                   | simctl terminate/launch com.diewish.qa or XCTest app.terminate/launch                                  |
| Session persistence | Same-context refresh/page reopen                                                         | Force-stop retains app data                                      | WKWebsiteDataStore + terminate/relaunch                                                                |
| Offline/online      | Runtime adapter context.setOffline(true/false)                                           | controls offline/online                                          | Manual Network Link Conditioner or dedicated network isolation; no unsupported simctl claim            |
| UTC/TR timezone     | Fresh QA_TIMEZONE context                                                                | controls timezone-utc/timezone-istanbul, actual getprop verified | Simulator Settings / dedicated Mac clock configuration; TZ process env is not proof of device timezone |
| TR/UTC day boundary | Schedule/run same scenario around actual boundary; no browser clock manipulation claimed | Dedicated disposable AVD clock controls with verification        | Operator-controlled simulator/Mac clock; record actual date                                            |
| Device reboot       | Browser restart manually                                                                 | controls reboot, wait for boot complete before evidence          | simctl shutdown/boot + bootstatus                                                                      |
| Permission change   | Context permissions/native browser settings                                              | controls grant/revoke camera/notifications                       | simctl privacy where supported; notifications in Settings only when a native adapter exists            |
| App data reset      | Discard dedicated context                                                                | QA_RESET_APP_DATA=YES controls clear-app-data; AVD only          | Erase only the newly-created dedicated QA simulator; never a personal device                           |

Commands for Android controls:

```bash
QA_ANDROID_SERIAL=emulator-5554 bash qa/platform/android-controls.sh relaunch
QA_ANDROID_SERIAL=emulator-5554 bash qa/platform/android-controls.sh offline
QA_ANDROID_SERIAL=emulator-5554 bash qa/platform/android-controls.sh online
```

Use the observed serial, not an assumed 5554. Timezone/root controls require a rootable Google APIs image; a failure remains a failure. Always restore network, timezone and permissions on the disposable test device after a scenario. Native camera acceptance, APNs, hardware keyboard and physical lifecycle behavior still require their appropriate runtimes; no emulator-to-physical equivalence is claimed.

## CI and evidence safety

### Verified evidence and remaining boundary — 2026-10-09

Working branch: `feature/workmode4-crossplatform-qa-infra-a1`. Last runtime-tested harness HEAD: `2d6a129f03cf0bc1b3def81b5565d44d72dc61b5`, TREE: `7a76b4c4586bea6e53e90602d013e4a359e91f19`. Reverified staging branch HEAD: `872601622880accb59448cc9eb0e6a59bafa2c5f`, TREE: `3272db9c10acfb4db3aa25663c2bf14a16a88d90`. The Android product files are identical between those branches. These are repository source identifiers; the live website's immutable deployment SHA remains unverified.

| Runtime | Accepted run / artifact | Outcome |
| --- | --- | --- |
| Web Chromium | `37840830014` / `11576734866` | Four authenticated screens + session reopen PASS; preserved |
| Web WebKit | `37840830014` / `11577686788` | Four authenticated screens + session reopen PASS; preserved |
| iOS Simulator | `37840830014` / `11578176667` | Four authenticated screens + session reopen PASS; preserved |
| Android Emulator | [37927968661](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/actions/runs/37927968661) / [11614858201](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/actions/runs/37927968661/artifacts/11614858201) | Actual UI login and four authenticated screens PASS; session restoration BLOCKED, job failure retained |

The older all-platform run's Android job was cancelled; its successful Web/iOS jobs above are accepted individually. No successful all-platform run is claimed. They were not rerun or changed for this Android-only investigation.

The final Android command ran from 12:12:05 to 12:13:57 UTC and exited with failure after bounded cleanup. Emulator boot, ADB, install, native launch, current-PID WebView attachment, trusted staging load and actual authorized-account UI login passed. Dashboard, Coach list, Notification Preferences and Profile have genuine full-device PNGs. Force-stop/start and fresh WebView attachment also passed; before any test navigation to Coach, the native startup Dashboard redirected to LOGIN. `SESSION_RESTORE_DASHBOARD_READY` timed out after 45 seconds with the document complete and the guest online. The harness did not seed cookies or log in again.

Artifact SHA-256: `1de50c6d6ad95207f9b73efbb1202488c8537066a63846e980c4159779e5b37d`. The downloaded archive matched GitHub's digest; all 13 exported files passed the scanner and all six PNGs were inspected, including `session-reopen-failure-android-emulator.png`. Its email/password inputs are empty; the dots are the existing password placeholder, not a populated field. Profile email is masked. The failure JSON is `runtime-start.json`, code `ANDROID_SESSION_RESTORE_DASHBOARD_READY_TIMEOUT`, with the failure PNG reference; there is no fabricated session-relaunch PASS. All records retain `productVerdict: NOT_ASSESSED`.

Validation: 24 Node contract tests, 3 Python tests, shell syntax, native unit/build and export checks passed. The Android authenticated job remains failed solely at the observed session-restoration boundary. Native/staging session restoration must be resolved by the product/auth owner and independently assessed by Work Mode 3 before this task can report **READY FOR CROSS-PLATFORM QA**. No six-direction synchronization run or final all-platform rerun was performed after this failure. The existing synchronization harness remains available; its relaunch checkpoint must preserve this actual result.

Android evidence expires on 2026-10-12; the preserved Web/iOS artifacts expire on 2026-10-11. Download through the approved GitHub access before expiry. Production/Main, staging allowlist, credentials and other workers' source changes were not modified.

Workflow: `.github/workflows/crossplatform-qa-infra.yml`. The reusable entry point `.github/workflows/crossplatform-qa-authenticated.yml` explicitly passes `authenticated=true` and `platform=all`, still using the existing protected `staging` environment. Its branch/path-restricted push trigger starts the authorized run when dispatch is unavailable; there is no alternative credential transport. Push triggers are restricted to the A1 branch and relevant infra paths; expensive jobs are scoped to changed platform/shared files. Manual dispatch can select one platform or all. Authenticated runs require the existing staging environment and its configured secrets. There is no PR/fork secret flow, pull_request_target trigger, write permission or deploy action. Obsolete runs of this workflow on this branch may be canceled to avoid cost; other workers' workflows are unaffected.

Artifacts expire after 3 days. Upload runs only when the export safety step succeeds. The safety step rejects symlinks, unknown file types, malformed PNGs, unexpected JSON fields, raw email, bearer/JWT strings and invalid runtime classifications. `.qa-artifacts` and `.qa-private` are ignored in Git. Only the approved test account is permitted; health fixtures must remain synthetic and minimal. Raw log files, APKs, xcresult, xctestrun, cookie/session storage and traces are not artifacts of this workflow.

## Validation commands

```bash
node --test qa/platform/*.test.cjs
python3 -m unittest discover -s qa/platform -p '*_test.py'
bash -n qa/platform/ios-run.sh
bash -n qa/platform/android-controls.sh
node qa/platform/verify-artifacts.cjs
(cd frontend && npm ci && npx tsc --noEmit && node --test tests/*.test.cjs && npm run build)
(cd backend && npm ci && npx prisma generate && npm test && npm run type-check && npm run lint && npm run build)
```

Backend tests need local dummy test environment settings; integration tests additionally need a dedicated PostgreSQL instance/migrations. Never aim integration tests at the live staging database. Full product regression, independent QA and missing credentials are separate from harness contract tests. The final report records actual results and unresolved dependencies; a green public login job does not imply all-platform authenticated readiness.
