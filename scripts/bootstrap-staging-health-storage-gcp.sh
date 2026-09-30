#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="project-a2e260c1-839d-4f1d-b90"
REGION="europe-west1"
HEALTH_STORAGE_BUCKET="project-a2e260c1-839d-4f1d-b90-diewish-health-staging"
RUNTIME_SERVICE_ACCOUNT="diewish-staging-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOY_SERVICE_ACCOUNT="diewish-staging-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command not found: $1" >&2
    exit 1
  }
}

require_command gcloud
require_command jq

ACTIVE_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n 1)"
if [[ -z "${ACTIVE_ACCOUNT}" ]]; then
  echo "No active gcloud account. Run: gcloud auth login" >&2
  exit 1
fi

echo "Diewish staging health-storage bootstrap"
echo "Project: ${PROJECT_ID}"
echo "Region : ${REGION}"
echo "Bucket : ${HEALTH_STORAGE_BUCKET}"
echo "Production resources are not targeted by this script."

bucket_uri="gs://${HEALTH_STORAGE_BUCKET}"

if ! gcloud storage buckets describe "${bucket_uri}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud storage buckets create "${bucket_uri}" \
    --project "${PROJECT_ID}" \
    --location "${REGION}" \
    --uniform-bucket-level-access \
    --public-access-prevention
fi

gcloud storage buckets update "${bucket_uri}" \
  --project "${PROJECT_ID}" \
  --uniform-bucket-level-access \
  --public-access-prevention

gcloud storage buckets add-iam-policy-binding "${bucket_uri}" \
  --project "${PROJECT_ID}" \
  --member "serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
  --role roles/storage.objectUser \
  --condition=None \
  --quiet >/dev/null

gcloud storage buckets add-iam-policy-binding "${bucket_uri}" \
  --project "${PROJECT_ID}" \
  --member "serviceAccount:${DEPLOY_SERVICE_ACCOUNT}" \
  --role roles/storage.bucketViewer \
  --condition=None \
  --quiet >/dev/null

bucket_json="$(gcloud storage buckets describe "${bucket_uri}" \
  --project "${PROJECT_ID}" \
  --format=json)"
bucket_location="$(jq -r '.location // empty' <<<"${bucket_json}")"
uniform_access="$(jq -r '.iamConfiguration.uniformBucketLevelAccess.enabled // false' <<<"${bucket_json}")"
public_access="$(jq -r '.iamConfiguration.publicAccessPrevention // empty' <<<"${bucket_json}")"

if [[ "${bucket_location,,}" != "${REGION,,}" ]]; then
  echo "Unexpected bucket location: ${bucket_location}" >&2
  exit 1
fi
if [[ "${uniform_access}" != "true" ]]; then
  echo "Uniform bucket-level access is not enabled." >&2
  exit 1
fi
if [[ "${public_access,,}" != "enforced" ]]; then
  echo "Public access prevention is not enforced." >&2
  exit 1
fi

policy_json="$(gcloud storage buckets get-iam-policy "${bucket_uri}" \
  --project "${PROJECT_ID}" \
  --format=json)"

jq -e --arg member "serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
  '.bindings[] | select(.role == "roles/storage.objectUser") | .members[] | select(. == $member)' \
  <<<"${policy_json}" >/dev/null

jq -e --arg member "serviceAccount:${DEPLOY_SERVICE_ACCOUNT}" \
  '.bindings[] | select(.role == "roles/storage.bucketViewer") | .members[] | select(. == $member)' \
  <<<"${policy_json}" >/dev/null

echo "Staging health-storage bootstrap verified successfully."
