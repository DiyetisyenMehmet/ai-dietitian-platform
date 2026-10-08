#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/../.."
[[ "$(uname -s)" == Darwin ]] || { echo 'MACOS_XCODE_REQUIRED'; exit 2; }
command -v xcodebuild >/dev/null
if [[ "${QA_AUTHENTICATED_REQUIRED:-NO}" == YES || -n "${QA_EMAIL:-}" ]]; then
  node qa/platform/account-preflight.cjs
fi
export QA_RUN_ID="${QA_RUN_ID:-ios-$(date -u +%Y%m%d%H%M%S)}"
private="$(mktemp -d "${TMPDIR:-/tmp}/diewish-ios.XXXXXX")"
cleanup() { xcrun simctl shutdown "${simulator:-}" >/dev/null 2>&1 || true; [[ -z "${simulator:-}" ]] || xcrun simctl delete "$simulator" >/dev/null 2>&1 || true; rm -rf "$private"; }
trap cleanup EXIT
runtime="$(xcrun simctl list runtimes available -j | python3 -c 'import json,sys; r=[r for r in json.load(sys.stdin)["runtimes"] if r["isAvailable"] and "iOS" in r["name"]]; print(sorted(r,key=lambda r:tuple(map(int,r["version"].split("."))))[-1]["identifier"])')"
device_type="$(xcrun simctl list devicetypes -j | python3 -c 'import json,sys; d=[d for d in json.load(sys.stdin)["devicetypes"] if d["name"].startswith("iPhone")]; print(d[-1]["identifier"])')"
simulator="$(xcrun simctl create Diewish-QA "$device_type" "$runtime")"
xcrun simctl boot "$simulator"
xcrun simctl bootstatus "$simulator" -b >/dev/null
xcrun simctl status_bar "$simulator" override --time 9:41 --batteryState charged --batteryLevel 100
xcodebuild -project ios/DiewishQA.xcodeproj -scheme DiewishQA -configuration Debug -sdk iphonesimulator \
  -destination "id=$simulator" -derivedDataPath "$private/build" CODE_SIGNING_ALLOWED=NO \
  build-for-testing >"$private/build.log" 2>&1 || { node qa/platform/ios-evidence.cjs build-failed; exit 1; }
# Keep only sanitized compile diagnostics; UI actions and credentials never leave the temp directory.
python3 qa/platform/ios-private.py inject "$private/build"
set +e
xcodebuild test-without-building -xctestrun "$private/qa.xctestrun" -destination "id=$simulator" \
  -resultBundlePath "$private/result.xcresult" -parallel-testing-enabled NO \
  -maximum-concurrent-test-simulator-destinations 1 CODE_SIGNING_ALLOWED=NO >"$private/test.log" 2>&1
result=$?
set -e
xcrun xcresulttool export attachments --path "$private/result.xcresult" --output-path "$private/attachments" >/dev/null
node qa/platform/ios-evidence.cjs "$private/attachments" "$result"
# xcresult, xctestrun, automatic failure screenshots and raw logs are intentionally deleted.
exit "$result"
