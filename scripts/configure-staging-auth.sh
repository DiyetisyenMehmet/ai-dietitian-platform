#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-project-a2e260c1-839d-4f1d-b90}"
PROJECT_NUMBER="${PROJECT_NUMBER:-}"
REGION="${REGION:-europe-west1}"
FRONTEND_SERVICE="${FRONTEND_SERVICE:-diewish-frontend-staging}"
FRONTEND_URL="${FRONTEND_URL:-}"
CUSTOM_FRONTEND_URL="${CUSTOM_FRONTEND_URL:-https://staging.diewish.com}"
ADMIN_STAGING_URL="${ADMIN_STAGING_URL:-https://admin-staging.diewish.com}"
WEB_APP_DISPLAY_NAME="Diewish Staging Web"
SMS_REGIONS="${DIEWISH_STAGING_SMS_REGIONS:-TR}"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command not found: $1" >&2
    exit 1
  }
}

for command_name in gcloud curl jq; do
  require_command "$command_name"
done

# Keep Google management API quota/consumer accounting bound to the isolated
# staging project for both user credentials and workload-identity credentials.
curl() {
  command curl -H "x-goog-user-project: ${PROJECT_ID}" "$@"
}

if [[ -z "$FRONTEND_URL" || "$FRONTEND_URL" != https://* ]]; then
  echo "FRONTEND_URL must be the HTTPS URL of the isolated staging frontend." >&2
  exit 1
fi

if [[ -z "$CUSTOM_FRONTEND_URL" || "$CUSTOM_FRONTEND_URL" != https://* ]]; then
  echo "CUSTOM_FRONTEND_URL must be the HTTPS URL of the custom staging frontend." >&2
  exit 1
fi

frontend_host="${FRONTEND_URL#https://}"
frontend_host="${frontend_host%%/*}"
frontend_host="${frontend_host%%:*}"
if [[ -z "$frontend_host" ]]; then
  echo "Could not resolve staging frontend host." >&2
  exit 1
fi

custom_frontend_host="${CUSTOM_FRONTEND_URL#https://}"
custom_frontend_host="${custom_frontend_host%%/*}"
custom_frontend_host="${custom_frontend_host%%:*}"
if [[ -z "$custom_frontend_host" ]]; then
  echo "Could not resolve custom staging frontend host." >&2
  exit 1
fi

admin_staging_host="${ADMIN_STAGING_URL#https://}"
admin_staging_host="${admin_staging_host%%/*}"
admin_staging_host="${admin_staging_host%%:*}"
if [[ -z "$admin_staging_host" ]]; then
  echo "Could not resolve admin staging host." >&2
  exit 1
fi

if [[ -z "$PROJECT_NUMBER" ]]; then
  PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)' 2>/dev/null || true)"
fi
if [[ -z "$PROJECT_NUMBER" || ! "$PROJECT_NUMBER" =~ ^[0-9]+$ ]]; then
  echo "Could not resolve staging Google Cloud project number." >&2
  exit 1
fi

# Cloud Run exposes both status.url (...a.run.app) and the stable service URL
# (<service>-<projectNumber>.<region>.run.app). Browser users can reach either,
# and Firebase Auth must authorize every origin that may initiate OAuth/reCAPTCHA.
canonical_frontend_host="${FRONTEND_SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"

access_token() {
  gcloud auth print-access-token
}

auth_header() {
  printf 'Authorization: Bearer %s' "$(access_token)"
}

fail_from_json() {
  local file="$1"
  local fallback="$2"
  jq -r --arg fallback "$fallback" '.error.message // $fallback' "$file" >&2 2>/dev/null || echo "$fallback" >&2
  exit 1
}

# The one-time admin bootstrap must have enabled these APIs and granted the
# protected staging deployer narrow Firebase Auth/API-key read permissions.
for service in identitytoolkit.googleapis.com firebase.googleapis.com apikeys.googleapis.com securetoken.googleapis.com; do
  enabled="$(gcloud services list --enabled --project "$PROJECT_ID" --filter="config.name=${service}" --format='value(config.name)' 2>/dev/null || true)"
  if [[ "$enabled" != "$service" ]]; then
    echo "Required staging API is not enabled/readable: ${service}. Run scripts/bootstrap-staging-auth-gcp.sh once as a project admin." >&2
    exit 1
  fi
done

apps_file="$(mktemp)"
apps_code="$(curl -sS -o "$apps_file" -w '%{http_code}' \
  -H "$(auth_header)" \
  "https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/webApps")"
if [[ "$apps_code" != "200" ]]; then
  fail_from_json "$apps_file" "Could not list staging Firebase Web Apps. Run the auth bootstrap once as a project admin."
fi

web_app_name="$(jq -r --arg display "$WEB_APP_DISPLAY_NAME" '(.apps // [])[] | select(.displayName == $display) | .name' "$apps_file" | head -n 1)"
rm -f "$apps_file"
if [[ -z "$web_app_name" ]]; then
  echo "Diewish Staging Web Firebase app is missing. Run scripts/bootstrap-staging-auth-gcp.sh once as a project admin." >&2
  exit 1
fi

web_config_file="$(mktemp)"
web_config_code="$(curl -sS -o "$web_config_file" -w '%{http_code}' \
  -H "$(auth_header)" \
  "https://firebase.googleapis.com/v1beta1/${web_app_name}/config")"
if [[ "$web_config_code" != "200" ]]; then
  fail_from_json "$web_config_file" "Could not retrieve staging Firebase Web App config."
fi

firebase_api_key="$(jq -r '.apiKey // empty' "$web_config_file")"
firebase_auth_domain="$(jq -r '.authDomain // empty' "$web_config_file")"
firebase_app_id="$(jq -r '.appId // empty' "$web_config_file")"
rm -f "$web_config_file"

if [[ -z "$firebase_api_key" || -z "$firebase_auth_domain" || -z "$firebase_app_id" ]]; then
  echo "Firebase Web App config is incomplete (apiKey/authDomain/appId)." >&2
  exit 1
fi

# Prevent public-but-sensitive-to-logs configuration values from being echoed by
# future shell commands or GitHub Actions output formatting.
if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
  echo "::add-mask::${firebase_api_key}"
  echo "::add-mask::${firebase_app_id}"
fi

config_file="$(mktemp)"
config_code="$(curl -sS -o "$config_file" -w '%{http_code}' \
  -H "$(auth_header)" \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config")"
if [[ "$config_code" != "200" ]]; then
  fail_from_json "$config_file" "Could not read staging Identity Platform config."
fi

existing_domains="$(jq -c '.authorizedDomains // []' "$config_file")"
recaptcha_phone_enforcement="$(jq -r '.recaptchaConfig.phoneEnforcementState // "OFF"' "$config_file")"
recaptcha_sms_toll_fraud="$(jq -r '.recaptchaConfig.useSmsTollFraudProtection // false' "$config_file")"
recaptcha_toll_fraud_rules="$(jq -c '.recaptchaConfig.tollFraudManagedRules // []' "$config_file")"
recaptcha_sms_bot_score="$(jq -r '.recaptchaConfig.useSmsBotScore // false' "$config_file")"
rm -f "$config_file"
authorized_domains="$(jq -cn \
  --argjson current "$existing_domains" \
  --arg firebase "$firebase_auth_domain" \
  --arg frontend "$frontend_host" \
  --arg canonical "$canonical_frontend_host" \
  --arg custom "$custom_frontend_host" \
  --arg admin "$admin_staging_host" \
  '$current + [$firebase,$frontend,$canonical,$custom,$admin] | map(select(length>0)) | unique')"

IFS=',' read -r -a region_array <<<"$SMS_REGIONS"
region_json="$(printf '%s\n' "${region_array[@]}" | sed 's/^ *//;s/ *$//' | jq -R 'select(length>0)' | jq -s '.')"
if [[ "$(jq 'length' <<<"$region_json")" -eq 0 ]]; then
  echo "At least one staging SMS region must be configured." >&2
  exit 1
fi

patch_body="$(jq -cn \
  --argjson domains "$authorized_domains" \
  --argjson regions "$region_json" \
  '{signIn:{email:{enabled:true,passwordRequired:true},phoneNumber:{enabled:true},anonymous:{enabled:false}},authorizedDomains:$domains,smsRegionConfig:{allowlistOnly:{allowedRegions:$regions}}}')"

patch_file="$(mktemp)"
patch_code="$(curl -sS -o "$patch_file" -w '%{http_code}' \
  -X PATCH \
  -H "$(auth_header)" \
  -H 'Content-Type: application/json' \
  -d "$patch_body" \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired,signIn.phoneNumber.enabled,signIn.anonymous.enabled,authorizedDomains,smsRegionConfig")"
if [[ "$patch_code" != "200" ]]; then
  fail_from_json "$patch_file" "Could not enforce staging phone/anonymous/domain configuration."
fi
rm -f "$patch_file"

google_file="$(mktemp)"
google_code="$(curl -sS -o "$google_file" -w '%{http_code}' \
  -H "$(auth_header)" \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/defaultSupportedIdpConfigs/google.com")"
if [[ "$google_code" != "200" ]]; then
  fail_from_json "$google_file" "Google Sign-In provider is missing. Run scripts/bootstrap-staging-auth-gcp.sh once as a project admin."
fi
google_enabled="$(jq -r '.enabled // false' "$google_file")"
google_client_id_present="$(jq -r '((.clientId // "") | length) > 0' "$google_file")"
rm -f "$google_file"
if [[ "$google_enabled" != "true" || "$google_client_id_present" != "true" ]]; then
  echo "Google Sign-In provider is not fully enabled/configured in staging." >&2
  exit 1
fi

# Re-read project config after the update and fail closed if the requested auth
# contract was not actually persisted.
verify_file="$(mktemp)"
verify_code="$(curl -sS -o "$verify_file" -w '%{http_code}' \
  -H "$(auth_header)" \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config")"
if [[ "$verify_code" != "200" ]]; then
  fail_from_json "$verify_file" "Could not verify staging Identity Platform config."
fi

email_enabled="$(jq -r '.signIn.email.enabled // false' "$verify_file")"
email_password_required="$(jq -r '.signIn.email.passwordRequired // false' "$verify_file")"
phone_enabled="$(jq -r '.signIn.phoneNumber.enabled // false' "$verify_file")"
anonymous_enabled="$(jq -r '.signIn.anonymous.enabled // false' "$verify_file")"
frontend_authorized="$(jq -r --arg host "$frontend_host" '(.authorizedDomains // []) | index($host) != null' "$verify_file")"
canonical_authorized="$(jq -r --arg host "$canonical_frontend_host" '(.authorizedDomains // []) | index($host) != null' "$verify_file")"
custom_authorized="$(jq -r --arg host "$custom_frontend_host" '(.authorizedDomains // []) | index($host) != null' "$verify_file")"
admin_authorized="$(jq -r --arg host "$admin_staging_host" '(.authorizedDomains // []) | index($host) != null' "$verify_file")"
sms_allowed_regions="$(jq -c '(.smsRegionConfig.allowlistOnly.allowedRegions // []) | sort | unique' "$verify_file")"
expected_sms_regions="$(jq -c 'sort | unique' <<<"$region_json")"
rm -f "$verify_file"

if [[ "$email_enabled" != "true" || "$email_password_required" != "true" || "$phone_enabled" != "true" || "$anonymous_enabled" != "false" || "$frontend_authorized" != "true" || "$canonical_authorized" != "true" || "$custom_authorized" != "true" || "$admin_authorized" != "true" || "$sms_allowed_regions" != "$expected_sms_regions" ]]; then
  echo "Staging auth contract verification failed after update." >&2
  exit 1
fi

if [[ -z "${GITHUB_ENV:-}" ]]; then
  echo "GITHUB_ENV is required so the protected staging workflow can bind Firebase config to the backend." >&2
  exit 1
fi

{
  echo "FIREBASE_WEB_API_KEY=${firebase_api_key}"
  echo "FIREBASE_AUTH_DOMAIN=${firebase_auth_domain}"
  echo "FIREBASE_WEB_APP_ID=${firebase_app_id}"
  echo "FIREBASE_MESSAGING_SENDER_ID=${PROJECT_NUMBER}"
  echo "CANONICAL_FRONTEND_URL=https://${canonical_frontend_host}"
  echo "CUSTOM_FRONTEND_URL=https://${custom_frontend_host}"
} >> "$GITHUB_ENV"

echo "Staging Authentication contract verified: email/password + Google + phone enabled, anonymous disabled, authorized domains enforced, SMS allowlist enforced. Password reset email uses the provider-managed action handler."
echo "Staging phone reCAPTCHA diagnostic: enforcement=${recaptcha_phone_enforcement}, smsTollFraudProtection=${recaptcha_sms_toll_fraud}, tollFraudManagedRules=${recaptcha_toll_fraud_rules}, smsBotScore=${recaptcha_sms_bot_score}."
