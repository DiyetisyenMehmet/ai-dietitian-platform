#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="project-a2e260c1-839d-4f1d-b90"
DEPLOY_SA="diewish-staging-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command not found: $1" >&2
    exit 1
  }
}

require_command gcloud

echo "Configuring Diewish STAGING Cloud Scheduler control-plane access only."
echo "Project: ${PROJECT_ID}"
echo "Production resources are not targeted."

active_project="$(gcloud config get-value project 2>/dev/null || true)"
if [[ "$active_project" != "$PROJECT_ID" ]]; then
  gcloud config set project "$PROJECT_ID" >/dev/null
fi

gcloud services enable cloudscheduler.googleapis.com   --project "$PROJECT_ID"   --quiet

gcloud projects add-iam-policy-binding "$PROJECT_ID"   --member "serviceAccount:${DEPLOY_SA}"   --role roles/cloudscheduler.admin   --condition=None   --quiet >/dev/null

echo "Staging Cloud Scheduler API and deployer permission are ready."
echo "The staging deploy workflow will create/reconcile the notification scheduler job."
