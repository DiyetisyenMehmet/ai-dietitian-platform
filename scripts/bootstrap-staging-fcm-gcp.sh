#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="project-a2e260c1-839d-4f1d-b90"
RUNTIME_SA="diewish-staging-runtime@${PROJECT_ID}.iam.gserviceaccount.com"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command not found: $1" >&2
    exit 1
  }
}

require_command gcloud

active_project="$(gcloud config get-value project 2>/dev/null || true)"
if [[ "$active_project" != "$PROJECT_ID" ]]; then
  gcloud config set project "$PROJECT_ID" >/dev/null
fi

echo "Configuring Diewish STAGING FCM runtime access only."
echo "Project: $PROJECT_ID"
echo "Runtime: $RUNTIME_SA"
echo "Production is not targeted."

gcloud services enable fcm.googleapis.com   --project "$PROJECT_ID"   --quiet

gcloud projects add-iam-policy-binding "$PROJECT_ID"   --member "serviceAccount:$RUNTIME_SA"   --role roles/firebasecloudmessaging.admin   --condition=None   --quiet >/dev/null

echo "Staging FCM runtime permission configured."
echo "Granted role: roles/firebasecloudmessaging.admin"
echo "Required send permission: cloudmessaging.messages.create"
