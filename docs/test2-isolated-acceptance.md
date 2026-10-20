# Neon Test 2 isolated acceptance — issue #88

## Status: BLOCKED — dedicated GitHub Test 2 credential missing

Source staging commit: `6729a834809698fabf5ab341b9f5d2c608e2094e`.
Source tree: `b0d832d28e8b84955757d6dc51be2be6b588d871`.

The existing repository contains **50 Prisma models and 50 migrations**.
No schema, migration, application authentication logic or serving environment
configuration is changed. A dedicated, owner-requested Test 2 CI workflow is
added; existing deployment/security workflows remain unchanged.

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

## GitHub runner network path: PASS

The repository owner's manual `test2-network-check` label on PR #89 triggered
the isolated workflow without any database secret:

https://github.com/DiyetisyenMehmet/ai-dietitian-platform/actions/runs/39494879167

Job `118877221120` confirmed **DNS, TCP/5432 and certificate-verified PostgreSQL
TLS PASS** on GitHub's `ubuntu-latest` runner. Database authentication was
deliberately **NOT ATTEMPTED**; the database acceptance job was **SKIPPED** and
is not a PASS. The target compute remained idle after the network probe.

GitHub Settings was inspected read-only: there are no repository secrets and
no dedicated Test 2 environment secret. Existing staging QA credentials were
not used or read. **The remaining blocker is NEON_TEST2_DATABASE_URL.**

The repository's default branch is `main`, whose only workflow is
`main-hardening-ci.yml` without `workflow_dispatch`. GitHub's documented manual
dispatch registration therefore cannot launch a new branch-only workflow.
The safe, demonstrated entry point instead uses an owner-applied PR label:

- `test2-network-check`: network only, no secrets, no application checkout.
- `test2-acceptance`: network must succeed, then install/generate the existing
  application and run migration/backend acceptance with the dedicated secret.

No `push`, schedule, PR synchronization or `pull_request_target` can start this
workflow. It accepts only the repository owner and PR #89 from the exact same
repository/work branch targeting staging. Acceptance checks out immutable,
already inspected source **05b4b5e25957c204c346c1cd548dc9a9bf490ce6**, never an
arbitrary PR merge/head. Permissions are `contents: read`; only the dedicated
Test 2 secret is referenced, at the credential-writing step after dependency
installation. No Cloud Run, Google identity, staging secrets or artifacts are
used. The encrypted credential is written to a private ephemeral runner file
and removed in an `always()` cleanup step. Public-repository standard runners
are reused; no paid server/service is provisioned.

### One required secure panel operation

In repository **Settings → Secrets and variables → Actions → New repository
secret**, save the **direct/unpooled Test 2 database connection** under
`NEON_TEST2_DATABASE_URL`. Use only the exact Test 2 database/owner/host above,
with TLS enabled. Do not send the URI or password in chat, a PR, a comment or a
workflow input. Existing staging/production secrets must not be substituted.

After this single credential operation, the worker can manually request
`test2-acceptance` on this existing PR, monitor the real migration/backend run,
verify the synthetic rows independently through the Neon connector, and
suspend only the Test 2 compute afterward. No merge or deployment is required.

Neon's official HTTP/serverless query path was also assessed. It does not
remove the direct connection required by this repository's Prisma migration
CLI. Replaying SQL while manufacturing `_prisma_migrations` records would not
prove the approved chain ran; that workaround is not used.

References:

- https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- https://neon.com/docs/guides/prisma

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
- Native local Prisma migration command: **BLOCKED / P1001**.
- Actual GitHub Test 2 DNS/TCP/certificate-verified TLS probe: **PASS**.
- CI YAML, owner/PR/manual-event boundaries, secret-free network job,
  immutable acceptance checkout and scoped-secret/cleanup checks: **PASS**.
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

Remaining requirement for this task: the dedicated Test 2 secret in GitHub,
then successful migration and actual backend acceptance on the verified
runner. Do not solve this by changing the serving staging DATABASE_URL,
publishing secrets, enabling paid infrastructure or opening restricted features.
