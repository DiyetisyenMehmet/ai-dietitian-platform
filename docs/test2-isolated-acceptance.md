# Neon Test 2 isolated acceptance — issue #88

## COMPLETE / PASS

The existing Diewish backend was verified against **only Neon Test 2**.
This is isolated database/backend acceptance, not a Web/Android deployment.

| Evidence                                   | Verified result                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Staging source                             | `6729a834809698fabf5ab341b9f5d2c608e2094e`                                                        |
| Staging tree                               | `b0d832d28e8b84955757d6dc51be2be6b588d871`                                                        |
| Immutable tested application/runner source | `2a3083f6c71c148a56ceabed5432a367de5029cc`                                                        |
| Workflow revision used                     | `25dc9249ef9cd57a912d950c68223943df518eb3`                                                        |
| Successful run                             | [39500472923](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/actions/runs/39500472923) |
| Acceptance job                             | `118896420642` — success                                                                          |
| Network job                                | `118896378824` — success                                                                          |
| Completed                                  | 21 October 2026, 00:27:59 Europe/Istanbul                                                         |
| Project / branch                           | `misty-forest-09137357` / `br-nameless-meadow-ba07cyg3`                                           |
| Database / endpoint                        | `diewish_staging_test2` / `ep-sweet-glitter-bafgdm9p`                                             |
| PostgreSQL                                 | 18.6                                                                                              |
| Migration ledger                           | **50 finished, 0 unsuccessful**                                                                   |
| Prisma model tables / scalar columns       | **50/50 tables, 514/514 columns present**                                                         |
| Total public tables                        | **61**: 50 model + 10 migration helper + `_prisma_migrations`                                     |
| Foreign keys                               | **55, 0 invalid**                                                                                 |

## Minimal runner corrections

The original equality `total tables == model tables + 1` incorrectly rejected
legitimate helper tables created by existing migrations. The runner now
requires the ledger and every expected model table while keeping migration
checksum, scalar-column and foreign-key checks. No table was removed.

The actual test also exposed an incorrect runner URL: `/api/auth/refresh`.
It now uses the application's existing `/api/auth/refresh-token` route and
checks rejection of the logged-out cookie. Application authentication policy,
schema and all 50 migration files remain unchanged. The workflow's immutable
checkout was updated to the reviewed runner commit before manual retriggering.

## Real backend acceptance

The actual Express `createApp()`, Prisma and real Test 2 storage passed:

- Database readiness and rejection of an unauthenticated identity request.
- Synthetic `.invalid` registration, e-mail/password login and authenticated
  `GET /api/auth/me`.
- Non-health mascot preference write.
- Cookie-authenticated session refresh.
- Preference reread using the refreshed access token.
- Independent Prisma user/preference readback, usable bcrypt password and
  `authVersion=0` integrity.
- Logout and rejection of the logged-out refresh cookie.

No identity/authentication/database provider was mocked into a fake success.

A separate Neon connector **read-only query**, bounded to the successful job's
time window, independently confirmed one new synthetic normal user, one
expected preference record, one token rotation and three revoked refresh
records. Evidence returned no password, hash, credential, cookie or token.
Synthetic rows from both attempts were retained; existing rows were not
deleted or overwritten.

Initial installation succeeded in run
[39499068028](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/actions/runs/39499068028).
The final run used the same `prisma migrate deploy` against the completed
ledger. Every finished migration checksum matched repository source; no
reset, db push, hand-built migration ledger or ad hoc schema change was used.

## Secure execution and preserved environments

GitHub's existing runner resolved the local DNS/P1001 restriction: exact Test 2
DNS, TCP/5432 and certificate-verified PostgreSQL TLS passed. Only the dedicated
encrypted `NEON_TEST2_DATABASE_URL` secret was supplied, in a private ephemeral
file after dependency installation without lifecycle scripts. Cleanup passed.

The owner-requested PR #89 label path preserves main: no push, schedule,
synchronize or privileged pull_request_target starts acceptance. Code checkout
is immutable; permissions remain contents:read; credentials are not persisted.
The retained workflow_dispatch mode requires confirmation and default-branch
registration before use. Existing deployment/security workflows are untouched.

The application listened only on loopback, closed its connections, and never
started bootstrap schedulers/workers. Restricted identity, phone/SMS, Coach,
nutrition and scheduler flags were checked false. No external identity,
payment, AI, health data, e-mail, SMS or notification delivery was used.

No database queries were sent to old staging `shiny-hill-56015697` or
production `wild-dawn-63542383`. GitHub main, serving staging Cloud Run, Admin,
billing and schedulers were not changed. No merge, deployment, APK or paid
resource was created. The Test 2 compute is suspended after verification.

## Web/Android release boundary

The public Web/Android staging application **has not been connected to Test 2**.
A persistent isolated runtime and any serving URL change still require an
explicitly authorized runtime/release decision. The completed result here is
real isolated Diewish backend/database acceptance.
