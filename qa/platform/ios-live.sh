#!/usr/bin/env bash
set -euo pipefail
# Launch an already installed simulator shell with in-memory expected identity.
[[ "$(uname -s)" == Darwin ]] || { echo MACOS_XCODE_REQUIRED; exit 2; }
[[ "${QA_IOS_UDID:-}" =~ ^[A-Fa-f0-9-]{36}$ ]] || { echo BOOTED_IOS_SIMULATOR_REQUIRED; exit 2; }
qa_guard_key="${QA_ACCOUNT_HMAC_KEY:-}"
[[ "${QA_SYNTHETIC_ACCOUNT:-}" == YES && -n "${QA_ACCOUNT_ID:-}" && ${#qa_guard_key} -ge 32 ]] || { echo TEST_ACCOUNT_SECRETS_REQUIRED; exit 2; }
export SIMCTL_CHILD_QA_SYNTHETIC_ACCOUNT=YES
export SIMCTL_CHILD_QA_ACCOUNT_ID="$QA_ACCOUNT_ID"
export SIMCTL_CHILD_QA_ACCOUNT_HMAC_KEY="$QA_ACCOUNT_HMAC_KEY"
xcrun simctl launch --terminate-running-process "$QA_IOS_UDID" com.diewish.qa >/dev/null 2>&1 || { echo IOS_LIVE_LAUNCH_FAILED; exit 2; }
echo IOS_LIVE_IDENTITY_GUARD_ENABLED
