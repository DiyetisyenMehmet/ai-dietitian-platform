# #90 — Admin-isolated Test 2 routing (PREPARED, NOT DEPLOYED)

## Decision gate

**NO-GO for live traffic until this draft, the fresh control-plane snapshot and the exact revision acceptance evidence are reviewed.** This PR does not deploy, merge staging, change secrets/IAM/domains/traffic or touch a database. The general `staging-preview.yml` must not be used for this cutover.

Base: staging `6729a834809698fabf5ab341b9f5d2c608e2094e`, tree `b0d832d28e8b84955757d6dc51be2be6b588d871`. Open #91/#87/#89 work is not incorporated or overwritten.

## Exact route contract

| Incoming HTTP Host | Every `/api` and `/api/*` destination | DB |
| --- | --- | --- |
| `admin-staging.diewish.com` | `https://admin-legacy---diewish-backend-staging-2qqqfr7wzq-ew.a.run.app` | Original revision and old secret; `diewish_staging` |
| `staging.diewish.com` | `https://diewish-test2---diewish-backend-staging-2qqqfr7wzq-ew.a.run.app` | New compatible revision; separate Test 2 secret; `diewish_staging_test2` |
| Any other Host, including a canonical frontend URL | Reject 421 while isolated routing is enabled | No backend request |

These tag URLs are **required proposed values, not existing verified resources**. Preflight must prove Cloud Run returns precisely these URLs for the intended revisions. If Cloud Run produces different URLs, STOP and review the allowlist; do not substitute a service URL or random traffic split. Both tags belong to the **existing** backend service. No new service/domain is needed by the proposed design.

Only the HTTP Host header selects a target. `x-forwarded-host`/`Forwarded` cannot select it. The middleware replaces forwarded authority/protocol, removes override headers, and preserves the existing client-IP chain, Cookie, Authorization, query, method and body. Mismatched/null Origin is rejected; absent Origin for SSR/native calls still uses verified Host and the backend's unchanged authorization. Missing/swapped/invalid targets fail closed, without falling back to the old build-time rewrite or another database. The ordinary rewrite and existing behavior remain unchanged with the new routing flag absent/`false`.

The runtime settings are server-only:

```
DIEWISH_STAGING_HOST_ROUTING_ENABLED=true
DIEWISH_STAGING_ADMIN_API_ORIGIN=https://admin-legacy---diewish-backend-staging-2qqqfr7wzq-ew.a.run.app
DIEWISH_STAGING_USER_API_ORIGIN=https://diewish-test2---diewish-backend-staging-2qqqfr7wzq-ew.a.run.app
```

Frontend must be built with `NEXT_PUBLIC_API_BASE_URL=/api`. Its build-time `DIEWISH_API_PROXY_TARGET` is bypassed by enabled middleware for all API requests. This is tested against an intentionally unreachable fallback. Do not enable the flag on the currently serving old frontend image: it lacks this router. A reviewed new frontend image/revision is required even though domain and browser API URLs remain unchanged.

## Admin, session and SSR inventory

- `frontend/src/infrastructure/admin/admin-client.ts` uses the shared API client for login, invitation, password forgot/verify/reset, users, roles, audit and session actions.
- `frontend/src/app/admin/login/page.tsx` also calls ordinary `authClient.logout()`. `application/auth/auth-store.ts` refreshes through ordinary `/api/auth/refresh-token`; these must stay on the old backend for Admin.
- No Admin UI/session client code, RBAC, identity provider, database records, invitations or password behavior is changed. Existing Admin host page redirects remain; authority passed to SSR is sanitized. Admin login/reset pages are served in the built-server test.
- Existing refresh cookies have no Domain attribute and `/api/auth` path (`backend/src/modules/auth/auth.controller.ts`). Router does not rewrite Set-Cookie or cookie paths. Both host cookies stay first-party. Existing sessions are not bulk-cleared. Old normal-user sessions may need a fresh login in Test 2; no cross-DB user/session migration is promised.
- Android debug WebView remains on `https://staging.diewish.com`; no APK, package ID, Firebase or native bridge change. Existing native Google/Firebase callbacks remain unchanged; real provider/email collision and device acceptance remain live gates, not local-test claims.

## Proposed change list — after a separate GO decision only

1. Capture fresh backend/frontend serving revisions, exact image digests, percentages/tags, scaling, runtime identities and numeric secret reference versions using the **read-only** preflight. Retain the artifact. Abort on drift from the reviewed baseline.
2. Preserve the immutable old backend revision and all original secret versions. Add only `admin-legacy` tag pointing to that exact revision; retain existing backend service traffic at 100% old revision. A tag is an additional deterministic URL, not percentage-based DB selection. No old env/secret rewrite.
3. Provide a separate `diewish-staging-test2-database-url` Secret Manager secret containing only the approved Test 2 connection. Never access/log old secret payloads. Verify the existing runtime identity's effective accessor permission; if new IAM permission is necessary, stop for approval. Pin a numerical version. The readonly reader never transfers/creates a secret or grants access.
4. Build the reviewed current backend source, compare its Prisma schema/migration hashes to the previously accepted Test 2 schema, and create an explicit **no-traffic** revision on `diewish-backend-staging`, tagged `diewish-test2`. Command must be application start only (no Prisma deploy on startup), replacing only the new revision's DB references and explicitly keeping restricted features and background automation OFF. Preserve CPU/memory/max instances; require revision min instances 0 to avoid warming a second revision. No service creation, old DB migration, health storage policy, Firebase, SMTP or Scheduler changes.
5. New backend must NOT silently reuse the old direct DB reference. Both DATABASE_URL and DIRECT_DATABASE_URL must point to dedicated Test 2 secret references. No plaintext DB env. Verify identity-provider callback/reset origins and CORS exactly match unchanged normal staging domain. Verify tagged URL/image/source, Test 2 readiness and synthetic auth/readback; no health/payment/AI/mail/SMS calls.
6. Build a new frontend revision with `/api` and the router. First keep **no traffic**, then test its exact candidate revision with real HTTP Host preservation (Cloud Run authority must be proven, not inferred from forwarded headers). Canonical URL API requests deliberately reject; do not weaken this check to make QA pass. Validate with an approved no-traffic host/authority test mechanism or abort.
7. After the explicit traffic GO and fresh guards, route 100% frontend traffic to the reviewed new frontend revision (both custom domains remain on the same frontend service). Keep backend service traffic 100% old; normal traffic reaches only the tagged Test 2 revision through the router. Do not split frontend/backend DB traffic randomly. No DNS/SSL/domain mapping modification.
8. Verify real Web/Android, actual Admin routing, cookies/CORS/5xx, unchanged origins, paused schedulers and disabled flags. Admin functionality may still fail with old Neon HTTP 402; routing to old DB is not Admin login PASS.

These are review instructions, **not an executable deployment workflow**. No live mutator is included in this PR. Deployment commands must be derived from the reviewed fresh snapshot rather than guessing revision IDs or secret versions.

## Rollback and quota limits

Before changing frontend traffic, save its exact old revision, plus the old backend revision and DB secret/version refs. Both immutable revisions must still exist and be Ready. Proposed routing rollback (not executed):

```
gcloud run services update-traffic diewish-frontend-staging --project project-a2e260c1-839d-4f1d-b90 --region europe-west1 --to-revisions ORIGINAL_FRONTEND_REVISION=100
```

Replace the placeholder with the fresh, approved snapshot value. Backend traffic and old secrets remain untouched throughout. Verify original frontend/backend image digests and 100% traffic again. Do not delete Test 2 data, secrets or revisions during rollback. Test 2 registrations are not copied back. **Old Neon quota HTTP 402 means restoration of routing/configuration is not restoration of working login/read-write. Functional rollback is BLOCKED until that quota issue is resolved or its limitation is explicitly accepted by the manager.**

## Cost / operational gates

No new paid resource or live configuration is created by this PR. Two active backend revisions may increase concurrency/instance billing even in one existing service; preserving per-revision max is not proof of an unchanged aggregate maximum. Require actual service-level max, min=0, existing budget and reviewed cap before GO. No precise price difference is claimed without that metadata. Stop if a new service, permission/policy expansion or unapproved cost increase is required.

The metadata workflow only runs on an explicit owner-applied `test2-routing-readonly` label on this exact same-repository branch, using a reviewed immutable checkout for cloud reads. Ordinary PR tests receive no cloud OIDC permission. Reader emits allowlisted public configuration and secret references only; no secret payload, database query, cloud logs, scheduler invoke/pause/resume or traffic write. Read failures stay BLOCKED. Full control-plane access/identity policy validation is not inferred from an old successful deploy.

## Evidence and limitations

- Local: 9 route/security tests, 1 built Next HTTPS transport test (both host targets, 28 POST endpoint cases, original bodies/authorization/cookies, Set-Cookie/clear-cookie, 401/503 propagation, no cross-DB fallback, spoofed host/origin negatives, Admin login/reset rendering); 2 preflight reader tests; frontend type-check and build PASS. Fixtures are synthetic HTTPS endpoints, **not actual Admin login or new deployed Test 2 acceptance**.
- Already accepted actual Test 2 DB/backend evidence (not repeated): [run 39500472923](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/actions/runs/39500472923), 50 migrations / 61 tables, real backend register/login/me/refresh/preferences/logout/readback PASS. PR #89 remains separate and unmerged.
- Live snapshot and new PR CI: pending. Old recorded backend `diewish-backend-staging-00479-w44` source `d7ced3598a41db3bd1fb76320e0149e25b3ac0ed` at 100%, scheduler PAUSED; frontend old record `00239-gm2` is historical, not a freshly verified rollback target.
- New tagged Test 2 revision/secret, real host-preservation acceptance, shared Firebase collisions, real reset mail delivery, real Android device and live functional rollback: NOT VERIFIED / NO-GO. No real mail/SMS or automated Coach/notification run is authorized here.
