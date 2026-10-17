# Staging release and optional acceptance QA

`Staging Preview Deploy` keeps its existing staging-only deployment path and
release markers. A normal manual release now defaults to deploying and verifying
the frontend/backend **without** creating synthetic users, generating an AI
nutrition plan, or building an Android APK.

## Manual choices

Select `feature/staging-preview` when manually running the workflow. Both inputs
are booleans and default to `false`:

| `run_live_acceptance_tests` | `build_android_apk` | Operations after mandatory deployment verification |
| --- | --- | --- |
| false | false | Neither optional operation; both reported `NOT RUN` |
| true | false | Live Dashboard/Journey/notification/mascot/nutrition acceptance QA only |
| false | true | Staging-bound Android test APK only |
| true | true | Both, as independent jobs |

The live QA option creates synthetic staging accounts and an AI nutrition plan.
Select it only when that data creation and AI usage have been authorized. It
retains the existing nutrition-session checks: session loss fails the test;
there is no automatic recovery login to hide a failure.

The APK option retains the existing Firebase project/package identity and FCM
checks, unit tests, staging URL binding, checksum and artifact upload. It does
not distribute the APK. Android tooling and Firebase Android configuration
lookup run only when this option is selected.

These inputs control separate jobs within the same release run, not separate
deployments. Both optional jobs require successful mandatory deployment checks;
a failure in one optional job does not suppress the other. Optional failures
remain failed jobs and fail the overall workflow. The report distinguishes a
successful deployment from failed or unexecuted acceptance QA. These choices
do not add a QA-only redeploy/retry mechanism; obtain approval before rerunning
a release.

Push-triggered releases never enable either optional operation, including when
an existing release marker is present. The historical `[nutrition-staging-verify]`
path retains its existing pinned-image/runtime checks, but no longer implicitly
creates accounts or plans; it explicitly reports live acceptance QA `NOT RUN`.

## Mandatory controls retained

- Successful Hardening CI, Staging Config CI and Notification platform checks
  for the exact release SHA, before staging resource changes.
- Staging project/service/identity contracts and existing private storage,
  authentication, CORS, same-origin API and strict refresh-cookie configuration.
- The existing pre-release disabled-nutrition guard and remote staging HEAD check.
- The existing post-release guard: serving traffic, actual frontend/backend
  image digests, source SHA and explicit `NUTRITION_JOBS_ENABLED=false`.
- Absent or paused nutrition scheduler; the existing disabled flag also gates
  the new nutrition quota policy.
- Backend and frontend health, login/phone-auth availability, Firebase identity
  configuration and allowed OAuth origins. These basic checks remain mandatory;
  they do not claim authenticated Dashboard or nutrition acceptance coverage.
- Existing Coach P2, user preferences and product/session-management code are
  unchanged. This change does not enable any feature.

The final report runs even after failed or skipped dependencies. It maps actual
job results to `PASS`, `FAIL`, `CANCELLED` or `NOT RUN`. It lists an APK artifact
and verified Android FCM only when the APK job actually succeeds. An omitted test
is never labelled `PASS`.

## Offline validation and release boundary

Run `python3 scripts/staging-release-options.test.py` with `PyYAML==6.0.3`.
The tests parse workflow structure, simulate boolean job-gate decisions, check
embedded shell syntax, and execute only the local summary shell script against
temporary files and fixture environment variables. They do not invoke gcloud,
Playwright, Gradle, account registration or AI generation.

Also validate the modified workflow syntax with actionlint. The existing
Staging Config CI runs the regression tests on this preparation branch and on
staging. Its cloud permissions remain read-only; no APK or deployment workflow
is added to this branch's triggers.

This change requires a separately approved staging integration and release of
the resulting SHA. It cannot change the behavior of a historical workflow run
or deploy the previous approved SHA with new workflow options. Live release
execution and physical Android QA remain separate verification steps.
