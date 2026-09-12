#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <frontend-url>" >&2
  exit 2
fi

API_BASE="${1%/}/api"
RUN_ID="${GITHUB_RUN_ID:-manual}"
ATTEMPT="${GITHUB_RUN_ATTEMPT:-1}"
EMAIL="diewish-barcode-${RUN_ID}-${ATTEMPT}@example.com"
PASSWORD="$(python3 - <<'PY'
import secrets, string
alphabet = string.ascii_letters + string.digits
print('E2e9!' + ''.join(secrets.choice(alphabet) for _ in range(28)))
PY
)"
TOKEN=""
BARCODE="12345678901231"

cleanup() {
  if [[ -n "$TOKEN" ]]; then
    curl --silent --show-error --max-time 20 -X DELETE "${API_BASE}/account" -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" --data "{\"password\":\"${PASSWORD}\"}" >/dev/null || true
  fi
}
trap cleanup EXIT

REGISTER_RESPONSE="$(curl --fail-with-body --silent --show-error --max-time 30 -X POST "${API_BASE}/auth/register" -H "Content-Type: application/json" --data "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"fullName\":\"Barcode Recovery E2E\"}")"
TOKEN="$(printf '%s' "$REGISTER_RESPONSE" | jq -r '.data.tokens.accessToken // empty')"
test -n "$TOKEN"
for TYPE in TERMS_OF_SERVICE MEDICAL_DISCLAIMER KVKK_EXPLICIT_CONSENT; do
  curl --fail-with-body --silent --show-error --max-time 30 -X POST "${API_BASE}/legal/consents" -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" --data "{\"type\":\"${TYPE}\"}" >/dev/null
done

# Confirm a package-label transcription for a valid GTIN-14. This exercises the
# user review/save path without relying on a third-party product being present.
curl --fail-with-body --silent --show-error --max-time 60 \
  -X POST "${API_BASE}/nutrition/barcode/${BARCODE}/confirm-label" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"productName":"Diewish Staging Test Bar","brand":"Diewish Test","quantity":"50 g","basis":"PER_100_G","servingGrams":50,"energyKj":1680,"nutrients":{"energyKcal":400,"proteinG":10,"carbohydratesG":60,"fatG":12,"saturatedFatG":4,"sugarsG":24,"fiberG":8,"sodiumMg":null,"saltG":0.5},"ingredients":["yulaf","kakao","şeker"],"allergens":["süt"],"confidence":0.9,"warnings":[]}' \
  --output /tmp/barcode-confirm.json
jq -e '.success == true and .data.food.provider == "DIEWISH" and .data.food.provenance.sourceReference == "USER_CONFIRMED_PACKAGE_LABEL"' /tmp/barcode-confirm.json >/dev/null
jq -e '.data.scan.scanType == "NUTRITION_LABEL" and .data.scan.provenance.recognition == "OCR_ESTIMATED"' /tmp/barcode-confirm.json >/dev/null
jq -e '.data.food.nutrientsPer100g.energyKcal == 400 and .data.food.nutrientsPer100g.sodiumMg == 200' /tmp/barcode-confirm.json >/dev/null

# A subsequent scan of the same barcode must recover the user-scoped label if
# global product sources still do not have the item.
curl --fail-with-body --silent --show-error --max-time 90 \
  "${API_BASE}/nutrition/barcode/${BARCODE}" \
  -H "Authorization: Bearer ${TOKEN}" \
  --output /tmp/barcode-lookup.json
jq -e '.success == true and .data.found == true' /tmp/barcode-lookup.json >/dev/null
jq -e '.data.food.provenance.sourceReference == "USER_CONFIRMED_PACKAGE_LABEL" or .data.food.provider == "OPEN_FOOD_FACTS" or .data.food.provider == "USDA"' /tmp/barcode-lookup.json >/dev/null

# Personalization must use the same user-scoped fallback instead of failing the
# moment the shared barcode providers miss.
curl --fail-with-body --silent --show-error --max-time 90 \
  -X POST "${API_BASE}/nutrition/personalize" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  --data "{\"barcode\":\"${BARCODE}\",\"grams\":50}" \
  --output /tmp/barcode-personalize.json
jq -e '.success == true and .data.personalization.nutrients.energyKcal != null' /tmp/barcode-personalize.json >/dev/null

echo "barcode recovery E2E OK: GTIN-14 -> user-confirmed label -> persisted lookup -> personalization"
