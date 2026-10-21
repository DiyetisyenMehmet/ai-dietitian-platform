#!/usr/bin/env bash
set -euo pipefail
mkdir -p /tmp/android-launch-evidence
adb shell wm size 1080x2400
adb shell wm density 420
adb shell settings put global http_proxy 10.0.2.2:3020
adb install android/app/build/outputs/apk/debug/app-debug.apk
adb install android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell screenrecord --time-limit 120 /sdcard/launch-api33.mp4 &
recording_pid=$!
# Packages are only installed in this job's fresh emulator. No release upload.
adb shell am instrument -w -r -e class com.diewish.app.LaunchVisualTest com.diewish.app.test/androidx.test.runner.AndroidJUnitRunner | tee /tmp/android-launch-evidence/instrumentation.txt
adb shell pkill -2 screenrecord || true
wait "$recording_pid" || true
adb pull /sdcard/launch-api33.mp4 /tmp/android-launch-evidence/launch-api33.mp4
adb pull /sdcard/Android/data/com.diewish.app/files/launch-evidence /tmp/android-launch-evidence/
# am instrument can return exit 0 even when assertions fail.
rg 'OK \(2 tests\)' /tmp/android-launch-evidence/instrumentation.txt
