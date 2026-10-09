#!/usr/bin/env bash
set -euo pipefail
# GNU timeout terminates the dedicated command process group, including nested
# Node/Playwright drivers. It never prints arguments or private environment.
echo 'ANDROID_STAGE RUNNER_PROCESS RUNNING'
qa_android_status=0
timeout --signal=TERM --kill-after=10s 600s node qa/platform/android-emulator-evidence.cjs || qa_android_status=$?
case "$qa_android_status" in
  0) echo 'ANDROID_STAGE RUNNER_PROCESS PASS' ;;
  124|137) echo 'ANDROID_STAGE RUNNER_PROCESS TIMEOUT' ;;
  *) echo 'ANDROID_STAGE RUNNER_PROCESS FAIL' ;;
esac
exit "$qa_android_status"
