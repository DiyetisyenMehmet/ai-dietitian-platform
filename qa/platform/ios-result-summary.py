"""Export fixed failure codes/counts; never export XCTest actions or raw messages."""
import json
import re
import subprocess
import sys
from pathlib import Path

PATTERNS = {
    "IOS_CODE_SIGNATURE_INVALID": ("code signature", "not signed", "invalid signature"),
    "IOS_TEST_BUNDLE_MISSING": ("test bundle", "test host", "could not find"),
    "IOS_INSTALL_FAILED": ("failed to install", "installation failed"),
    "IOS_LAUNCH_FAILED": ("failed to launch", "could not launch", "launch failed", "unable to launch"),
    "IOS_TARGET_PATH_MISSING": ("no target application", "target application path", "UITargetAppPath"),
    "IOS_TARGET_PROCESS_UNAVAILABLE": ("failed to get application process", "application process is not running", "failed to get pid"),
    "IOS_ACCESSIBILITY_NOT_READY": ("failed to get matching snapshot", "failed to get attributes", "failed to get accessibility", "unable to get a valid pid"),
    "IOS_LAUNCH_IDLE_TIMEOUT": ("waiting for app to idle", "failed to quiesce", "application did not become idle"),
    "IOS_LAUNCH_CRASH": ("crashed", "crash report", "signal sig", "EXC_BAD_ACCESS", "EXC_CRASH", "fatal error"),
    "IOS_TEST_CONFIGURATION_FAILED": ("test configuration", "invalid configuration", "failed to load"),
    "IOS_AUTOMATION_SESSION_FAILED": ("automation session", "failed to establish communication", "failed to connect", "Lost connection"),
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
    "IOS_ACCESSIBILITY_SNAPSHOT_FAILED": ("matching snapshot", "snapshot request", "kAXError", "main window"),
    "IOS_UI_EVENT_FAILED": ("synthesize event", "No matches found", "Neither element nor"),
    "IOS_APP_NOT_RUNNING": ("Application is not running", "app is not running"),
    "IOS_UI_WAIT_TIMEOUT": ("Timed out", "timeout waiting", "Failed to establish"),
    "IOS_TEST_RUNNER_FAILED": ("test runner", "testing failed", "test execute failed"),
}


def codes(text):
    lowered = text.lower()
    return [code for code, patterns in PATTERNS.items()
            if any(pattern.lower() in lowered for pattern in patterns)]


def read_guard_log(path):
    # A missing/unreadable private log blocks exports.
    try:
        return "HEALTH_DATA_SCREENSHOT_GUARD_FAIL" in Path(path).read_text(errors="replace")
    except OSError:
        return True


def emit_legacy(document):
    # Raw issue text stays private; only fixed codes and our source line leave.
    text = json.dumps(document)
    messages = []
    def visit(value):
        if isinstance(value, dict):
            for key in ("message", "failureText", "failureMessage", "failureDescription", "errorMessage"):
                message = value.get(key)
                if isinstance(message, str):
                    messages.append(message)
                elif isinstance(message, dict) and isinstance(message.get("_value"), str):
                    messages.append(message["_value"])
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)
    visit(document)
    found = codes("\n".join(messages))
    print("IOS_PRIVATE_ISSUE_CODES:", ",".join(found) or "IOS_UNCLASSIFIED_TEST_ISSUE")
    print("IOS_PRIVATE_ISSUE_MESSAGE_COUNT:", len(messages))
    domains = ("XCTestErrorDomain", "XCTest.XCTestError", "NSCocoaErrorDomain",
               "NSPOSIXErrorDomain", "FBSOpenApplicationServiceErrorDomain",
               "RBSRequestErrorDomain", "AXError", "DTXProxyChannel")
    for domain in domains:
        for number in sorted(set(re.findall(re.escape(domain) + r"(?:\s+error\s+|\s+Code=\s*|\s*,?\s*code\s*[:=]\s*)(-?[0-9]{1,6})", "\n".join(messages)))):
            print("IOS_FAILURE_DOMAIN_CODE:", domain, int(number))
    terms = {
        "TARGET": ("target",), "PATH": ("path",), "BUNDLE": ("bundle",),
        "INSTALL": ("install",), "PROCESS": ("process",), "PID": ("pid",),
        "LAUNCH": ("launch",), "APPLICATION": ("application",), "RUNNING": ("running",),
        "TIMEOUT": ("timeout", "timed out"), "IDLE": ("idle", "quiescence"),
        "SNAPSHOT": ("snapshot",), "ACCESSIBILITY": ("accessibility",),
        "ATTRIBUTES": ("attributes",), "ELEMENT": ("element",),
        "CONNECTION": ("connection",), "INTERRUPTED": ("interrupted",),
        "CONFIGURATION": ("configuration",), "EXECUTABLE": ("executable",),
        "CRASH": ("crash",), "TERMINATED": ("terminated",), "PERMISSION": ("permission",),
        "UNSUPPORTED": ("unsupported", "not supported"), "UNAVAILABLE": ("unavailable",),
        "PARAMETER": ("parameter",), "ARGUMENT": ("argument",), "ENVIRONMENT": ("environment",),
        "INVALID": ("invalid",), "SERVER": ("server",), "REQUEST": ("request",),
        "SIMULATOR": ("simulator",), "DEVICE": ("device",), "MAIN_THREAD": ("main thread",),
        "ANIMATION": ("animation",), "SCREEN": ("screen",), "DAEMON": ("daemon",),
        "OPERATION": ("operation",), "ERROR": ("error",), "FAILURE": ("failed", "failure"),
    }
    message_text = "\n".join(messages).lower()
    print("IOS_FAILURE_TERM_CODES:", ",".join(code for code, needles in terms.items()
          if any(re.search(r"\b" + re.escape(needle) + r"\b", message_text) for needle in needles)) or "NONE")
    lines = sorted(set(re.findall(r"RuntimeTests\.swift(?::|%3A|#StartingLineNumber=)([0-9]{1,5})", text)))
    for line in lines:
        print("IOS_FAILURE_SOURCE_LINE:", int(line))


def private_result(arguments):
    try:
        result = subprocess.run(["xcrun", "xcresulttool", *arguments],
                                capture_output=True, text=True, timeout=30)
        return json.loads(result.stdout) if result.returncode == 0 else None
    except (subprocess.TimeoutExpired, OSError, ValueError):
        return None


def main():
    if sys.argv[1] == "--guard-log":
        blocked = read_guard_log(sys.argv[2])
        print("HEALTH_DATA_SCREENSHOT_GUARD:", "FAIL" if blocked else "LOG_CHECK_OK")
        raise SystemExit(1 if blocked else 0)
    if sys.argv[1] == "--log":
        found = codes(Path(sys.argv[2]).read_text(errors="replace"))
        print("IOS_DIAGNOSTIC_CODES:", ",".join(found) or "IOS_EXECUTION_FAILED")
        return
    document = private_result(["get", "test-results", "summary", "--path", sys.argv[1]])
    if document is None:
        print("IOS_RESULT_SUMMARY_UNAVAILABLE")
        return
    for key in ("passedTests", "failedTests", "skippedTests", "totalTestCount"):
        value = document.get(key)
        if isinstance(value, int):
            print("IOS_TEST_COUNT:", key, value)
    found = codes(json.dumps(document))
    if found:
        print("IOS_DIAGNOSTIC_CODES:", ",".join(found))
    emit_legacy(document)
    for arguments, unavailable in (
        (["get", "object", "--legacy", "--format", "json", "--path", sys.argv[1]], "IOS_PRIVATE_ISSUE_SUMMARY_UNAVAILABLE"),
        (["get", "test-results", "test-details", "--path", sys.argv[1],
          "--test-id", "RuntimeTests/testAuthenticatedScreensAndRelaunch()"], "IOS_PRIVATE_TEST_DETAILS_UNAVAILABLE"),
    ):
        detail = private_result(arguments)
        if detail is None:
            print(unavailable)
        else:
            emit_legacy(detail)


if __name__ == "__main__":
    main()
