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
# Choose a device type already paired with an installed runtime by CoreSimulator.
# Newest device types can require a newer SDK than the runner has installed.
xcodebuild -version
export QA_IOS_SDK_VERSION="$(xcrun --sdk iphonesimulator --show-sdk-version)"
read -r runtime device_type < <(xcrun simctl list -j | python3 -c '
import json,sys,os
s=json.load(sys.stdin)
sdk=tuple(map(int,os.environ["QA_IOS_SDK_VERSION"].split(".")))
versions={r["identifier"]: tuple(map(int,r["version"].split("."))) for r in s["runtimes"] if r["isAvailable"] and "iOS" in r["name"] and tuple(map(int,r["version"].split("."))) <= sdk}
pairs=[(versions[r],r,d["deviceTypeIdentifier"]) for r,ds in s["devices"].items() if r in versions for d in ds if d["isAvailable"] and d["name"].startswith("iPhone")]
if not pairs: raise SystemExit("INSTALLED_IOS_DEVICE_REQUIRED")
_,runtime,device=sorted(pairs)[-1]
print(runtime,device)
')
export QA_IOS_DEVICE_TYPE="$device_type"
export QA_IOS_RUNTIME="$runtime"
simulator="$(xcrun simctl create Diewish-QA "$device_type" "$runtime")"
echo SIMULATOR_CREATED
xcrun simctl boot "$simulator"
xcrun simctl bootstatus "$simulator" -b >/dev/null
echo SIMULATOR_BOOTED
xcrun simctl status_bar "$simulator" override --time 9:41 --batteryState charged --batteryLevel 100
echo BUILDING_SIMULATOR_APP
xcodebuild -project ios/DiewishQA.xcodeproj -scheme DiewishQA -configuration Debug -sdk iphonesimulator \
  -destination "id=$simulator" -derivedDataPath "$private/build" CODE_SIGNING_ALLOWED=NO \
  build-for-testing >"$private/build.log" 2>&1 || { python3 qa/platform/ios-build-diagnostics.py "$private/build.log"; node qa/platform/ios-evidence.cjs build-failed; exit 1; }
echo SIMULATOR_BUILD_OK
# Keep only sanitized compile diagnostics; UI actions and credentials never leave the temp directory.
python3 qa/platform/ios-private.py inject "$private/build"
echo RUNNING_UI_TESTS
set +e
xcodebuild test-without-building -xctestrun "$private/qa.xctestrun" -destination "id=$simulator" \
  -resultBundlePath "$private/result.xcresult" -parallel-testing-enabled NO \
  -maximum-concurrent-test-simulator-destinations 1 CODE_SIGNING_ALLOWED=NO >"$private/test.log" 2>&1
result=$?
set -e
echo EXTRACTING_APPROVED_SCREENSHOTS
xcrun xcresulttool export attachments --path "$private/result.xcresult" --output-path "$private/attachments" >/dev/null
node qa/platform/ios-evidence.cjs "$private/attachments" "$result"
# xcresult, xctestrun, automatic failure screenshots and raw logs are intentionally deleted.
exit "$result"
