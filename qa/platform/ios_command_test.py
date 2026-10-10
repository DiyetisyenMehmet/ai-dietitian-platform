import importlib.util
import unittest
import tempfile
import io
import sys
from contextlib import redirect_stdout
from pathlib import Path
spec = importlib.util.spec_from_file_location("ios_private", Path(__file__).with_name("ios-private.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class NativeCommandBounds(unittest.TestCase):
    def invoke(self, script, timeout=2):
        with tempfile.TemporaryDirectory() as directory:
            log = Path(directory) / "private.log"
            output = io.StringIO()
            with redirect_stdout(output):
                result = module.run_command("XCODE_TESTS", timeout, log, [sys.executable, "-c", script])
            return result, output.getvalue(), log.read_text()

    def test_success_and_failure_keep_raw_output_private(self):
        result, output, private = self.invoke("print('private-fixture'); raise SystemExit(7)")
        self.assertEqual(result, 7)
        self.assertIn("IOS_STAGE XCODE_TESTS FAIL", output)
        self.assertNotIn("private-fixture", output)
        self.assertIn("private-fixture", private)
        result, output, _ = self.invoke("print('private-fixture')")
        self.assertEqual(result, 0)
        self.assertIn("IOS_STAGE XCODE_TESTS PASS", output)

    def test_timeout_is_bounded_and_never_passes(self):
        result, output, _ = self.invoke("import time; time.sleep(10)", 0.05)
        self.assertEqual(result, 124)
        self.assertIn("IOS_STAGE XCODE_TESTS TIMEOUT", output)
        self.assertNotIn("PASS", output)

    def test_only_literal_xctest_progress_is_mirrored(self):
        result, output, private = self.invoke("print('private-fixture'); print('IOS_STAGE APP_LAUNCH RUNNING')")
        self.assertEqual(result, 0)
        self.assertIn("IOS_STAGE APP_LAUNCH RUNNING", output)
        self.assertNotIn("private-fixture", output)

    def test_guard_progress_rejects_unknown_values(self):
        result, output, _ = self.invoke("print('IOS_GUARD_REASON ACCOUNT_UNVERIFIED'); print('IOS_GUARD_REASON private-fixture')")
        self.assertEqual(result, 0)
        self.assertIn("IOS_GUARD_REASON ACCOUNT_UNVERIFIED", output)
        self.assertNotIn("private-fixture", output)

    def test_mask_failure_reason_and_font_detail_are_mirrored(self):
        result, output, _ = self.invoke("print('IOS_GUARD_REASON FONT_CHANGED'); print('IOS_GUARD_FONT_DETAIL FONT_STATUS_LOADED_LOADING')")
        self.assertEqual(result, 0)
        self.assertIn("IOS_GUARD_REASON FONT_CHANGED\n", output)
        self.assertIn("IOS_GUARD_FONT_DETAIL FONT_STATUS_LOADED_LOADING\n", output)

    def test_guard_diagnostics_reject_allowlisted_prefixes_with_unknown_suffixes(self):
        result, output, private = self.invoke("print('IOS_GUARD_REASON ACCOUNT_UNVERIFIED_PRIVATE'); print('IOS_GUARD_REASON FONT_CHANGED_PRIVATE'); print('IOS_GUARD_FONT_DETAIL FONT_STATUS_PRIVATE'); print('IOS_GUARD_FONT_DETAIL FONT_STATUS_LOADED_LOADING_PRIVATE'); print('IOS_GUARD_FONT_DETAIL private-fixture')")
        self.assertEqual(result, 0)
        self.assertNotIn("IOS_GUARD_REASON", output)
        self.assertNotIn("IOS_GUARD_FONT_DETAIL", output)
        self.assertNotIn("private-fixture", output)
        self.assertIn("ACCOUNT_UNVERIFIED_PRIVATE", private)
