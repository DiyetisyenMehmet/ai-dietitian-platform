# Coach P2 — existing manager preparation review

Reporter: Uygulama Çalışan 6
Task: APP6-COACH-EVENT-DRIVEN-SYNC-P2-FINAL-CLOSE
State: PARTIAL; review files prepared, no mutation approved or executed.

The user verified `SIR_SURUM_EKLEME=VAR`, `GECIS_SIRRI_OKUMA=VAR` and `SONUC=MEVCUT_HESAP_YOLU_UYGUN`. Use that existing human manager identity. Do not grant IAM roles to the deployment/build accounts or create a new cloud identity/secret resource.

## Prepared files

- `scripts/coach-sync-manager-prepare-review.py`: reads only serving-service and secret-version metadata. It outputs an allowlisted rollback revision/version record. It never reads a secret value, modifies a role or service, adds a secret version or opens Coach. Actual Cloud Run metadata-read rights are independently checked by the read itself; the previous two permission results do not imply all Cloud Run rights.
- `docs/coach-p2-restricted-role-review.sql`: proposed restricted database role and ordinary application DML permissions, in a guarded transaction. It contains no password and stays NOLOGIN. This file is for review and must not be executed under the current instruction to create no new permission.

## Two prerequisites that prevent an immediate secret write

1. Read-only catalog inspection still found only `diewish_staging_owner`; no suitable restricted app role exists. A future restricted role reduces the backend's current privileged DB access, but creating it and assigning table privileges are nevertheless database authorization changes. They require an explicit decision under the current no-new-permission instruction. This is separate from cloud IAM; no cloud IAM expansion is proposed.
2. The current deploy definition binds `DATABASE_URL` to `diewish-staging-database-url:latest`. Cloud Run resolves environment secrets at instance startup. Adding a new version can therefore alter the next cold start without a code deploy. Do not add a placeholder URL, disabled-after-creation version or owner credential as a shortcut. First pin the serving backend to its verified old numeric secret version. That configuration update creates a Cloud Run revision, so it is also deferred under the current no-staging-publication instruction.

The metadata helper can confirm the actual serving binding and capture its numeric version without changing anything. Unknown permissions, split traffic, a changed secret reference, a non-staging identity or an already enabled live channel fail closed.

## Minimal human workflow after the required decision

No additional user action is needed merely to review these files. If desired, the manager can run the metadata helper once in the already authenticated Cloud Shell to capture the current rollback identifiers. These identifiers are not credentials.

After an explicit preparation/activation decision, the intended human action is one controlled Cloud Shell operation: verify the current state, pin the old version, create the approved restricted role, generate a credential only in memory, validate the direct PostgreSQL session and add its URL directly to the existing secret. The deployment/build accounts get no extra rights. No URL/password/token goes into chat, arguments, source, test artifacts or logs.

An executable mutation operation is intentionally not issued yet: two underlying changes are not authorized by the current instruction. The reviewed SQL shows exactly what the database step would change; the old-version pin must preserve the current image and disabled Coach flag. Live enablement and the targeted acceptance test remain a separate manager decision.

## Preserved boundaries

- No existing user/message/health row is updated or deleted by the proposed role SQL.
- No consent, API ownership filtering, administrative RBAC or RLS policy is changed. The SQL does assign DB DML privileges to the proposed replacement backend principal; this assignment is disclosed and awaits approval.
- The privileged migration secret stays outside the live listener.
- Both eventual normal and listener connections must match the existing host/database/runtime-user check, with a direct listener endpoint.
- No production resource, current runtime configuration, actual secret version, role, password or live flag was changed during this preparation.
- The two previous synthetic accounts are untouched and do not block this review.

The prior temporary Cloud Build writer suggestion is not selected. The existing manager path is now preferred; an old expiration example does not authorize any action.
