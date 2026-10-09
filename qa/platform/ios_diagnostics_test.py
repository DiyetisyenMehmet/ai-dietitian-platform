import importlib.util
import unittest
import tempfile
import io
from contextlib import redirect_stdout
from pathlib import Path

spec = importlib.util.spec_from_file_location("diagnostics", Path(__file__).with_name("ios-result-summary.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DiagnosticsSafety(unittest.TestCase):
    def test_only_fixed_codes_leave_a_raw_failure(self):
        raw = 'Failed to launch test runner: code signature invalid; person@example.com password=private Bearer secret'
        self.assertEqual(module.codes(raw), ["IOS_CODE_SIGNATURE_INVALID", "IOS_LAUNCH_FAILED", "IOS_TEST_RUNNER_FAILED"])
        self.assertNotIn("private", str(module.codes(raw)))

    def test_unknown_messages_are_not_exported(self):
        self.assertEqual(module.codes('typed person@example.com secret'), [])

    def test_guard_log_is_portable_and_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.log"
            self.assertTrue(module.read_guard_log(path))
            path.write_text("IOS_STAGE APP_LAUNCH PASS")
            self.assertFalse(module.read_guard_log(path))
            path.write_text("HEALTH_DATA_SCREENSHOT_GUARD_FAIL private value")
            self.assertTrue(module.read_guard_log(path))

    def test_private_issue_summary_exports_only_fixed_codes_and_source_line(self):
        output = io.StringIO()
        with redirect_stdout(output):
            module.emit_legacy({"message": "No target application path specified person@example.com password=private",
                                "url": "file:///private/RuntimeTests.swift#StartingLineNumber=82"})
        self.assertEqual(output.getvalue(), "IOS_PRIVATE_ISSUE_CODES: IOS_TARGET_PATH_MISSING\nIOS_FAILURE_SOURCE_LINE: 82\n")
