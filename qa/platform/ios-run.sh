#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/../.."
[[ "$(uname -s)" == Darwin ]] || { echo 'MACOS_XCODE_REQUIRED'; exit 2; }
command -v xcodebuild >/dev/null
if [[ ( "${QA_AUTHENTICATED_REQUIRED:-NO}" == YES || -n "${QA_EMAIL:-}" ) && "${QA_ACCOUNT_PREFLIGHT_COMPLETE:-}" != YES ]]; then
  exec node qa/platform/authenticated-run.cjs ios
fi
export QA_RUN_ID="${QA_RUN_ID:-ios-$(date -u +%Y%m%d%H%M%S)}"
private="$(mktemp -d "${TMPDIR:-/tmp}/diewish-ios.XXXXXX")"
cleanup() {
  if [[ -n "${simulator:-}" ]]; then
    python3 qa/platform/ios-private.py run CLEANUP_SHUTDOWN 20 "$private/shutdown.log" xcrun simctl shutdown "$simulator" || true
    python3 qa/platform/ios-private.py run CLEANUP_DELETE 20 "$private/delete.log" xcrun simctl delete "$simulator" || true
  fi
  rm -rf "$private"
}
trap cleanup EXIT
# Choose a device type already paired with an installed runtime by CoreSimulator.
# Newest device types can require a newer SDK than the runner has installed.
xcodebuild -version
export QA_IOS_SDK_VERSION="$(xcrun --sdk iphonesimulator --show-sdk-version)"
read -r runtime device_type < <(xcrun simctl list -j | python3 -c '
import json,sys,os
s=json.load(sys.stdin)
sdk=tuple(map(int,os.environ["QA_IOS_SDK_VERSION"].split(".")))
versions={r["identifier"]: tuple(map(int,r["version"].split("."))) for r in s["runtimes"] if r["isAvailable"] and "iOS" in r["name"] and (18,4) <= tuple(map(int,r["version"].split("."))) <= sdk}
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
python3 qa/platform/ios-private.py run SIMULATOR_BOOT 240 "$private/boot.log" xcrun simctl bootstatus "$simulator" -b
echo SIMULATOR_BOOTED
xcrun simctl status_bar "$simulator" override --time 9:41 --batteryState charged --batteryLevel 100
echo BUILDING_SIMULATOR_APP
# QA Simulator only: WebKit bug 293831 affects callAsyncJavaScript when
# Xcode 16.4/iOS 18.5 binds the older Swift overlay. Build the SAME host/code
# for 18.4+, as documented by WebKit; all auth/masking/UI assertions remain.
# https://bugs.webkit.org/show_bug.cgi?id=293831
echo 'IOS_QA_BUILD_TARGET 18.4'
python3 qa/platform/ios-private.py run BUILD 360 "$private/build.log" xcodebuild -project ios/DiewishQA.xcodeproj -scheme DiewishQA -configuration Debug -sdk iphonesimulator \
  -destination "id=$simulator" -derivedDataPath "$private/build" CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- IPHONEOS_DEPLOYMENT_TARGET=18.4 \
  build-for-testing || { python3 qa/platform/ios-build-diagnostics.py "$private/build.log"; node qa/platform/ios-evidence.cjs build-failed; exit 1; }
echo SIMULATOR_BUILD_OK
# Local ad-hoc signing supports ARM64 Simulator execution without an Apple account.
python3 qa/platform/ios-private.py run INSTALL 60 "$private/install.log" xcrun simctl install "$simulator" "$private/build/Build/Products/Debug-iphonesimulator/DiewishQA.app" || { python3 qa/platform/ios-result-summary.py --log "$private/install.log"; exit 1; }
echo SIMULATOR_INSTALL_OK
# XCTest is the sole launch owner. Its configuredApp.launch() and real UI
# assertions prove native launch; no unconfigured extra app process is started.
echo 'IOS_STAGE XCODE_LAUNCH_OWNER READY'
# Keep only sanitized compile diagnostics; UI actions and credentials never leave the temp directory.
python3 qa/platform/ios-private.py inject "$private/build"
echo RUNNING_UI_TESTS
set +e
python3 qa/platform/ios-private.py run XCODE_TESTS 600 "$private/test.log" xcodebuild test-without-building -xctestrun "$private/qa.xctestrun" -destination "id=$simulator" \
  -resultBundlePath "$private/result.xcresult" -parallel-testing-enabled NO \
  -test-timeouts-enabled YES -default-test-execution-time-allowance 480 -maximum-test-execution-time-allowance 480 \
  -maximum-concurrent-test-simulator-destinations 1 CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- IPHONEOS_DEPLOYMENT_TARGET=18.4
result=$?
set -e
# Emit only allowlisted stage words, never XCTest actions or argument values.
python3 - "$private/test.log" <<'PYLOG'
import re,sys
from pathlib import Path
for stage,status in re.findall(r'IOS_STAGE (APP_LAUNCH|AUTH_LOGIN|HEALTH_GUARD_PREPARE|HEALTH_GUARD_CAPTURE|HEALTH_GUARD) (RUNNING|PASS|FAIL)',Path(sys.argv[1]).read_text(errors='replace')):
    print('IOS_STAGE',stage,status)
PYLOG
python3 qa/platform/ios-result-summary.py "$private/result.xcresult"
if [[ "$result" != 0 ]]; then python3 qa/platform/ios-crash-diagnostics.py; fi
if [[ "$result" != 0 ]]; then python3 qa/platform/ios-result-summary.py --log "$private/test.log"; fi
echo EXTRACTING_APPROVED_SCREENSHOTS
if ! python3 qa/platform/ios-result-summary.py --guard-log "$private/test.log"; then
  node -e "require('./qa/platform/capture-guard.cjs').failClosed()"
  exit 1
fi
python3 qa/platform/ios-private.py run ATTACHMENT_EXPORT 60 "$private/export.log" xcrun xcresulttool export attachments --path "$private/result.xcresult" --output-path "$private/attachments"
node qa/platform/ios-evidence.cjs "$private/attachments" "$result"
# xcresult, xctestrun, automatic failure screenshots and raw logs are intentionally deleted.
exit "$result"
