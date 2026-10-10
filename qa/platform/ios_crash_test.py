import importlib.util
import unittest
import json
from pathlib import Path
spec = importlib.util.spec_from_file_location("crash", Path(__file__).with_name("ios-crash-diagnostics.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class NativeCrashPrivacy(unittest.TestCase):
    def test_only_fixed_codes_leave_native_crash(self):
        document = {"procName": "DiewishQA",
                    "exception": {"type": "EXC_CRASH", "signal": "SIGABRT"},
                    "termination": {"namespace": "DYLD", "reasons": ["Library not loaded: @rpath/DiewishQA.debug.dylib private-fixture"]},
                    "health": "private-health-fixture", "credential": "private-credential-fixture"}
        codes = module.classify(document)
        self.assertIn("IOS_QA_DEBUG_DYLIB_MISSING", codes)
        self.assertNotIn("private", str(codes))
        self.assertNotIn("@rpath", str(codes))

    def test_other_processes_are_excluded(self):
        self.assertIsNone(module.classify({"procName": "Other", "exception": {"type": "EXC_CRASH"}}))

    def test_two_json_ips_records_are_supported(self):
        document = {"procName": "DiewishQA", "termination": {"namespace": "TCC"}}
        self.assertEqual(module.parse(json.dumps({"app_name": "DiewishQA"}) + "\n" + json.dumps(document)), document)

    def test_referenced_binary_is_not_misclassified_as_missing_library(self):
        document = {"procName": "DiewishQA",
                    "termination": {"namespace": "DYLD", "reasons": [
                        "Library not loaded: /usr/lib/swift/libswiftWebKit.dylib",
                        "Referenced from: /private/DiewishQA.debug.dylib"]}}
        codes = module.classify(document)
        self.assertIn("IOS_SWIFT_WEBKIT_MISSING", codes)
        self.assertNotIn("IOS_QA_DEBUG_DYLIB_MISSING", codes)
