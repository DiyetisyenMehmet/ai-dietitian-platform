# Neon Test 2 isolated acceptance — issue #88

## Status: BLOCKED, not a completed database setup

Source staging commit: `6729a834809698fabf5ab341b9f5d2c608e2094e`.
Source tree: `b0d832d28e8b84955757d6dc51be2be6b588d871`.

The existing repository contains **50 Prisma models and 50 migrations**.
No schema, migration, application authentication logic or serving environment
configuration is changed by this PR.

The authenticated Neon connector confirmed this exact target:

| Property                           | Confirmed value               |
| ---------------------------------- | ----------------------------- |
| Project                            | `misty-forest-09137357`       |
| Branch                             | `br-nameless-meadow-ba07cyg3` |
| Endpoint                           | `ep-sweet-glitter-bafgdm9p`   |
| Database                           | `diewish_staging_test2`       |
| Role                               | `diewish_staging_test2_owner` |
| PostgreSQL                         | `18.6 (653b019)`              |
| Existing public application tables | **0**                         |
| `_prisma_migrations`               | **Absent**                    |
| Compute limits                     | min/max **0.25 CU**           |

The actual repository `prisma migrate deploy` command was attempted once using
a private, direct Test 2 connection. It stopped with **P1001 before applying
any migration**. A separate local DNS check returned `EAI_AGAIN` / temporary
failure in name resolution for the exact endpoint. Connector SQL access and
native PostgreSQL access from the local application are different paths;
connector success does **not** prove backend connectivity.

**Applied migrations: 0. Created application tables: 0.** Registration, login,
session refresh and preference persistence against Test 2 are **NOT RUN** and
must not be marked PASS. No synthetic account has been created.

## Prepared execution path

Run from a private local or already authorized CI environment with direct
PostgreSQL network access. This is an operator command, not a deployment, and
does not create a paid service or a workflow. Do not add the connection file to
Git, CI logs, workflow inputs or artifacts. Its JSON object has one required
field, `DATABASE_URL`, whose value must come from the secure Test 2 credential
source. Keep it outside the repository with owner-only permissions.

```bash
cd backend
npm ci --ignore-scripts --no-audit --no-fund
CHECKPOINT_DISABLE=1 DO_NOT_TRACK=1 node node_modules/prisma/build/index.js generate
node --test scripts/test2-target.test.mjs
node --import tsx scripts/test2-acceptance.mjs \
  --connection-file /private/test2-connection.json --migrate
```

`--ignore-scripts` prevents third-party install telemetry. The initial normal
dependency installation was blocked by automatic security review because
Scarf's postinstall sends metadata externally. Installation without lifecycle
scripts and explicit Prisma client generation subsequently succeeded.

The connection must use the confirmed **direct** host
`ep-sweet-glitter-bafgdm9p.c-8.eu-central-1.aws.neon.tech`, database and owner
above, TLS `sslmode=require` or `verify-full`, and optional `schema=public`.
The pooled hostname is deliberately rejected for migrations. An existing
backend `.env` is rejected rather than overwritten. Ambient database, SMTP,
Firebase, AI, billing and cloud credentials are not inherited.

The runner:

1. Checks the exact endpoint/database/role before connecting, then verifies the
   actual database identity and PostgreSQL 18 through Prisma.
2. Rejects nonempty untracked databases, failed/divergent migration history and
   migration checksum changes. With `--migrate`, invokes only the repository's
   `prisma migrate deploy`; never reset, `db push`, or ad hoc schema SQL.
3. Verifies every migration checksum/completion, model table and scalar column,
   and validates foreign-key constraints. The current expected result is
   **50 model tables + 1 Prisma migration ledger**.
4. Starts the actual `createApp()` on an ephemeral **127.0.0.1** port. It does
   not import the application bootstrap, start schedulers or launch workers.
5. Uses the real HTTP routes for readiness, missing-session rejection,
   synthetic `.invalid` registration, local password login, authenticated
   identity, mascot preference write, session refresh, preference reread and
   logout. It independently reads the written user/preference through Prisma.
   No health data, Admin principal, external identity account, payment, AI call,
   e-mail or SMS is involved. External fetch calls are rejected; providers are
   not mocked into a fake success.
6. Keeps all restricted feature flags false, generates disposable local JWT
   signing secrets in memory, logs no tokens/passwords/connection URI, leaves
   synthetic rows in Test 2 for evidence (no delete or overwrite of existing
   rows), and closes HTTP/database connections in `finally`.

Omit `--migrate` only after the complete migration chain is installed; the
runner still verifies the schema before creating a fresh synthetic account.
Stop on any failure; do not mark a partial schema or a synthetic mock as a
successful end-to-end result.

## Verification performed for this PR

- Exact-target negative cases and isolated environment: **2 tests PASS**.
- Script syntax, targeted ESLint and formatting: **PASS**.
- Native Prisma migration command: **BLOCKED / P1001**.
- Test 2 schema installation and actual backend acceptance: **BLOCKED / NOT RUN**.
- Source migration files and Prisma schema: unchanged.

## Serving Web/Android boundary

This runner does not reconfigure `staging.diewish.com`, Cloud Run, Firebase,
SMTP, scheduler, Admin, old Neon staging (`shiny-hill-56015697`) or production
(`wild-dawn-63542383`). No queries were sent to those database projects.

For a separate local frontend, its existing `NEXT_PUBLIC_API_BASE_URL` must
point to an independently authorized loopback test backend, never the serving
staging API. This acceptance runner closes its ephemeral HTTP port on exit;
it is not a persistent Web/Android test environment. Connecting the existing
public Web/Android app still requires a separately approved runtime/release
decision and is **not completed** by this PR.

Remaining requirement for this task: a secure execution environment with
direct Test 2 PostgreSQL access, then successful migration and actual backend
acceptance. Do not solve this by changing the serving staging DATABASE_URL,
publishing secrets, enabling paid infrastructure or opening restricted features.
