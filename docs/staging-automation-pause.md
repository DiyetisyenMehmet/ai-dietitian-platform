# APP-STAGING-AUTOMATION-PAUSE-A1 — issue #77

Scope: `feature/staging-preview`, project `project-a2e260c1-839d-4f1d-b90`, europe-west1 only. No production/main, user deletion, schema change, frontend/native rewrite, new cloud service, or APK.

## Behavior

- `STAGING_AUTOMATION_ENABLED` defaults false and affects only explicitly identified staging. Existing production behavior is unchanged.
- Stops the in-process five-minute Coach scheduler, daily/weekly/monthly batch generation, direct notification dispatch, and external `/tick` before SQL or token-verifier network calls. No notification/preference/claim rows are altered by pausing.
- Stops the staging password-reset startup/30-second polling loop. No startup `SELECT 1` in paused staging. Explicit readiness and user actions still access the DB.
- Keeps Notification Center/inbox, preferences, read/all-read, user-initiated Coach chat/reviews/analyses, and SMS recovery routes. Their authentication, consent, account isolation and rate limits are retained.

## Password recovery separation

Public forgot-password routes keep the same generic response for known/unknown/excluded accounts and the shared cooldown. Both account classes await acceptance of a separate HTTPS request using the Cloud Run runtime Google-signed OIDC identity. SMTP starts after worker acceptance headers, so SMTP timing/errors do not expose account existence. Handoff failures return uniform global 503, never false acceptance.

The authenticated `/internal/scheduler/password-reset` route remains enabled independently of paused `/tick`. It streams an acceptance header/body and keeps its HTTP request active until delivery/bounded retries complete, rather than relying on post-response CPU or an unref timer. The existing durable metadata outbox, hashed one-time reset tokens, row lease, three-attempt limit, one-minute retry spacing and SMTP TLS policy are preserved. Work is scoped to the requesting account; concurrent workers cannot replace a fresh lease or retry from stale attempts. Successful delivery stops immediately. There is no periodic worker when users make no recovery requests.

Cloud Run termination/network interruption can still interrupt a bounded worker; metadata survives. A subsequent recovery request can retry the pending row after the existing lease/cooldown rules. No new paid queue/service is introduced. Real SMTP delivery and live account recovery require a working DB/provider and are not established by offline tests.

## Deployment and actual pause

Normal staging deployment now always writes `STAGING_AUTOMATION_ENABLED=false`; it never creates/resumes/force-runs the notification job. It verifies request-recovery configuration and pauses the existing job instead.

The scoped `Staging automation pause` workflow runs targeted tests on an isolated PostgreSQL 16 database with synthetic providers. Its cloud inspection is read-only. Only an explicit staging commit marker `[automation-pause]` authorizes the release job. It checks that current staging HEAD matches the requested source and `backend/prisma` is identical to the serving application SHA, then builds only backend, without DB credentials/migrations. It preserves other workers' environment variables, secrets, scaling, frontend and native app. This avoids treating a Neon quota failure as a reason to run migrations or modify suspend settings.

Before pausing, the guard checks exact staging project/ref/job/target/runtime identity, 100% serving revision, application SHA/build digest, disabled automation, preserved SMTP configuration and authenticated recovery route (401 for anonymous access). `/tick` must return 404. It pauses rather than deletes the actual job and reads back `PAUSED`. Any identity/source/schema/SMTP/config mismatch is BLOCKED before the scheduler mutation.

## Mobile reminders and remaining consumption

Already installed Android local schedules are independent of the server: `WellnessReminderScheduler` includes water/activity/sleep local reminders, and `NutritionReminderScheduler` holds meal reminders. `NutritionReminderBootReceiver` restores stored alarms after reboot. Cloud Scheduler pause does not cancel installed alarms or delivered system-tray notifications. No claim that every device has been silenced. No native preference, inbox, alarm or APK changes in this task.

Foreground user sessions may still load their inbox, preferences, Coach stream or readiness endpoint; those explicit sessions are outside the idle-server pause. This task does not reset an already exhausted monthly Neon quota or change its autosuspend timeout.

## Safe reactivation (separate approval + QA)

1. Review undelivered/expired notification backlog and retry states first. Do not blindly resume and release old messages in a burst, or bulk mark/delete historical records.
2. Validate consent/preferences, duplicate-send lease regression, current Coach slots, delivery provider and independent request recovery on the exact release SHA.
3. Review a small code/config change to permit `STAGING_AUTOMATION_ENABLED=true`; remove/adjust the deploy-enforced false only after approval. Review legacy recovery polling before restoring it.
4. Deliberately resume the verified staging job, then monitor first dispatch and quotas. Flipping a flag or making an ordinary deployment never resumes it automatically. Re-pause + false flag is the immediate rollback for automation; avoid rolling back to pre-separation recovery while the shared job is paused.

## Evidence

Local: four database-free automation/handoff checks; eight offline control-plane guard checks; TypeScript and touched-file lint. PostgreSQL/HTTP recovery, inbox/read/preference and manual Coach evidence is recorded in the PR/Actions runs. Actual Cloud Scheduler state is established only by the cloud guard readback, never by this source document alone.
