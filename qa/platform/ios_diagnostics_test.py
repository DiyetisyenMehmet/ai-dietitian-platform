import importlib.util
import unittest
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
