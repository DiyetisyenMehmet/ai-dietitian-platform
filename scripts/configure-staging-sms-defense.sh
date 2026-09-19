#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-project-a2e260c1-839d-4f1d-b90}"
PROJECT_NUMBER="${PROJECT_NUMBER:-730419163638}"
EXPECTED_PROJECT_ID="project-a2e260c1-839d-4f1d-b90"
EXPECTED_PROJECT_NUMBER="730419163638"
MODE="${DIEWISH_SMS_DEFENSE_MODE:-AUDIT}"
START_SCORE="${DIEWISH_SMS_DEFENSE_START_SCORE:-0.8}"

if [[ "$PROJECT_ID" != "$EXPECTED_PROJECT_ID" || "$PROJECT_NUMBER" != "$EXPECTED_PROJECT_NUMBER" ]]; then
  echo "Refusing to modify any project other than isolated Diewish staging." >&2
  exit 1
fi
if [[ "$MODE" != "AUDIT" || "$START_SCORE" != "0.8" ]]; then
  echo "Initial rollout is locked to AUDIT with threshold 0.8." >&2
  exit 1
fi

for command_name in gcloud curl jq; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required command not found: $command_name" >&2
    exit 1
  }
done

enabled="$(gcloud services list   --enabled   --project="$PROJECT_ID"   --filter='config.name=recaptchaenterprise.googleapis.com'   --format='value(config.name)' 2>/dev/null || true)"
if [[ "$enabled" != "recaptchaenterprise.googleapis.com" ]]; then
  echo "reCAPTCHA Enterprise API is not enabled in staging. Run the one-time admin bootstrap first." >&2
  exit 2
fi

access_token() {
  gcloud auth print-access-token
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
before="$tmpdir/before.json"
patch="$tmpdir/patch.json"
after="$tmpdir/after.json"

curl -sS --fail   -H "Authorization: Bearer $(access_token)"   -H "x-goog-user-project: $PROJECT_ID"   "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config"   > "$before"

phone_enabled="$(jq -r '.signIn.phoneNumber.enabled // false' "$before")"
tr_only="$(jq -r '(.smsRegionConfig.allowlistOnly.allowedRegions // []) | sort == ["TR"]' "$before")"
domain_authorized="$(jq -r '(.authorizedDomains // []) | index("staging.diewish.com") != null' "$before")"
if [[ "$phone_enabled" != "true" || "$tr_only" != "true" || "$domain_authorized" != "true" ]]; then
  echo "Refusing SMS Defense update: staging auth safety contract is not intact." >&2
  exit 1
fi

# Preserve settable reCAPTCHA options already present. recaptchaKeys is
# output-only and must not be submitted back in an update.
recaptcha_config="$(jq -c '
  (.recaptchaConfig // {})
  | del(.recaptchaKeys)
  | .phoneEnforcementState = "AUDIT"
  | .useSmsTollFraudProtection = true
  | .tollFraudManagedRules = [{"action":"BLOCK","startScore":0.8}]
' "$before")"

http_code="$(curl -sS -o "$patch" -w '%{http_code}'   -X PATCH   -H "Authorization: Bearer $(access_token)"   -H "x-goog-user-project: $PROJECT_ID"   -H 'Content-Type: application/json'   -d "$(jq -cn --argjson recaptcha "$recaptcha_config" '{recaptchaConfig:$recaptcha,notification:{defaultLocale:"tr"}}')"   "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config?updateMask=recaptchaConfig,notification.defaultLocale")"
if [[ "$http_code" != "200" ]]; then
  jq -r '.error.message // "Could not configure staging reCAPTCHA SMS Defense"' "$patch" >&2 2>/dev/null || true
  echo "HTTP $http_code" >&2
  exit 1
fi

echo "Waiting for Identity Platform reCAPTCHA key provisioning..."
for attempt in {1..30}; do
  curl -sS --fail     -H "Authorization: Bearer $(access_token)"     -H "x-goog-user-project: $PROJECT_ID"     "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config"     > "$after"

  enforcement="$(jq -r '.recaptchaConfig.phoneEnforcementState // "OFF"' "$after")"
  toll_fraud="$(jq -r '.recaptchaConfig.useSmsTollFraudProtection // false' "$after")"
  threshold_ok="$(jq -r 'any(.recaptchaConfig.tollFraudManagedRules[]?; .action == "BLOCK" and .startScore == 0.8)' "$after")"
  web_key_present="$(jq -r 'any(.recaptchaConfig.recaptchaKeys[]?; .type == "WEB" and ((.key // "") | length > 0))' "$after")"
  tr_still_only="$(jq -r '(.smsRegionConfig.allowlistOnly.allowedRegions // []) | sort == ["TR"]' "$after")"
  sms_locale="$(jq -r '.notification.defaultLocale // ""' "$after")"

  if [[ "$enforcement" == "AUDIT" && "$toll_fraud" == "true" && "$threshold_ok" == "true" && "$web_key_present" == "true" && "$tr_still_only" == "true" && "$sms_locale" == "tr" ]]; then
    echo "Staging SMS Defense verified: AUDIT, threshold=0.8, WEB key provisioned, TR-only SMS policy preserved, default SMS locale=tr."
    exit 0
  fi
  sleep 10
done

echo "Identity Platform accepted the config, but WEB reCAPTCHA key provisioning did not verify within 5 minutes." >&2
echo "Verify the project-level SMS Defense toggle in reCAPTCHA Settings before any real SMS test." >&2
exit 1
