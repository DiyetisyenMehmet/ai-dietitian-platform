"""Export only fixed native QA crash classes, never crash reports or messages."""
import json
import re
from pathlib import Path

PROCESSES = {"DiewishQA", "DiewishQAUITests-Runner"}
EXCEPTIONS = {"EXC_BAD_ACCESS", "EXC_CRASH", "EXC_BREAKPOINT", "EXC_RESOURCE", "EXC_GUARD"}
SIGNALS = {"SIGABRT", "SIGSEGV", "SIGILL", "SIGBUS", "SIGKILL", "SIGTRAP"}
NAMESPACES = {"DYLD", "CODESIGNING", "TCC", "RUNNINGBOARD", "FRONTBOARD", "SPRINGBOARD", "SIGNAL"}
FRAMES = {"QA_VIEW_CONTROLLER": "ShellViewController", "QA_APP_DELEGATE": "AppDelegate",
          "QA_UI_TEST": "RuntimeTests", "AUTO_LAYOUT": "NSLayoutConstraint",
          "WEBKIT": "WKWebView", "SWIFT_RUNTIME": "swift_"}

def classify(document):
    if document.get("procName") not in PROCESSES:
        return None
    exception = document.get("exception", {})
    termination = document.get("termination", {})
    codes = []
    kind = exception.get("type")
    signal = exception.get("signal")
    namespace = termination.get("namespace")
    if kind in EXCEPTIONS:
        codes.append("IOS_CRASH_" + kind)
    if signal in SIGNALS:
        codes.append("IOS_CRASH_" + signal)
    if namespace in NAMESPACES:
        codes.append("IOS_CRASH_NAMESPACE_" + namespace)
    reason = json.dumps(termination)
    if namespace == "DYLD" and "Library not loaded" in reason:
        codes.append("IOS_DYLD_LIBRARY_MISSING")
        missing = re.findall(r'Library not loaded:\s*([^\s"\\]+)', reason)
        libraries = {Path(path).name for path in missing}
        if "DiewishQA.debug.dylib" in libraries:
            codes.append("IOS_QA_DEBUG_DYLIB_MISSING")
        if any(name.startswith("libswift") for name in libraries):
            codes.append("IOS_SWIFT_RUNTIME_MISSING")
        if "libswiftWebKit.dylib" in libraries:
            codes.append("IOS_SWIFT_WEBKIT_MISSING")
    if termination.get("code") == 0x8badf00d:
        codes.append("IOS_NATIVE_WATCHDOG")
    # ASI is inspected privately; only exact static reason categories leave.
    information = json.dumps(document.get("asi", {}))
    for code, phrase in {
        "IOS_NATIVE_UNRECOGNIZED_SELECTOR": "unrecognized selector",
        "IOS_NATIVE_INVALID_ARGUMENT": "NSInvalidArgumentException",
        "IOS_NATIVE_INTERNAL_INCONSISTENCY": "NSInternalInconsistencyException",
        "IOS_NATIVE_PRIVACY_USAGE_DESCRIPTION": "usage description",
        "IOS_NATIVE_CAMERA_USAGE_DESCRIPTION": "NSCameraUsageDescription",
        "IOS_NATIVE_MICROPHONE_USAGE_DESCRIPTION": "NSMicrophoneUsageDescription",
    }.items():
        if phrase in information:
            codes.append(code)
    frames = json.dumps(document.get("lastExceptionBacktrace", []))
    for code, symbol in FRAMES.items():
        if symbol in frames:
            codes.append("IOS_CRASH_FRAME_" + code)
    return codes or ["IOS_NATIVE_CRASH_UNCLASSIFIED"]

def parse(text):
    # Apple IPS has a metadata JSON header followed by the report JSON.
    decoder = json.JSONDecoder()
    remaining = text.lstrip()
    for _ in range(2):
        document, offset = decoder.raw_decode(remaining)
        if isinstance(document, dict) and document.get("procName") in PROCESSES:
            return document
        remaining = remaining[offset:].lstrip()
        if not remaining:
            break
    return None

def main():
    directory = Path.home() / "Library/Logs/DiagnosticReports"
    files = sorted(directory.glob("DiewishQA*.ips"), key=lambda p: p.stat().st_mtime, reverse=True)[:10]
    count = 0
    for path in files:
        try:
            document = parse(path.read_text(errors="replace"))
            codes = classify(document) if document else None
        except (OSError, ValueError, TypeError):
            print("IOS_NATIVE_CRASH_METADATA_UNAVAILABLE")
            continue
        if codes is not None:
            count += 1
            print("IOS_NATIVE_CRASH_CODES:", ",".join(codes))
    print("IOS_NATIVE_CRASH_COUNT:", count)

if __name__ == "__main__":
    main()
