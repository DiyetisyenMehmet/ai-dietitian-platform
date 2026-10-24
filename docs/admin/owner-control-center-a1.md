# ADMIN3 Owner Control Center / System Health A1

Extends the existing AdminShell, Admin auth, permission registry and audit API.
No new role, permission, migration, provider mutation or deployment is introduced.

## Runtime and data boundaries

- `GET /api/admin/system/health`: existing authentication + ADMIN + `system.read`.
- `GET /api/admin/operations/summary`: existing authentication + ADMIN + `operations.read`.
- Both retain the existing non-production environment gate and Admin rate limiter.
- Permission resolution remains fresh for every request, including cached results.
- Responses are `Cache-Control: no-store`; snapshots are process-local (15s health,
  30s operations) with shared in-flight work. Errors never carry raw DB/provider data.
- SELECT 1 and the single User group-by use transaction-local 1500ms statement
  limits, 1500ms acquisition and 2500ms transaction budgets. No health tables,
  user identifiers, user content, raw environment, URL or credential is selected.

This is **Admin runtime** telemetry. In a split deployment the Admin backend and
normal application backend/database can differ. The UI explicitly labels this
scope and does not infer normal-app/Test2 service health from Admin success.

Frontend and external-service availability are unknown until independently
monitored. Auth reports the authenticated request plus Firebase configuration
presence, not a successful live provider probe. Scheduler reports the existing
staging pause policy when applicable; last-run/cloud scheduler state is unknown.
Unknown components prevent an all-green overall status. No scheduler is invoked.

Operations counts normal USER rows by isActive and stored subscriptionTier in
one aggregate. Active means account enabled, not recently seen. Stored tier is
not the effective provider/support entitlement. Effective subscriptions remain
explicitly unavailable; this initial aggregate foundation is partial by design.

Recent events reuse `/admin/audit?limit=5` under `audit.read`; the dashboard shows
only action/module/risk/time. Full audit remains at `/admin/audit`. Existing
account security, users, staff, roles and entitlement operations are preserved.
Quick actions only navigate to existing authorized pages.

## Verification

- New service unit tests cover status precedence and safe configuration output.
- New real HTTP/Prisma integration suite covers SUPER_ADMIN, independent system
  and operations grants, 401/403, permission revocation despite cache, inactive
  sessions, role downgrade, explicit response shape and sanitized DB failures.
- New presentation suite covers both pages at 390/412/768/1440, both themes,
  keyboard drawer/focus, sticky header, overflow, no unauthorized data requests,
  independent loading/errors/retry, partial health and empty audit.
- Existing shell/users/user operations/subscription/entitlement browser suites
  are included. One shell selector is scoped to navigation because the new
  requested quick action also links to audit; the logout assertions are unchanged.
- `Admin Owner Center CI` runs standard backend lint/type/build/unit/integration
  on disposable PostgreSQL, frontend lint/type/build and the browser suites.
  It has contents:read, no deployment credentials, no Android job and no release.

Run frontend checks via its existing `npm run lint` (Next source lint), then
`npm run type-check`, `npm run build`, and
`E2E_WEB_BASE_URL=http://127.0.0.1:3042 npx playwright test --config playwright.admin-owner.config.ts`.
The browser executable can be supplied through ADMIN_BROWSER_EXECUTABLE.

Integration and coordinated release require separate manager approval. This
change does not merge or deploy itself and does not enable Coach or automation.
