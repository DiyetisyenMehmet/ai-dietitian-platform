#!/usr/bin/env bash
set -euo pipefail
mkdir -p /tmp/android-launch-evidence
# Use the emulator's actual display, not a virtual size override that can
# distort UiAutomation screenshots relative to screenrecord.
adb shell wm density 420
adb shell settings put global http_proxy 10.0.2.2:3020
adb install android/app/build/outputs/apk/debug/app-debug.apk
adb install android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
recording_pid=''
theme=''
collect_evidence() {
  if [ -n "$recording_pid" ]; then
    adb shell pkill -2 screenrecord || true
    wait "$recording_pid" || true
    adb pull "/sdcard/launch-${theme}.mp4" "/tmp/android-launch-evidence/launch-${theme}.mp4" || true
    mkdir -p "/tmp/android-launch-evidence/${theme}"
    adb pull /sdcard/Android/data/com.diewish.app/files/launch-evidence "/tmp/android-launch-evidence/${theme}/" || true
    adb logcat -d -s AndroidRuntime chromium > "/tmp/android-launch-evidence/${theme}-diagnostics.txt" || true
    recording_pid=''
  fi
}
trap collect_evidence EXIT
# Each cold-start scenario gets a fresh target-app process/storage. This affects
# only this disposable emulator, never staging users or sessions.
for theme in light dark; do
  adb shell pm clear com.diewish.app
  adb logcat -c
  adb shell screenrecord --size 540x960 --time-limit 120 "/sdcard/launch-${theme}.mp4" &
  recording_pid=$!
  adb shell am instrument -w -r -e class "com.diewish.app.LaunchVisualTest#${theme}Launch" com.diewish.app.test/androidx.test.runner.AndroidJUnitRunner | tee "/tmp/android-launch-evidence/${theme}-instrumentation.txt"
  collect_evidence
  # am instrument may return exit 0 even when assertions fail. grep is present
  # on the runner; ripgrep is not guaranteed there.
  grep -F 'OK (1 test)' "/tmp/android-launch-evidence/${theme}-instrumentation.txt"
done
