#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="project-a2e260c1-839d-4f1d-b90"
PROJECT_NUMBER="730419163638"
REGION="europe-west1"
REPOSITORY="diewish-staging"
RUNTIME_SA_NAME="diewish-staging-runtime"
DEPLOY_SA_NAME="diewish-staging-deployer"
POOL_ID="github-actions"
PROVIDER_ID="diewish-staging"
GITHUB_REPOSITORY="DiyetisyenMehmet/ai-dietitian-platform"
GITHUB_REPOSITORY_ID="1295514788"
GITHUB_REPOSITORY_OWNER_ID="301813832"
STAGING_REF="refs/heads/feature/staging-preview"

RUNTIME_SA="${RUNTIME_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOY_SA="${DEPLOY_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command not found: $1" >&2
    exit 1
  }
}

require_command gcloud
require_command openssl

echo "Diewish staging bootstrap"
echo "Project: ${PROJECT_ID}"
echo "Region : ${REGION}"
echo "GitHub: ${GITHUB_REPOSITORY} (${GITHUB_REPOSITORY_ID})"
echo "Production Cloud Run services are not modified by this script."
echo

ACTIVE_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n 1)"
if [[ -z "${ACTIVE_ACCOUNT}" ]]; then
  echo "No active gcloud account. Run: gcloud auth login" >&2
  exit 1
fi

gcloud config set project "${PROJECT_ID}" >/dev/null

# The database URL is the only bootstrap secret that cannot be safely generated.
# Supply it through STAGING_DATABASE_URL or paste it into the hidden prompt.
if [[ -z "${STAGING_DATABASE_URL:-}" ]]; then
  read -r -s -p "Paste the Diewish Staging Neon DATABASE_URL: " STAGING_DATABASE_URL
  echo
fi
if [[ "${STAGING_DATABASE_URL}" != postgresql://* ]]; then
  echo "STAGING_DATABASE_URL must be a PostgreSQL connection string." >&2
  exit 1
fi

# Prisma Migrate should use Neon's direct endpoint, while the running service may
# use the pooled endpoint. If a pooled URL is supplied, derive the equivalent
# direct host by removing Neon's -pooler hostname suffix.
DIRECT_DATABASE_URL="${STAGING_DATABASE_URL/-pooler/}"

JWT_ACCESS_SECRET="$(openssl rand -hex 48)"
JWT_REFRESH_SECRET="$(openssl rand -hex 48)"

SERVICES=(
  run.googleapis.com
  cloudbuild.googleapis.com
  artifactregistry.googleapis.com
  secretmanager.googleapis.com
  aiplatform.googleapis.com
  iamcredentials.googleapis.com
  sts.googleapis.com
)

echo "Enabling required Google Cloud APIs..."
gcloud services enable "${SERVICES[@]}" --project "${PROJECT_ID}" --quiet

if ! gcloud artifacts repositories describe "${REPOSITORY}" \
  --project "${PROJECT_ID}" --location "${REGION}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${REPOSITORY}" \
    --project "${PROJECT_ID}" \
    --location "${REGION}" \
    --repository-format docker \
    --description "Diewish isolated staging images" \
    --quiet
fi

ensure_service_account() {
  local name="$1"
  local display="$2"
  local email="${name}@${PROJECT_ID}.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "${email}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud iam service-accounts create "${name}" \
      --project "${PROJECT_ID}" \
      --display-name "${display}" \
      --quiet
  fi
}

ensure_service_account "${RUNTIME_SA_NAME}" "Diewish staging runtime"
ensure_service_account "${DEPLOY_SA_NAME}" "Diewish staging GitHub deployer"

echo "Configuring least-privilege runtime access..."
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member "serviceAccount:${RUNTIME_SA}" \
  --role roles/aiplatform.user \
  --quiet >/dev/null

ensure_secret() {
  local name="$1"
  local value="$2"
  local runtime_access="${3:-true}"
  if ! gcloud secrets describe "${name}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud secrets create "${name}" \
      --project "${PROJECT_ID}" \
      --replication-policy automatic \
      --quiet
  fi
  printf '%s' "${value}" | gcloud secrets versions add "${name}" \
    --project "${PROJECT_ID}" \
    --data-file=- \
    --quiet >/dev/null
  if [[ "${runtime_access}" == "true" ]]; then
    gcloud secrets add-iam-policy-binding "${name}" \
      --project "${PROJECT_ID}" \
      --member "serviceAccount:${RUNTIME_SA}" \
      --role roles/secretmanager.secretAccessor \
      --quiet >/dev/null
  fi
}

ensure_secret "diewish-staging-database-url" "${STAGING_DATABASE_URL}" true
ensure_secret "diewish-staging-direct-database-url" "${DIRECT_DATABASE_URL}" false
ensure_secret "diewish-staging-jwt-access" "${JWT_ACCESS_SECRET}" true
ensure_secret "diewish-staging-jwt-refresh" "${JWT_REFRESH_SECRET}" true

unset STAGING_DATABASE_URL DIRECT_DATABASE_URL JWT_ACCESS_SECRET JWT_REFRESH_SECRET

echo "Configuring GitHub OIDC federation..."
if ! gcloud iam workload-identity-pools describe "${POOL_ID}" \
  --project "${PROJECT_ID}" --location global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "${POOL_ID}" \
    --project "${PROJECT_ID}" \
    --location global \
    --display-name "GitHub Actions" \
    --quiet
fi

if ! gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" \
  --project "${PROJECT_ID}" \
  --location global \
  --workload-identity-pool "${POOL_ID}" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
    --project "${PROJECT_ID}" \
    --location global \
    --workload-identity-pool "${POOL_ID}" \
    --display-name "Diewish staging GitHub" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref" \
    --attribute-condition "assertion.repository_id=='${GITHUB_REPOSITORY_ID}' && assertion.repository_owner_id=='${GITHUB_REPOSITORY_OWNER_ID}' && assertion.ref=='${STAGING_REF}'" \
    --quiet
fi

# Bind service-account impersonation to the immutable repository ID, not the
# mutable owner/repository name. The provider itself additionally checks the
# immutable owner ID and exact staging branch ref.
PRINCIPAL_SET="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository_id/${GITHUB_REPOSITORY_ID}"
gcloud iam service-accounts add-iam-policy-binding "${DEPLOY_SA}" \
  --project "${PROJECT_ID}" \
  --member "${PRINCIPAL_SET}" \
  --role roles/iam.workloadIdentityUser \
  --quiet >/dev/null

for role in \
  roles/run.admin \
  roles/cloudbuild.builds.editor \
  roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member "serviceAccount:${DEPLOY_SA}" \
    --role "${role}" \
    --quiet >/dev/null
done

gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA}" \
  --project "${PROJECT_ID}" \
  --member "serviceAccount:${DEPLOY_SA}" \
  --role roles/iam.serviceAccountUser \
  --quiet >/dev/null

# The deployer can validate staging secret metadata without reading payloads.
for secret in \
  diewish-staging-database-url \
  diewish-staging-direct-database-url \
  diewish-staging-jwt-access \
  diewish-staging-jwt-refresh; do
  gcloud secrets add-iam-policy-binding "${secret}" \
    --project "${PROJECT_ID}" \
    --member "serviceAccount:${DEPLOY_SA}" \
    --role roles/secretmanager.viewer \
    --quiet >/dev/null
done

# Cloud Build's execution identity pushes images and alone receives access to the
# direct migration URL. The running service never receives this secret.
BUILD_SA="$(gcloud builds get-default-service-account --project "${PROJECT_ID}" 2>/dev/null || true)"
if [[ -z "${BUILD_SA}" ]]; then
  echo "Could not resolve the Cloud Build default service account." >&2
  exit 1
fi

gcloud artifacts repositories add-iam-policy-binding "${REPOSITORY}" \
  --project "${PROJECT_ID}" \
  --location "${REGION}" \
  --member "serviceAccount:${BUILD_SA}" \
  --role roles/artifactregistry.writer \
  --quiet >/dev/null

gcloud secrets add-iam-policy-binding "diewish-staging-direct-database-url" \
  --project "${PROJECT_ID}" \
  --member "serviceAccount:${BUILD_SA}" \
  --role roles/secretmanager.secretAccessor \
  --quiet >/dev/null

cat <<EOF

Bootstrap complete.

GitHub OIDC provider:
${WIF_PROVIDER}

Deployment service account:
${DEPLOY_SA}

Next: push a reviewed commit to feature/staging-preview whose message contains
[deploy-staging]. The workflow will migrate the clean staging database once,
build isolated Cloud Run services, and produce a staging-bound APK. No
production service or production database is targeted.
EOF
