"""Private Xcode environment material; never print credentials or persist in artifacts."""
import os
import plistlib
import sys
from pathlib import Path

SECRET_KEYS = ("QA_EMAIL", "QA_PASSWORD", "QA_SYNTHETIC_ACCOUNT", "QA_ACCOUNT_ID", "QA_ACCOUNT_HMAC_KEY")

def inject(directory):
    files = list(Path(directory).glob("Build/Products/*.xctestrun"))
    if len(files) != 1:
        raise RuntimeError("ONE_XCTESTRUN_REQUIRED")
    with files[0].open("rb") as stream:
        document = plistlib.load(stream)
    def visit(value):
        if isinstance(value, dict):
            if "TestBundlePath" in value:
                env = {key: os.environ[key] for key in SECRET_KEYS if key in os.environ}
                for field in ("EnvironmentVariables", "UITestingEnvironmentVariables"):
                    value.setdefault(field, {}).update(env)
            for child in list(value.values()):
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)
    visit(document)
    # Absolute locations stay valid after the xctestrun moves one directory up.
    def paths(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if isinstance(child, str):
                    value[key] = child.replace("__TESTROOT__", str(files[0].parent.resolve()))
                else:
                    paths(child)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                if isinstance(child, str):
                    value[index] = child.replace("__TESTROOT__", str(files[0].parent.resolve()))
                else:
                    paths(child)
    paths(document)
    out = Path(directory).parent / "qa.xctestrun"
    with out.open("wb") as stream:
        plistlib.dump(document, stream)
    out.chmod(0o600)


STAGES = {"SIMULATOR_BOOT", "BUILD", "INSTALL", "XCODE_TESTS",
          "ATTACHMENT_EXPORT", "CLEANUP_SHUTDOWN", "CLEANUP_DELETE"}

def run_command(stage, timeout, log, command):
    """Bound the existing command; stdout and command arguments stay private."""
    import signal
    import subprocess
    import threading
    import re
    if stage not in STAGES or not 0 < timeout <= 600 or not command:
        raise SystemExit("IOS_COMMAND_CONFIGURATION_INVALID")
    print("IOS_STAGE", stage, "RUNNING", flush=True)
    with os.fdopen(os.open(log, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "wb") as stream:
        os.fchmod(stream.fileno(), 0o600)
        process = subprocess.Popen(command, stdout=stream, stderr=subprocess.STDOUT,
                                   start_new_session=True)
        stopped = threading.Event()
        def progress():
            # The existing private log remains private. Only literal stage enums
            # are mirrored; no XCTest actions, messages, arguments or values.
            try:
                with Path(log).open("rb") as reader:
                    pending = b""
                    while True:
                        chunk = reader.read(8192)
                        if chunk:
                            pending += chunk
                            lines = pending.split(b"\n")
                            pending = lines.pop()[-512:]
                            for line in lines:
                                for phase, status in re.findall(
                                    rb"IOS_STAGE (TEST_SETUP|APP_CONFIGURATION|APP_LAUNCH|AUTH_LOGIN|HEALTH_GUARD_PREPARE|HEALTH_GUARD_CAPTURE|HEALTH_GUARD) (RUNNING|PASS|FAIL)", line):
                                    print("IOS_STAGE", phase.decode("ascii"), status.decode("ascii"), flush=True)
                                for reason in re.findall(rb"IOS_GUARD_REASON (READY|WAITING|ACCOUNT_UNVERIFIED|HEALTH_DATA_SCREENSHOT_GUARD_FAIL|NONE|MASK_SCRIPT_MISSING|PREPARE_FAILED|MASK_NOT_ACTIVE|VIEWPORT_CHANGED|FONT_CHANGED|DOCUMENT_MUTATION|JS_EVALUATION_FAILED|UNAVAILABLE)\b", line):
                                    print("IOS_GUARD_REASON", reason.decode("ascii"), flush=True)
                                for detail in re.findall(rb"IOS_GUARD_FONT_DETAIL (NONE|FONT_LOADING|FONT_COUNT|FONT_REFERENCE|FONT_FAMILY|FONT_STYLE|FONT_WEIGHT|FONT_STRETCH|FONT_UNICODE_RANGE|FONT_VARIANT|FONT_FEATURES|FONT_GEOMETRY|FONT_STATUS(?:_LOADED_UNLOADED|_LOADED_LOADING|_UNLOADED_LOADED|_UNLOADED_LOADING|_LOADING_LOADED|_LOADING_ERROR)?)\b", line):
                                    print("IOS_GUARD_FONT_DETAIL", detail.decode("ascii"), flush=True)
                        elif stopped.is_set():
                            break
                        else:
                            stopped.wait(0.2)
            except OSError:
                print("IOS_PROGRESS_LOG_UNAVAILABLE", flush=True)
        thread = threading.Thread(target=progress, daemon=True) if stage == "XCODE_TESTS" else None
        if thread:
            thread.start()
        try:
            code = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            for sig in (signal.SIGTERM, signal.SIGKILL):
                try:
                    os.killpg(process.pid, sig)
                except ProcessLookupError:
                    pass
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    pass
            stopped.set()
            if thread:
                thread.join(timeout=2)
            print("IOS_STAGE", stage, "TIMEOUT", flush=True)
            return 124
        stopped.set()
        if thread:
            thread.join(timeout=2)
    print("IOS_STAGE", stage, "PASS" if code == 0 else "FAIL", flush=True)
    return code if code >= 0 else 1

if __name__ == "__main__":
    if sys.argv[1] == "run":
        raise SystemExit(run_command(sys.argv[2], float(sys.argv[3]), sys.argv[4], sys.argv[5:]))
    if sys.argv[1] != "inject":
        raise SystemExit("UNSUPPORTED_OPERATION")
    inject(sys.argv[2])
