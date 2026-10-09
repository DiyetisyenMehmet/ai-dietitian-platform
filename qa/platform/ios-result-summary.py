"""Export fixed failure codes/counts; never export XCTest actions or raw messages."""
import json
import subprocess
import sys
from pathlib import Path

PATTERNS = {
    "IOS_CODE_SIGNATURE_INVALID": ("code signature", "not signed", "invalid signature"),
    "IOS_TEST_BUNDLE_MISSING": ("test bundle", "test host", "could not find"),
    "IOS_INSTALL_FAILED": ("failed to install", "installation failed"),
    "IOS_LAUNCH_FAILED": ("failed to launch", "could not launch", "launch failed"),
    "IOS_LOGIN_SURFACE_UNAVAILABLE": ("LOGIN_SURFACE_UNAVAILABLE",),
    "IOS_PASSWORD_FIELD_UNAVAILABLE": ("PASSWORD_FIELD_UNAVAILABLE",),
    "IOS_LOGIN_SUBMIT_UNAVAILABLE": ("LOGIN_SUBMIT_UNAVAILABLE",),
    "IOS_AUTHENTICATED_DASHBOARD_UNAVAILABLE": ("AUTHENTICATED_DASHBOARD_UNAVAILABLE",),
    "IOS_COACH_UNAVAILABLE": ("COACH_UNAVAILABLE", "COACH_LIST_UNAVAILABLE"),
    "IOS_NOTIFICATION_PREFERENCES_UNAVAILABLE": ("NOTIFICATION_PREFERENCES_UNAVAILABLE",),
    "IOS_PROFILE_UNAVAILABLE": ("PROFILE_UNAVAILABLE",),
    "IOS_SESSION_RELAUNCH_UNAVAILABLE": ("SESSION_RELAUNCH_UNAVAILABLE",),
    "IOS_HEALTH_GUARD_FAILED": ("HEALTH_DATA_SCREENSHOT_GUARD_FAIL",),
    "IOS_ACCOUNT_UNVERIFIED": ("ACCOUNT_UNVERIFIED",),
    "IOS_SPRINGBOARD_LAUNCH_SERVICE": ("FBSOpenApplicationServiceErrorDomain", "SBMainWorkspace"),
    "IOS_PROCESS_LAUNCH_SERVICE": ("RBSRequestErrorDomain", "NSPOSIXErrorDomain"),
    "IOS_SIMULATOR_CONNECTION_INTERRUPTED": ("connection interrupted", "connection invalidated", "Unable to boot"),
    "IOS_TEST_RUNNER_FAILED": ("test runner", "testing failed", "test execute failed"),
}


def codes(text):
    lowered = text.lower()
    return [code for code, patterns in PATTERNS.items()
            if any(pattern.lower() in lowered for pattern in patterns)]


def main():
    if sys.argv[1] == "--log":
        found = codes(Path(sys.argv[2]).read_text(errors="replace"))
        print("IOS_DIAGNOSTIC_CODES:", ",".join(found) or "IOS_EXECUTION_FAILED")
        return
    result = subprocess.run(
        ["xcrun", "xcresulttool", "get", "test-results", "summary", "--path", sys.argv[1]],
        capture_output=True, text=True)
    if result.returncode:
        print("IOS_RESULT_SUMMARY_UNAVAILABLE")
        return
    document = json.loads(result.stdout)
    for key in ("passedTests", "failedTests", "skippedTests", "totalTestCount"):
        value = document.get(key)
        if isinstance(value, int):
            print("IOS_TEST_COUNT:", key, value)
    found = codes(json.dumps(document))
    if found:
        print("IOS_DIAGNOSTIC_CODES:", ",".join(found))


if __name__ == "__main__":
    main()
