#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <frontend-url>" >&2
  exit 2
fi

API_BASE="${1%/}/api"
RUN_ID="${GITHUB_RUN_ID:-manual}"
ATTEMPT="${GITHUB_RUN_ATTEMPT:-1}"
EMAIL="diewish-blood-pdf-${RUN_ID}-${ATTEMPT}@example.com"
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

python3 - <<'PY'
from pathlib import Path

lines = [
    "Diewish Synthetic Laboratory Report",
    "Laboratory: Diewish Staging Synthetic Lab",
    "Patient: Synthetic Test User",
    "Date: 2026-09-11",
    "Test Result Unit Reference Range",
    "HGB 15.0 g/dL 13.5-17.5",
    "HCT 44.0 % 40-52",
    "MCV 89.1 fL 80-96",
    "MCH 30.4 pg 28-33",
    "MCHC 34.1 g/dL 33-36",
    "RBC 4.94 x10^12/L 4.2-6.2",
    "WBC 5.99 x10^9/L 4.5-11",
    "PLT 225 K/uL 154-386",
]

def esc(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

content = ["BT", "/F1 14 Tf", "50 750 Td", f"({esc(lines[0])}) Tj", "/F1 10 Tf"]
for line in lines[1:]:
    content.extend(["0 -24 Td", f"({esc(line)}) Tj"])
content.append("ET")
stream = "\n".join(content).encode("latin-1")

objects = [
    b"<< /Type /Catalog /Pages 2 0 R >>",
    b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
]

out = bytearray(b"%PDF-1.4\n")
offsets = [0]
for index, obj in enumerate(objects, start=1):
    offsets.append(len(out))
    out.extend(f"{index} 0 obj\n".encode())
    out.extend(obj)
    out.extend(b"\nendobj\n")
xref = len(out)
out.extend(f"xref\n0 {len(objects)+1}\n".encode())
out.extend(b"0000000000 65535 f \n")
for offset in offsets[1:]:
    out.extend(f"{offset:010d} 00000 n \n".encode())
out.extend(f"trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
Path("/tmp/diewish-synthetic-lab.pdf").write_bytes(out)
PY

REGISTER_RESPONSE="$(curl --fail-with-body --silent --show-error --max-time 30 \
  -X POST "${API_BASE}/auth/register" \
  -H "Content-Type: application/json" \
  --data "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"fullName\":\"Blood PDF E2E\"}")"
TOKEN="$(printf '%s' "$REGISTER_RESPONSE" | jq -r '.data.tokens.accessToken // empty')"
test -n "$TOKEN"

# Privacy illumination is informational, not an affirmative permission.
for TYPE in TERMS_OF_SERVICE MEDICAL_DISCLAIMER KVKK_EXPLICIT_CONSENT; do
  curl --fail-with-body --silent --show-error --max-time 30 \
    -X POST "${API_BASE}/legal/consents" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    --data "{\"type\":\"${TYPE}\"}" >/dev/null
done

ANALYSIS_RESPONSE="$(curl --fail-with-body --silent --show-error --max-time 175 \
  -X POST "${API_BASE}/blood-tests/analyze-upload" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "file=@/tmp/diewish-synthetic-lab.pdf;type=application/pdf" \
  -F "label=Staging synthetic PDF E2E" \
  -F "testDate=2026-09-11")"

printf '%s' "$ANALYSIS_RESPONSE" > /tmp/blood-analysis-response.json
jq -e '.success == true' /tmp/blood-analysis-response.json >/dev/null
jq -e '.data.analysis.status == "COMPLETED"' /tmp/blood-analysis-response.json >/dev/null
jq -e '(.data.analysis.normalizedValues | length) >= 6' /tmp/blood-analysis-response.json >/dev/null
jq -e '[.data.analysis.normalizedValues[].biomarkerCode] | (index("HGB") != null) and (index("HCT") != null) and (index("MCV") != null) and (index("RBC") != null) and (index("WBC") != null) and (index("PLT") != null)' /tmp/blood-analysis-response.json >/dev/null
jq -e '[.data.analysis.normalizedValues[] | select(.referenceRange.source == "LAB_REPORT")] | length >= 6' /tmp/blood-analysis-response.json >/dev/null

echo "blood-test PDF E2E OK: upload -> consent/auth -> PDF validation -> extraction -> normalization -> Vertex analysis -> same-origin proxy"
