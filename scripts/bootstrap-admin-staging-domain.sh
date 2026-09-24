#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="project-a2e260c1-839d-4f1d-b90"
REGION="europe-west1"
FRONTEND_SERVICE="diewish-frontend-staging"
ADMIN_DOMAIN="admin-staging.diewish.com"
BASE_DOMAIN="diewish.com"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command not found: $1" >&2
    exit 1
  }
}

require_command gcloud

active_account="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n 1)"
if [[ -z "$active_account" ]]; then
  echo "No active gcloud account. Run: gcloud auth login" >&2
  exit 1
fi

gcloud config set project "$PROJECT_ID" >/dev/null

service_url="$(gcloud run services describe "$FRONTEND_SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format='value(status.url)')"
if [[ -z "$service_url" ]]; then
  echo "Staging frontend service could not be resolved." >&2
  exit 1
fi

verified_domains="$(gcloud domains list-user-verified --format='value(id)' || true)"
if ! grep -Fxq "$BASE_DOMAIN" <<<"$verified_domains"; then
  cat >&2 <<EOF
$BASE_DOMAIN is not verified for the active Google account.
Verify only the base domain in Google Search Console, then re-run this script:
  gcloud domains verify $BASE_DOMAIN
No production resource was changed.
EOF
  exit 2
fi

if ! gcloud beta run domain-mappings describe \
  --domain "$ADMIN_DOMAIN" \
  --project "$PROJECT_ID" \
  --region "$REGION" >/dev/null 2>&1; then
  gcloud beta run domain-mappings create \
    --service "$FRONTEND_SERVICE" \
    --domain "$ADMIN_DOMAIN" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --platform managed \
    --quiet
fi

cat <<EOF
Diewish staging Admin domain mapping is configured in Cloud Run.
- Domain: https://$ADMIN_DOMAIN
- Service: $FRONTEND_SERVICE
- Current service URL: $service_url

Add the following DNS records at the authoritative DNS provider for diewish.com:
EOF

gcloud beta run domain-mappings describe \
  --domain "$ADMIN_DOMAIN" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format='yaml(status.resourceRecords,status.conditions)'

cat <<EOF

This script never edits DNS, production Cloud Run, production databases, or production admin resources.
After DNS propagates and TLS is ready, verify:
  https://$ADMIN_DOMAIN/admin
EOF
