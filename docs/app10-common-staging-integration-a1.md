# APP10 common staging integration A1

Source baseline: staging HEAD `12c15074c71c6bc3c84fc7a32b02eaa71f4f32c7`, TREE `b48efe9fbcf229858dfd959a2c6de3304937ee66` (2026-10-18 UTC).

## Preserved source history

Real merges in this order: #49 → #58 → #54 → #55 → #57 → #59 → #50 → #63 → foundation bridge `72c1c668b07edc14195d53fb036f23caead6ec21` → #64 → #65 → #62. All source heads and the bridge are ancestors; copied bridge content is reconciled rather than regenerated. No preview preparation script was run.

| PR | HEAD | TREE |
|---|---|---|
| #49 | `e5291d66b8537bcc24f3dc3053869e9883b14bb6` | `472de5957a7962a76540d9ab470c1fec62911c3b` |
| #58 | `905fb8c30f01a4219270c072ce6b5a86b6495c47` | `d45f4e16ba6283eb7c661b33857bba9fafb6b135` |
| #54 | `8cde82a67214339d754040f6dcf498b86b2d2d10` | `9a66c6493e5c7990a7230706506e90cb193056bc` |
| #55 | `c347ce18248e09f925c54db6a0fe054b8bbe0714` | `e54faf951b08634b2455c867ba2fbbe699e699a4` |
| #57 | `1b5be3aaa6e2864ee24a5bf24e12ddce2b8abcef` | `83cc8543a28933a351d98f1c4c2c25e2e775bcf6` |
| #59 | `a960577a51b8abdd75040018af6d220202879400` | `2c602a1bd62f6193a0ea0c1e4592eca4d0645936` |
| #50 | `b69d4425c16364a4d774da23b5ce94d438858944` | `a8e00902b189dc0067d8c6aa7a4ab81b72897ca9` |
| #63 | `68d09e2e4f1bf6667d08d40c22dfc06a87a3c8f9` | `9432c625e088085aa0d5d8a20212d1f978ea910f` |
| #64 | `5d101eb6ca3dc4a3759624e7889a3f8d0d19814c` | `ef226eb2aac5c0545b7d1e4271c785ef40b8b0e6` |
| #65 | `45311aca626b706b078efc49b5880cf117c72e05` | `48287ed2974128305934c1d8d0ca2d1f2bfcbe46` |
| #62 | `ee614d4bb4d767cbe4b8f6fd48af3f00b03ab82b` | `452fedb3deec7a79acd7c19ab9d5ed9ae4a46db8` |

## Resolutions and security

Resolved conflicts in backend/package.json, backend/prisma/schema.prisma, backend/src/modules/account/account.repository.ts, backend/src/modules/auth/auth.repository.ts, backend/src/modules/identity/external-login.service.ts, frontend/src/presentation/components/auth/route-guard.tsx, frontend/src/infrastructure/identity/firebase-browser.ts and frontend/playwright.phone-recaptcha.config.ts.

The final account repository, SMS recovery service, external login service, safe Google service and schema are byte-identical to accepted #65. This retains #58 row locking, expected passwordHash/authVersion guards, version increment, refresh revocation and 72 UTF-8 byte bound; #54 usable-password provenance; #64 outer-transaction composition; #59 Admin isolation; and #49 actual-provider check against old Firebase-password bypass. No approved security behavior was redesigned.

The shared Firebase helper retains #50 native Google exchange and Web popup plus #63 memoryOnly argument four, cancellation argument five, fail-closed persistence and owned widget cleanup. #65 registration uses separate playwright.phone-password-recaptcha.config.ts; the legacy config keeps #63's lifecycle suite. Its workflow and documentation point to the new config. #62 backend/Web/Android bridge contract is carried together without building an APK.

## Validation and limitations

- Backend: Prisma client generation, type-check and build PASS. No database connection/migration used.
- Frontend: type-check and production build PASS; existing unrelated lint warnings remain.
- Database-free merged-module boundary tests: 6 PASS (expected credential state, outer transaction failure propagation, email-reset provenance/version, stale access denial, actual-provider/Admin isolation, shared bcrypt byte bound).
- Selected frontend boundaries: Google exchange/cancellation/Web popup 3 PASS; phone memory-only/signature/cancellation 9 PASS; notification cutoff/account switch/Android reconciliation 3 PASS. Total local targeted tests: 21 PASS.
- Both separate browser configurations list their intended suites (6 legacy and 14 registration cases); selected runtime browser cases run in the scoped PR workflow. Local browser download was unavailable. The first CI attempt exposed the legacy fixture missing #57's public phone-password/status response; the fixture now explicitly returns enabled=false without changing application behavior. See the PR checks for the final result.
- No conflict markers or source-code whitespace errors. Inherited Markdown hard-break spaces are retained. All 11 PR heads and bridge ancestry verified.
- No broad 281-test rerun. The inherited password-recovery and identity-foundation jobs skip only this integration head, avoiding their automatic database migrations/broad reruns. A dedicated contents-read-only workflow runs only selected database-free boundaries and synthetic-browser fixtures. Other PRs retain their existing checks.
- PostgreSQL race/rollback and migration execution are NOT re-proven on the combined tree. A disposable database migration test requires a separate manager permission; none was executed.

## Migration and rollout gates

The five unchanged migrations must remain in this order:

1. 20261017120000_user_password_recovery
2. 20261017123000_account_identity_foundation
3. 20261017140000_safe_account_linking
4. 20261017210000_phone_password_registration
5. 20261018093000_phone_sms_recovery

Their SHA-256 checksums match accepted sources. Prior read-only staging evidence showed all five pending and no incomplete migration; do not infer that the live schema was changed by this task. Before an authorized rollout, recheck migration history, checksums, schema drift, restore readiness and direct database deployment wiring. Use the existing migration-deploy path, not db push/reset.

ACCOUNT_SAFE_LINKING_ENABLED, PHONE_PASSWORD_AUTH_ENABLED and PHONE_SMS_RECOVERY_ENABLED remain false in env parsing defaults and the example. Runtime flag values are not claimed verified. Existing email reset and native Google fixes are not controlled by these three flags.

SMTP and scheduler operational access remain BLOCKED from the accepted previous report, without retrying failed access. Before rollout, an authorized operator must confirm SMTP VAR/YOK without reading secret values, validate scheduler/OIDC invocation and durable delivery drain, and approve one owned synthetic user/mailbox acceptance. No real email/SMS or account mutation occurred here.

Manager approval is still required for merge, any disposable migration test and the single coordinated backend/Web staging deployment. Deploy/migration/flag activation/APK/production/Admin operations are outside this task. Draft status is intentional; operational acceptance remains blocked until the above gates are closed.
