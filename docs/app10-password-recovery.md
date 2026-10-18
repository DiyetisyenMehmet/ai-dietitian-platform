# APP10-PASSWORD-RESET-RECOVERY-FIX-A1

Base staging commit: `de3bbc689d8e5f8b6bdfa74e93f6ba6877fb79b5`  
Base tree: `bd2003432e1fc7d817a8d3122d67c1390043fc88`

## Root cause and implementation

The UI POSTed to missing `/api/auth/forgot-password` and `/api/auth/reset-password` routes and sent `password` where the existing account API expects `newPassword`. Both new paths now delegate to the existing normal account service; the older `/api/account/password/forgot` and `/reset` aliases share rate limits and cooldowns. There is one recovery implementation.

The normal application uses bcrypt `users.passwordHash`. Firebase authenticates social/phone identities; Admin uses a separate Firebase password system. Normal recovery updates the actual local password, never the Admin identity. External-login exchange now checks the sign-in provider on the exact Firebase-verified token: a Firebase password token cannot be accepted just because Google is also linked to that identity. Google/Apple/phone sign-in remains available. Admin provider and invitation/reset handlers are unchanged.

Recovery is restricted to active USER accounts with deliverable addresses and no deletion request. Completion rechecks these conditions under a per-user database lock. Only SHA-256 token hashes are stored. Expiry and unused status are rechecked atomically after password hashing, so concurrent reset requests succeed at most once. All other outstanding reset links are invalidated on completion. A password equivalent to the current bcrypt password is rejected; reset passwords are limited to 72 UTF-8 bytes to avoid bcrypt truncation ambiguity.

The reset transaction changes the password, increments the user's authentication version, revokes refresh tokens and completes pending delivery. Existing user access tokens immediately fail the version check. Login, identity-session creation and refresh rotation serialize against reset on the same user row, preventing an in-flight old-password login or refresh from leaving a valid successor. Unversioned existing access tokens remain compatible until that user's first reset.

## Email delivery and honest responses

The existing `lib/mailer.ts` previously logged messages instead of sending them. It now supports authenticated SMTP with mandatory TLS, certificate verification, bounded connection timeouts, disabled protocol logging, and sanitized errors. No paid provider is created. Existing organization SMTP credentials must be configured through runtime secrets:

- `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_SECURE` (465 uses true)
- `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` (single bare email address)
- `APP_WEB_URL` must use the intended frontend origin and HTTPS outside local development.

Missing configuration returns the same safe 503 before any account lookup, for known and unknown accounts alike. Configured requests acknowledge acceptance, never assert inbox delivery. Recipient-specific SMTP failures happen outside the public response and emit only constant error codes.

A small durable delivery table stores user IDs and lease/retry metadata, never addresses, plaintext passwords, or raw links. There is a shared per-IP forgot limit of at most 5 requests per configured window; reset has an independent limit of at most 10. A database cooldown limits each eligible account to one request per 10 minutes across instances and aliases. A leased dispatcher attempts at most two pending jobs per step, with at most three attempts separated by at least one minute and a one-hour queue lifetime. Failed attempts invalidate the generated link. Only the latest issued link is usable.

The public handler starts an opportunistic drain after acknowledging acceptance. The existing authenticated Cloud Scheduler `/tick` also awaits a bounded drain, so correctness does not rely on timers running after Cloud Run suspends idle CPU. Startup and a 30-second timer accelerate delivery on continuously running hosts. Preserve the existing scheduler authentication; no new public worker or IAM permission is introduced. Before release, verify that the existing authenticated scheduler is enabled and ticking. Delivery may wait until its next tick on an idle request-billed instance. Inspect exhausted/aged pending rows and constant failure codes operationally; no secrets need to be logged.

Links use `/reset-password#token=...`, keeping the bearer credential out of HTTP access logs. The reset page captures it in memory, removes it from the URL, and has no-referrer/no-store headers. Legacy query links remain accepted and are immediately scrubbed; newly emitted links always use fragments.

## Validation and release boundary

Tests cover actual encrypted SMTP submission to a local synthetic server, recipient failure, certificate rejection, HTTP request/reset contracts, persisted hash, new-password login, old-password rejection, immediate access/refresh invalidation, reused/expired/invalid/wrong-purpose links, Admin/inactive isolation, concurrent reset, stale login rejection, Firebase password bypass rejection, preserved Google login, shared alias rate limits and delivery retry metadata. Browser tests cover fragment handling, request contract, submission disabling, invalid-link errors and honest request copy.

The dedicated `Password recovery checks` workflow uses an isolated PostgreSQL 16 service and browser tests. It has read-only repository permissions and does not deploy or build Android. Local database checks can use PGlite but do not substitute for PostgreSQL concurrency validation.

Real staging SMTP configuration and inbox delivery have not been accessed or verified. A synthetic end-to-end staging mailbox check is required after separately approved integration/deployment: receive link, reset, sign in with new password, reject old password and reuse. Do not mark live delivery PASS based only on synthetic SMTP or mocked delivery tests.

Production/main, Admin password/invitation behavior, deployment and APK generation are outside this change. Integration, migration on shared environments and release remain the manager's decision.
