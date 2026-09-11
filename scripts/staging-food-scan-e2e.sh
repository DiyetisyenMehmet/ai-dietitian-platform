#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <frontend-url>" >&2
  exit 2
fi

API_BASE="${1%/}/api"
RUN_ID="${GITHUB_RUN_ID:-manual}"
ATTEMPT="${GITHUB_RUN_ATTEMPT:-1}"
EMAIL="diewish-food-scan-${RUN_ID}-${ATTEMPT}@example.com"
PASSWORD="$(python3 - <<'PY'
import secrets
import string
alphabet = string.ascii_letters + string.digits
print('E2e9!' + ''.join(secrets.choice(alphabet) for _ in range(28)))
PY
)"
TOKEN=""

cleanup() {
  if [[ -n "$TOKEN" ]]; then
    curl --silent --show-error --max-time 20 \
      -X DELETE "${API_BASE}/account" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      --data "{\"password\":\"${PASSWORD}\"}" >/dev/null || true
  fi
}
trap cleanup EXIT

REGISTER_RESPONSE="$(curl --fail-with-body --silent --show-error --max-time 30 \
  -X POST "${API_BASE}/auth/register" \
  -H "Content-Type: application/json" \
  --data "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"fullName\":\"Food Scan E2E\"}")"
TOKEN="$(printf '%s' "$REGISTER_RESPONSE" | jq -r '.data.tokens.accessToken // empty')"
test -n "$TOKEN"

for TYPE in TERMS_OF_SERVICE MEDICAL_DISCLAIMER KVKK_EXPLICIT_CONSENT; do
  curl --fail-with-body --silent --show-error --max-time 30 \
    -X POST "${API_BASE}/legal/consents" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    --data "{\"type\":\"${TYPE}\"}" >/dev/null
done

# Real staging provider/component path: Turkish names must resolve through the
# canonical alias layer instead of returning an all-null nutrition result.
curl --fail-with-body --silent --show-error --max-time 90 \
  -X POST "${API_BASE}/food-scan/recalculate" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"dishName":"İncir reçeli","targetGrams":200,"ingredients":[{"name":"incir","grams":110,"included":true},{"name":"toz şeker","grams":80,"included":true},{"name":"su","grams":10,"included":true}]}' \
  --output /tmp/food-scan-components.json

jq -e '.success == true' /tmp/food-scan-components.json >/dev/null
jq -e '.data.analysis.estimatedGrams == 200' /tmp/food-scan-components.json >/dev/null
jq -e '.data.analysis.totals.energyKcal != null and .data.analysis.totals.proteinG != null and .data.analysis.totals.carbohydratesG != null and .data.analysis.totals.fatG != null' /tmp/food-scan-components.json >/dev/null
jq -e '.data.analysis.nutritionResolution.method != "UNAVAILABLE"' /tmp/food-scan-components.json >/dev/null

# User-confirmed fallback path exercises the exact "recognized/name confirmed"
# recovery path. It may resolve from USDA or, only when facts are insufficient,
# from the explicitly-labelled AI estimate.
curl --fail-with-body --silent --show-error --max-time 90 \
  -X POST "${API_BASE}/food-scan/analyze-by-name" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"foodName":"incir reçeli","grams":200}' \
  --output /tmp/food-scan-name.json

jq -e '.success == true' /tmp/food-scan-name.json >/dev/null
jq -e '.data.analysis.dishName == "incir reçeli"' /tmp/food-scan-name.json >/dev/null
jq -e '.data.analysis.totals.energyKcal != null and .data.analysis.totals.proteinG != null and .data.analysis.totals.carbohydratesG != null and .data.analysis.totals.fatG != null' /tmp/food-scan-name.json >/dev/null
jq -e '.data.analysis.nutritionResolution.method == "VERIFIED_SOURCE" or .data.analysis.nutritionResolution.method == "COMPONENT_AGGREGATE" or .data.analysis.nutritionResolution.method == "AI_ESTIMATE"' /tmp/food-scan-name.json >/dev/null
jq -e 'if .data.analysis.nutritionResolution.method == "AI_ESTIMATE" then (.data.analysis.nutritionResolution.providers | length) == 0 and (.data.analysis.disclaimer | contains("Diewish AI")) else true end' /tmp/food-scan-name.json >/dev/null

echo "food-scan E2E OK: Turkish aliases -> component nutrition -> user-confirmed fallback -> populated core macros -> explicit provenance"
