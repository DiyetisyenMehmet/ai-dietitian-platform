#!/usr/bin/env bash
set -euo pipefail
# Destructive/device-setting controls are restricted to a dedicated emulator.
serial="${QA_ANDROID_SERIAL:-}"
[[ "$serial" == emulator-* ]] || { echo 'DEDICATED_EMULATOR_SERIAL_REQUIRED'; exit 2; }
[[ "$(adb -s "$serial" shell getprop ro.kernel.qemu | tr -d '\r')" == 1 ]] || { echo 'EMULATOR_REQUIRED'; exit 2; }
action="${1:-}"
case "$action" in
  relaunch)
    adb -s "$serial" shell am force-stop com.diewish.app
    adb -s "$serial" shell am start -n com.diewish.app/.MainActivity ;;
  offline) adb -s "$serial" shell svc wifi disable; adb -s "$serial" shell svc data disable ;;
  online) adb -s "$serial" shell svc wifi enable; adb -s "$serial" shell svc data enable ;;
  reboot) adb -s "$serial" reboot; adb -s "$serial" wait-for-device ;;
  clear-app-data)
    [[ "${QA_RESET_APP_DATA:-}" == YES ]] || { echo 'QA_RESET_APP_DATA_OPT_IN_REQUIRED'; exit 2; }
    adb -s "$serial" shell pm clear com.diewish.app ;;
  grant-camera) adb -s "$serial" shell pm grant com.diewish.app android.permission.CAMERA ;;
  revoke-camera) adb -s "$serial" shell pm revoke com.diewish.app android.permission.CAMERA ;;
  grant-notifications) adb -s "$serial" shell pm grant com.diewish.app android.permission.POST_NOTIFICATIONS ;;
  revoke-notifications) adb -s "$serial" shell pm revoke com.diewish.app android.permission.POST_NOTIFICATIONS ;;
  timezone-istanbul|timezone-utc)
    zone=Europe/Istanbul
    [[ "$action" != timezone-utc ]] || zone=UTC
    # Rootable Google APIs AVD only. Failure is reported; never fake the clock.
    adb -s "$serial" root
    adb -s "$serial" wait-for-device
    adb -s "$serial" shell settings put global auto_time_zone 0
    adb -s "$serial" shell setprop persist.sys.timezone "$zone"
    adb -s "$serial" shell am broadcast -a android.intent.action.TIMEZONE_CHANGED --es time-zone "$zone"
    actual="$(adb -s "$serial" shell getprop persist.sys.timezone | tr -d '\r')"
    [[ "$actual" == "$zone" ]] || { echo 'DEVICE_TIMEZONE_CHANGE_FAILED'; exit 2; } ;;
  *) echo 'UNKNOWN_ANDROID_CONTROL'; exit 2 ;;
esac
