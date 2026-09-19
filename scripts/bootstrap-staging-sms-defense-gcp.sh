#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-project-a2e260c1-839d-4f1d-b90}"
PROJECT_NUMBER="${PROJECT_NUMBER:-730419163638}"
EXPECTED_PROJECT_ID="project-a2e260c1-839d-4f1d-b90"
EXPECTED_PROJECT_NUMBER="730419163638"
MODE="${DIEWISH_SMS_DEFENSE_MODE:-AUDIT}"
START_SCORE="${DIEWISH_SMS_DEFENSE_START_SCORE:-0.8}"
CONFIRM_PROJECT_SMS_DEFENSE="${DIEWISH_SMS_DEFENSE_PROJECT_TOGGLE_CONFIRMED:-false}"

if [[ "$PROJECT_ID" != "$EXPECTED_PROJECT_ID" || "$PROJECT_NUMBER" != "$EXPECTED_PROJECT_NUMBER" ]]; then
  echo "Refusing to modify any project other than isolated Diewish staging." >&2
  exit 1
fi
if [[ "$MODE" != "AUDIT" ]]; then
  echo "Initial SMS Defense rollout must remain AUDIT." >&2
  exit 1
fi
if [[ "$START_SCORE" != "0.8" ]]; then
  echo "Initial SMS Defense threshold must remain 0.8." >&2
  exit 1
fi

for command_name in gcloud curl jq; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required command not found: $command_name" >&2
    exit 1
  }
done

active_project="$(gcloud config get-value project 2>/dev/null || true)"
if [[ "$active_project" != "$PROJECT_ID" ]]; then
  echo "Active gcloud project must be exactly $PROJECT_ID (current: ${active_project:-unset})." >&2
  exit 1
fi

echo "Diewish staging SMS Defense bootstrap"
echo "- project: $PROJECT_ID"
echo "- mode: $MODE"
echo "- threshold: $START_SCORE"
echo "- production: untouched"

echo "Creating/verifying Identity Platform service identity..."
gcloud beta services identity create   --service=identitytoolkit.googleapis.com   --project="$PROJECT_ID" >/dev/null

IDENTITY_SERVICE_AGENT="service-${PROJECT_NUMBER}@gcp-sa-identitytoolkit.iam.gserviceaccount.com"

echo "Granting Identity Platform service-agent role to its service identity..."
gcloud projects add-iam-policy-binding "$PROJECT_ID"   --member="serviceAccount:${IDENTITY_SERVICE_AGENT}"   --role="roles/identitytoolkit.serviceAgent"   --condition=None   --quiet >/dev/null

echo "Enabling reCAPTCHA Enterprise API in staging..."
gcloud services enable recaptchaenterprise.googleapis.com   --project="$PROJECT_ID"   --quiet

service_state="$(gcloud services list   --enabled   --project="$PROJECT_ID"   --filter='config.name=recaptchaenterprise.googleapis.com'   --format='value(config.name)')"
if [[ "$service_state" != "recaptchaenterprise.googleapis.com" ]]; then
  echo "reCAPTCHA Enterprise API did not become enabled." >&2
  exit 1
fi

if [[ "$CONFIRM_PROJECT_SMS_DEFENSE" != "true" ]]; then
  cat >&2 <<'EOF'

ADMIN CHECKPOINT REQUIRED — no Identity Platform reCAPTCHA config was changed yet.

Google's documented setup requires enabling the project-level SMS Defense toggle:
Google Cloud Console -> reCAPTCHA -> Settings -> SMS defense -> Configure -> Enable -> Save

Confirm that the selected project is:
project-a2e260c1-839d-4f1d-b90

Then rerun exactly:
DIEWISH_SMS_DEFENSE_PROJECT_TOGGLE_CONFIRMED=true bash scripts/bootstrap-staging-sms-defense-gcp.sh

This checkpoint is intentional: the public reCAPTCHA API/CLI does not expose the
documented project-level SMS Defense toggle, so the script will not guess or call
an undocumented endpoint.
EOF
  exit 3
fi

access_token() {
  gcloud auth print-access-token
}

config_file="$(mktemp)"
trap 'rm -f "$config_file" "$config_file.next" "$patch_file"' EXIT
curl -sS --fail   -H "Authorization: Bearer $(access_token)"   -H "x-goog-user-project: $PROJECT_ID"   "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config"   > "$config_file"

phone_enabled="$(jq -r '.signIn.phoneNumber.enabled // false' "$config_file")"
tr_only="$(jq -r '(.smsRegionConfig.allowlistOnly.allowedRegions // []) | sort == ["TR"]' "$config_file")"
domain_authorized="$(jq -r '(.authorizedDomains // []) | index("staging.diewish.com") != null' "$config_file")"

if [[ "$phone_enabled" != "true" || "$tr_only" != "true" || "$domain_authorized" != "true" ]]; then
  echo "Refusing SMS Defense update: staging auth safety contract is not intact." >&2
  exit 1
fi

# Preserve all existing settable reCAPTCHA fields while changing only the
# phone SMS-toll-fraud rollout. recaptchaKeys is output-only and omitted.
recaptcha_config="$(jq -c '
  (.recaptchaConfig // {})
  | del(.recaptchaKeys)
  | .phoneEnforcementState = "AUDIT"
  | .useSmsTollFraudProtection = true
  | .tollFraudManagedRules = [{"action":"BLOCK","startScore":0.8}]
' "$config_file")"

patch_file="$(mktemp)"
patch_code="$(curl -sS -o "$patch_file" -w '%{http_code}'   -X PATCH   -H "Authorization: Bearer $(access_token)"   -H "x-goog-user-project: $PROJECT_ID"   -H 'Content-Type: application/json'   -d "$(jq -cn --argjson recaptcha "$recaptcha_config" '{recaptchaConfig:$recaptcha}')"   "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config?updateMask=recaptchaConfig")"

if [[ "$patch_code" != "200" ]]; then
  jq -r '.error.message // "Could not configure staging reCAPTCHA SMS Defense"' "$patch_file" >&2 2>/dev/null || true
  echo "HTTP $patch_code" >&2
  exit 1
fi

echo "Waiting for Identity Platform reCAPTCHA key provisioning..."
for attempt in {1..30}; do
  config_file_next="$config_file.next"
  curl -sS --fail     -H "Authorization: Bearer $(access_token)"     -H "x-goog-user-project: $PROJECT_ID"     "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config"     > "$config_file_next"

  enforcement="$(jq -r '.recaptchaConfig.phoneEnforcementState // "OFF"' "$config_file_next")"
  toll_fraud="$(jq -r '.recaptchaConfig.useSmsTollFraudProtection // false' "$config_file_next")"
  threshold_ok="$(jq -r 'any(.recaptchaConfig.tollFraudManagedRules[]?; .action == "BLOCK" and .startScore == 0.8)' "$config_file_next")"
  web_key_present="$(jq -r 'any(.recaptchaConfig.recaptchaKeys[]?; .type == "WEB" and ((.key // "") | length > 0))' "$config_file_next")"
  tr_still_only="$(jq -r '(.smsRegionConfig.allowlistOnly.allowedRegions // []) | sort == ["TR"]' "$config_file_next")"

  if [[ "$enforcement" == "AUDIT" && "$toll_fraud" == "true" && "$threshold_ok" == "true" && "$web_key_present" == "true" && "$tr_still_only" == "true" ]]; then
    echo "SMS Defense staging configuration verified."
    echo "- enforcement: AUDIT"
    echo "- toll fraud protection: enabled"
    echo "- threshold: 0.8"
    echo "- web reCAPTCHA key: provisioned"
    echo "- SMS regions: TR only"
    echo "- production: untouched"
    exit 0
  fi

  sleep 10
done

echo "SMS Defense config was written, but reCAPTCHA key provisioning did not verify within 5 minutes." >&2
echo "Do not run a real SMS test until recaptchaKeys includes WEB and diagnostics report AUDIT/true/0.8." >&2
exit 1
