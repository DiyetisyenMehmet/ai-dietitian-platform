# APP6 Coach P2 — staging secret activation decision

Reporter: Uygulama Çalışan 6
Task: APP6-COACH-EVENT-DRIVEN-SYNC-P2-FINAL-CLOSE
State: BLOCKED pending one narrowly scoped administrator operation.

## Verified evidence

- Staging application: `d24e9232ef32a70fc43f14add8ae6263a35961b9`.
- Source at review: `911eea604f872402e846e1872cd8a848433109ba`.
- Hardening CI on that source: success, run `38248455369`.
- Real OIDC/Cloud Build preflight: run `38248454218`.
- Existing Cloud Build execution identity: `730419163638-compute@developer.gserviceaccount.com`.
- That identity can access the existing migration secret. The runtime-secret add-version permission is missing (probe exit 22).
- The serving backend has `COACH_SYNC_ENABLED=false`, no listener URL, 1 vCPU, 1 GiB, concurrency 40 and timeout 170 seconds.
- `20261011220000_coach_sync_revision` is applied.
- Only `diewish_staging_owner` currently exists among the intended application roles. It has CREATEDB, CREATEROLE, REPLICATION and BYPASSRLS; it must not be mounted as the new live listener credential.

The preflight reads no secret payloads or user records. It is a capability diagnostic, not a replacement for actual IAM enforcement when the eventual write is attempted.

## Why a new secret version is necessary

The limited application role needs its own credential and a direct URL. Changing a credential is a new immutable Secret Manager version, not an in-place edit of the existing payload. Adding that version requires `secretmanager.versions.add`.

Changing only a pooler hostname would preserve the privileged owner identity. The existing direct migration secret is privileged and intentionally belongs only to the migration path. Neither is an acceptable shortcut for the live listener.

The current payload has not been printed or assumed to be pooled. The decision is based on the verified absence of a suitable restricted role and the code's direct-connection/account checks.

## Minimal safe arrangement

Reuse the existing `diewish-staging-database-url` secret resource. A new version can hold the restricted application's direct URL. Bind both `DATABASE_URL` and `COACH_SYNC_DATABASE_URL` to the **same numeric version**. This satisfies the existing same-host/database/user guard without creating another secret resource or changing application authentication.

The migration secret `diewish-staging-direct-database-url` remains separate and unchanged. The migration owner is never mounted as the listener.

Proposed database role: `diewish_staging_app`.

- LOGIN only with a securely generated credential; initially prepare it as NOLOGIN until its password is ready.
- NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS, NOINHERIT.
- No membership in the owner or Neon administrative roles; no ownership of schemas/tables.
- CONNECT to `diewish_staging`, USAGE on `public`.
- Only normal application SELECT/INSERT/UPDATE/DELETE on the current application tables; exclude `_prisma_migrations`.
- Sequence USAGE/SELECT only if required by existing table defaults.
- No schema/database CREATE, TRUNCATE, trigger-management or GRANT OPTION.
- Verify effective privileges, including PUBLIC and role memberships, before recording its secret.
- No RLS, consent, user isolation, administrative RBAC or health-data policy changes. The same backend runtime identity keeps the existing API checks; only its database credential becomes less privileged.
- Future migrations must explicitly preserve these ordinary application privileges for new application tables without granting schema/role administration.

Actual role creation, password generation and secret writing have **not** been executed. Credentials must be generated and transferred only inside the authorized build, never in GitHub source, shell arguments, logs, URLs, artifacts or chat.

## Alternatives and recommendation

1. **Recommended for this automated closure:** temporary `roles/secretmanager.secretVersionAdder` on the one existing runtime secret for the already authorized Cloud Build execution identity. No new payload-read permission, IAM administration, secret deletion, project-wide grant or logging access is needed.
2. **No added automation IAM grant:** an authorized administrator can perform the prepared credential/version write directly using their existing rights. This is safe but makes that write a manual administrator step. Thus a permission grant to Cloud Build is not intrinsically mandatory; an authorized version write is.
3. A custom IAM role containing only `secretmanager.versions.add` is technically narrower than the predefined role, which also includes rotation/metadata permissions. It adds custom-role creation and management and does not avoid the administrator decision. A secret-scoped, expiring predefined writer is the simpler bounded choice here.
4. Reusing the owner credential is rejected. A distinct read-only listener role is incompatible with the current same-username guard and would require a new code/security design; it is outside this closure.

## The one requested administrator operation

### Current decision: check the existing manager first

Before adding any IAM binding, run `scripts/coach-sync-manager-check.py` in the existing manager's Google Cloud Shell with the isolated staging project selected. It tests only the ability to add a runtime-secret version and access the already existing migration secret. It does not read either payload, grant permissions, generate a password, change a role or enable Coach.

The current workspace has no signed-in human Google Cloud manager credentials. The automated-account preflight does not establish the human manager's permissions. A positive manager check permits preparing the direct-write path, subject to actual API enforcement and a separate activation decision. A negative/unknown result is never treated as authorized.

If the existing manager has both capabilities, they can perform one controlled credential preparation/version write in Cloud Shell under their current identity after the pinned-rollback and restricted-role checks. No Cloud Build writer binding is needed. Credentials must remain within that session and go directly to Secret Manager; they must never be copied into chat or a public artifact. The existing OIDC deploy identity can perform the previously authorized runtime configuration steps after the manager decision.

The temporary binding below is an unexecuted fallback, not the current instruction. Its example deadline is still **12 October 2026, 18:00 Europe/Istanbul**; the time condition is valid only before that deadline and conveys no access until a binding is actually approved and applied.

Approve and apply an **expiring binding on this secret only**:

```bash
gcloud secrets add-iam-policy-binding diewish-staging-database-url \
  --project=project-a2e260c1-839d-4f1d-b90 \
  --member='serviceAccount:730419163638-compute@developer.gserviceaccount.com' \
  --role=roles/secretmanager.secretVersionAdder \
  --condition="expression=request.time < timestamp('2026-10-12T15:00:00Z'),title=coach-p2-one-time-20261012,description=Temporary staging runtime credential preparation"
```

This example expires at **18:00 Europe/Istanbul on 12 October 2026**. If applied later, an administrator must deliberately choose a new short future deadline. Never set an expiration on the secret itself. The IAM access condition expires; the secret and all rollback versions remain intact.

This command has **not** been run. Neither the deployer nor the build is allowed to grant itself the missing permission. Permanent version-writing authority is unnecessary for normal LISTEN/NOTIFY or conversation queries.

## Activation and rollback checkpoints after permission is supplied

1. Recheck current branch, serving revision, migration, endpoint/database and effective database-role privileges. Preserve other workers' changes.
2. Resolve and record the current numeric runtime-secret version and serving backend revision as rollback metadata, without reading/logging the payload. Pin the serving backend to that old numeric version **before** adding a new `latest` version so cold starts cannot change credentials prematurely.
3. Prepare and verify the restricted role with the existing migration execution path. Generate its password in memory; verify a new authenticated database session, inability to administer roles/schema and ordinary application access. Do not read real health records as a permission test.
4. Add the direct URL as a new version of the existing runtime secret. Retain old versions; no user-data deletion or migration reversal.
5. Test PostgreSQL LISTEN/NOTIFY over separate authenticated sessions/processes using metadata-only synthetic events. Verify canonical-history and account isolation through existing owner-scoped APIs.
6. Update only the staging backend configuration, keep its currently serving application image, and bind both database variables to the new numeric version. Enable `COACH_SYNC_ENABLED=true`; retain an immediately selectable old revision.
7. Perform one targeted live acceptance: zero idle list/detail polling, Chromium/WebKit delivery, six browser-profile directions, interruption/resume, session/account isolation, canonical recovery and rollback behavior. Real Android/iPhone evidence stays separate from browser-profile evidence. Existing broad successful suites are not manually repeated.
8. On activation failure, route traffic back to the recorded old revision using the old pinned secret version. The old image has the disabled live flag and the preserved P1 mechanism. Saved conversations remain authoritative. Do not delete users or reverse the revision migration.
9. Before closure, ensure future existing staging deploys retain the live secret binding and do not reintroduce a privileged runtime credential or remove the listener URL while leaving the live flag on.

The new credential must not be published until the old serving revision is pinned for rollback. A failed or uncertain secret write must be investigated through version metadata; do not blindly rotate or delete a role already in use.

## Resource and cost boundary

No broker, paid service or new secret resource is required. The existing Secret Manager may bill one additional retained active version (standard automatic-replication list price approximately USD 0.06/month before its free allowance). Disabled versions also remain billable; do not destroy a rollback version merely to avoid that charge. IAM management operations themselves are free.

Live streams use one HTTP request/client and one PostgreSQL listener per subscribing backend process. The existing code caps 20 live streams/process and six/account/process. Real CPU/memory, load and Cloud Run/Neon incremental billing remain acceptance measurements; no per-user cost or scalability guarantee is claimed.

The two old synthetic test accounts do not block activation. They remain untouched; any deletion requires a separate identity/record impact review and explicit approval.
