#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="project-a2e260c1-839d-4f1d-b90"
PROJECT_NUMBER="730419163638"
REGION="europe-west1"
DEPLOY_SA="diewish-staging-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
FRONTEND_SERVICE="diewish-frontend-staging"
WEB_APP_DISPLAY_NAME="Diewish Staging Web"
FIREBASE_TOOLS_VERSION="15.30.0"
SMS_REGIONS="${DIEWISH_STAGING_SMS_REGIONS:-TR}"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command not found: $1" >&2
    exit 1
  }
}

for command_name in gcloud curl jq node npm; do
  require_command "$command_name"
done

# User credentials in Cloud Shell may otherwise charge/authorize API requests
# against the Cloud Shell consumer project. Pin all direct Google REST calls to
# the isolated Diewish staging project.
curl() {
  command curl -H "x-goog-user-project: ${PROJECT_ID}" "$@"
}

ACTIVE_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n 1)"
if [[ -z "${ACTIVE_ACCOUNT}" ]]; then
  echo "No active gcloud account. Run: gcloud auth login" >&2
  exit 1
fi

SUPPORT_EMAIL="${DIEWISH_FIREBASE_SUPPORT_EMAIL:-${ACTIVE_ACCOUNT}}"
if [[ "${SUPPORT_EMAIL}" == *gserviceaccount.com ]]; then
  echo "DIEWISH_FIREBASE_SUPPORT_EMAIL must be a real Google account support email, not a service account." >&2
  exit 1
fi

echo "Diewish staging Authentication bootstrap"
echo "Project: ${PROJECT_ID}"
echo "Region : ${REGION}"
echo "This script touches only isolated staging Firebase/Identity Platform resources and staging IAM grants."
echo "It does not read, rotate, or modify database/JWT secrets and does not target production."
echo

gcloud config set project "${PROJECT_ID}" >/dev/null

SERVICES=(
  firebase.googleapis.com
  identitytoolkit.googleapis.com
  securetoken.googleapis.com
  apikeys.googleapis.com
)

echo "Enabling staging Authentication APIs..."
gcloud services enable "${SERVICES[@]}" --project "${PROJECT_ID}" --quiet

# API enablement is eventually consistent. Wait until the management endpoints
# stop reporting SERVICE_DISABLED before attempting provisioning.
wait_for_api() {
  local url="$1"
  local label="$2"
  local token
  local code
  local file

  for attempt in {1..30}; do
    token="$(gcloud auth print-access-token)"
    file="$(mktemp)"
    code="$(curl -sS -o "$file" -w '%{http_code}' -H "Authorization: Bearer ${token}" "$url")"
    if [[ "$code" != "403" ]] || ! grep -q 'SERVICE_DISABLED\|has not been used.*disabled' "$file"; then
      rm -f "$file"
      return 0
    fi
    rm -f "$file"
    sleep 2
  done

  echo "${label} did not become available after API enablement." >&2
  exit 1
}

wait_for_api "https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}" "Firebase Management API"
wait_for_api "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config" "Identity Toolkit API"

access_token() {
  gcloud auth print-access-token
}

firebase_request() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local args=(-sS -X "$method" -H "Authorization: Bearer $(access_token)" -H 'Content-Type: application/json')
  if [[ -n "$body" ]]; then
    args+=(-d "$body")
  fi
  curl "${args[@]}" "$url"
}

poll_firebase_operation() {
  local operation_name="$1"
  local response

  for attempt in {1..60}; do
    response="$(firebase_request GET "https://firebase.googleapis.com/v1beta1/${operation_name}")"
    if [[ "$(jq -r '.done // false' <<<"$response")" == "true" ]]; then
      if jq -e '.error' >/dev/null 2>&1 <<<"$response"; then
        jq -r '.error.message // "Firebase operation failed"' <<<"$response" >&2
        exit 1
      fi
      return 0
    fi
    sleep 2
  done

  echo "Firebase operation timed out: ${operation_name}" >&2
  exit 1
}

echo "Ensuring Firebase is attached to the staging project..."
project_file="$(mktemp)"
project_code="$(curl -sS -o "$project_file" -w '%{http_code}' \
  -H "Authorization: Bearer $(access_token)" \
  "https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}")"
if [[ "$project_code" == "404" ]]; then
  add_response="$(firebase_request POST "https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}:addFirebase" '{}')"
  operation_name="$(jq -r '.name // empty' <<<"$add_response")"
  if [[ -z "$operation_name" ]]; then
    jq -r '.error.message // "Could not add Firebase to the staging project"' <<<"$add_response" >&2
    exit 1
  fi
  poll_firebase_operation "$operation_name"
elif [[ "$project_code" != "200" ]]; then
  jq -r '.error.message // "Could not inspect Firebase project"' "$project_file" >&2
  exit 1
fi
rm -f "$project_file"

echo "Ensuring the staging Firebase Web App exists..."
apps_response="$(firebase_request GET "https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/webApps")"
web_app_name="$(jq -r --arg display "$WEB_APP_DISPLAY_NAME" '(.apps // [])[] | select(.displayName == $display) | .name' <<<"$apps_response" | head -n 1)"
if [[ -z "$web_app_name" ]]; then
  create_response="$(firebase_request POST \
    "https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/webApps" \
    "$(jq -cn --arg display "$WEB_APP_DISPLAY_NAME" '{displayName:$display}')")"
  operation_name="$(jq -r '.name // empty' <<<"$create_response")"
  if [[ -z "$operation_name" ]]; then
    jq -r '.error.message // "Could not create the staging Firebase Web App"' <<<"$create_response" >&2
    exit 1
  fi
  poll_firebase_operation "$operation_name"
  apps_response="$(firebase_request GET "https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/webApps")"
  web_app_name="$(jq -r --arg display "$WEB_APP_DISPLAY_NAME" '(.apps // [])[] | select(.displayName == $display) | .name' <<<"$apps_response" | head -n 1)"
fi
if [[ -z "$web_app_name" ]]; then
  echo "Staging Firebase Web App could not be resolved after creation." >&2
  exit 1
fi

echo "Ensuring Identity Platform is initialized..."
identity_file="$(mktemp)"
identity_code="$(curl -sS -o "$identity_file" -w '%{http_code}' \
  -X POST \
  -H "Authorization: Bearer $(access_token)" \
  -H 'Content-Type: application/json' \
  -d '{}' \
  "https://identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/identityPlatform:initializeAuth")"
if [[ "$identity_code" != "200" && "$identity_code" != "409" ]]; then
  # Existing Firebase Auth projects can answer with another non-success status;
  # accept it only when the project config is already readable.
  config_check="$(curl -sS -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $(access_token)" \
    "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config")"
  if [[ "$config_check" != "200" ]]; then
    jq -r '.error.message // "Could not initialize Identity Platform"' "$identity_file" >&2
    exit 1
  fi
fi
rm -f "$identity_file"

# Firebase CLI is the supported way to provision Google Sign-In's OAuth brand
# and Google OAuth client. It can use Application Default Credentials. Ensure an
# ADC user exists; this may open one interactive browser login the first time.
if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
  echo "Application Default Credentials are required once to provision Google Sign-In."
  gcloud auth application-default login --project "${PROJECT_ID}"
fi
# Pin ADC quota accounting to the same isolated staging project when supported.
gcloud auth application-default set-quota-project "${PROJECT_ID}" >/dev/null 2>&1 || true

firebase_config="$(mktemp)"
cat >"$firebase_config" <<EOF
{
  "auth": {
    "providers": {
      "anonymous": false,
      "emailPassword": true,
      "googleSignIn": {
        "oAuthBrandDisplayName": "Diewish",
        "supportEmail": "${SUPPORT_EMAIL}"
      }
    }
  }
}
EOF

echo "Provisioning Google Sign-In provider with Firebase CLI..."
npx --yes "firebase-tools@${FIREBASE_TOOLS_VERSION}" deploy \
  --only auth \
  --project "${PROJECT_ID}" \
  --config "$firebase_config" \
  --non-interactive
rm -f "$firebase_config"

# Phone auth is configured directly because Firebase CLI provider-as-code does
# not expose phone auth. Restrict staging SMS to explicit launch/test regions to
# reduce SMS pumping risk. Default is Türkiye only (TR).
IFS=',' read -r -a region_array <<<"$SMS_REGIONS"
region_json="$(printf '%s\n' "${region_array[@]}" | jq -R 'select(length>0)' | jq -s '.')"

frontend_url="$(gcloud run services describe "$FRONTEND_SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format='value(status.url)' 2>/dev/null || true)"
frontend_host=""
if [[ -n "$frontend_url" ]]; then
  frontend_host="$(node -e 'console.log(new URL(process.argv[1]).hostname)' "$frontend_url")"
fi

config_response="$(firebase_request GET "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config")"
existing_domains="$(jq -c '.authorizedDomains // []' <<<"$config_response")"
authorized_domains="$(jq -cn \
  --argjson current "$existing_domains" \
  --arg firebase "${PROJECT_ID}.firebaseapp.com" \
  --arg frontend "$frontend_host" \
  '$current + [$firebase] + (if $frontend == "" then [] else [$frontend] end) | unique')"

patch_body="$(jq -cn \
  --argjson domains "$authorized_domains" \
  --argjson regions "$region_json" \
  '{signIn:{phoneNumber:{enabled:true},anonymous:{enabled:false}},authorizedDomains:$domains,smsRegionConfig:{allowlistOnly:{allowedRegions:$regions}}}')"

patch_file="$(mktemp)"
patch_code="$(curl -sS -o "$patch_file" -w '%{http_code}' \
  -X PATCH \
  -H "Authorization: Bearer $(access_token)" \
  -H 'Content-Type: application/json' \
  -d "$patch_body" \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config?updateMask=signIn.phoneNumber.enabled,signIn.anonymous.enabled,authorizedDomains,smsRegionConfig")"
if [[ "$patch_code" != "200" ]]; then
  jq -r '.error.message // "Could not enable phone authentication"' "$patch_file" >&2
  exit 1
fi
rm -f "$patch_file"

# Give the protected staging deployer only the permissions needed to read the
# Firebase Web App/API key and maintain Firebase Authentication configuration.
for role in roles/firebaseauth.editor roles/serviceusage.apiKeysViewer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:${DEPLOY_SA}" \
    --role "$role" \
    --condition=None \
    --quiet >/dev/null
done

# Final bootstrap assertions do not print OAuth secrets or Firebase API keys.
config_response="$(firebase_request GET "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config")"
google_file="$(mktemp)"
google_code="$(curl -sS -o "$google_file" -w '%{http_code}' \
  -H "Authorization: Bearer $(access_token)" \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/defaultSupportedIdpConfigs/google.com")"

phone_enabled="$(jq -r '.signIn.phoneNumber.enabled // false' <<<"$config_response")"
anonymous_enabled="$(jq -r '.signIn.anonymous.enabled // false' <<<"$config_response")"
google_enabled="false"
if [[ "$google_code" == "200" ]]; then
  google_enabled="$(jq -r '.enabled // false' "$google_file")"
fi
rm -f "$google_file"

if [[ "$phone_enabled" != "true" || "$anonymous_enabled" != "false" || "$google_enabled" != "true" ]]; then
  echo "Authentication bootstrap assertions failed (phone/google/anonymous state)." >&2
  exit 1
fi

cat <<EOF

Staging Authentication bootstrap complete.
- Firebase project: configured
- Firebase Web App: configured
- Google Sign-In: enabled
- Phone Sign-In: enabled
- Anonymous Sign-In: disabled
- SMS region allowlist: ${SMS_REGIONS}
- Protected staging deployer: least-privilege auth/config read-write access granted

No production resource and no Diewish database/JWT secret was modified.
EOF
