# Diewish Staging Preview

This environment exists only to test current `fix/production-hardening` builds on real Android devices without pointing debug APKs at production services or production data.

## Isolation guarantees

- Google Cloud project: `project-a2e260c1-839d-4f1d-b90`
- Region: `europe-west1`
- Cloud Run backend service: `diewish-backend-staging`
- Cloud Run frontend service: `diewish-frontend-staging`
- Artifact Registry repository: `diewish-staging`
- Runtime identity: `diewish-staging-runtime@project-a2e260c1-839d-4f1d-b90.iam.gserviceaccount.com`
- Database: separate Neon project `Diewish Staging` (`shiny-hill-56015697`)
- Database name: `diewish_staging`
- No production database branch/copy is used.
- Debug APKs require an explicit staging web URL and do not silently default to production.
- Production deployment is not part of this workflow.

## Why the database is a separate project

Diewish can contain health and nutrition data. A Neon branch of the production project would copy production data into staging. For scanner testing that is unnecessary and increases privacy risk, so staging uses a clean project with no production rows.

## One-time Google Cloud bootstrap

Required APIs:

- Cloud Run Admin API
- Cloud Build API
- Artifact Registry API
- Secret Manager API
- Vertex AI API
- IAM Credentials API
- Security Token Service API

Create the Docker Artifact Registry repository `diewish-staging` in `europe-west1`.

Create the runtime service account:

```bash
PROJECT_ID=project-a2e260c1-839d-4f1d-b90

gcloud iam service-accounts create diewish-staging-runtime \
  --project "$PROJECT_ID" \
  --display-name "Diewish staging runtime"
```

Grant only the runtime permissions required by the scanner path:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:diewish-staging-runtime@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role roles/aiplatform.user
```

Grant Secret Manager access only to the four staging secrets below, not to every project secret.

## Secret Manager contract

Create these staging-only secrets:

- `diewish-staging-database-url`
- `diewish-staging-jwt-access`
- `diewish-staging-jwt-refresh`
- `diewish-staging-usda-fdc-api-key`

`diewish-staging-database-url` must contain the connection string for the clean Neon project `shiny-hill-56015697`. Keep that connection string out of GitHub, source files and chat messages.

The runtime service account needs `roles/secretmanager.secretAccessor` only on these staging secrets.

## GitHub OIDC deployment identity

The deploy workflow intentionally does not accept a long-lived Google service-account JSON key. Configure GitHub -> Google Cloud Workload Identity Federation and a deployment service account.

The GitHub deployment identity needs enough permission to:

- submit Cloud Build jobs,
- push images to `diewish-staging`,
- deploy/update only the two `*-staging` Cloud Run services,
- act as `diewish-staging-runtime`,
- read staging secret metadata during the preflight step.

Do not grant production database credentials to the deployment identity.

Create a GitHub Actions environment named `staging` and add only these non-secret variables:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_DEPLOY_SERVICE_ACCOUNT`

The project ID and region are fixed in the workflow to prevent accidentally targeting another project/region. No database password, JWT secret, USDA key or Google private key belongs in GitHub variables.

## Controlled deployment trigger

`.github/workflows/staging-preview.yml` listens to `feature/staging-preview`, but the deploy job is skipped for ordinary pushes.

A deployment runs only when either:

- the workflow is manually dispatched where GitHub permits it, or
- the HEAD commit message contains the literal marker `[deploy-staging]`.

This allows the staging branch to remain outside `main` while still giving us an explicit deployment gate. Never use `[deploy-staging]` in ordinary development commits.

## Deployment sequence

The workflow performs:

1. OIDC authentication to Google Cloud.
2. Preflight checks for staging-only Artifact Registry, runtime service account and Secret Manager entries.
3. Build backend image from the exact Git SHA.
4. Deploy `diewish-backend-staging` using the staging runtime identity.
5. Run Prisma migrations automatically on the clean staging database through the backend container startup command.
6. Resolve the backend Cloud Run URL.
7. Build the Next.js frontend with that exact staging API URL baked into `NEXT_PUBLIC_API_BASE_URL`.
8. Deploy `diewish-frontend-staging`.
9. Restrict backend CORS and `APP_WEB_URL` to the resolved staging frontend URL.
10. Verify `/api/health` and the frontend `/register` page.
11. Build an Android debug APK with `DIEWISH_WEB_BASE_URL` set to the resolved staging frontend URL.
12. Upload the APK and a manifest containing the exact Git SHA and staging service URLs.

## AI and nutrition providers

The staging backend uses:

- `AI_PROVIDER=vertex`
- `VERTEX_AI_LOCATION=global`
- `VERTEX_AI_MODEL=gemini-3.5-flash`
- Cloud Run service identity for Vertex authentication
- USDA FoodData Central API key from Secret Manager
- Open Food Facts without a provider secret

No AI credentials are embedded in the frontend or Android APK.

## Refresh-cookie note

The default Cloud Run `run.app` frontend and backend hosts are different origins. Staging sets `REFRESH_COOKIE_SAME_SITE=none` with a Secure HttpOnly refresh cookie. A production custom-domain setup should prefer stable Diewish-owned web/API hostnames and retain the stricter release WebView cookie policy.

## Promotion rule

A successful staging test does not deploy production. Production promotion remains a separate explicit operation after:

- exact-SHA Hardening CI is green,
- staging health checks pass,
- real Android CameraX photo capture passes,
- real ML Kit barcode scanning passes,
- Vertex/Gemini food recognition succeeds for food and non-food images,
- USDA/Open Food Facts lookup and deterministic nutrient calculation are verified,
- safe-area behavior is checked on the target Android device.
