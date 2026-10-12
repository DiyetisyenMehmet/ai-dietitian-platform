import importlib.util
import io
import json
import os
import sys
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("admin_password_config", Path(__file__).with_name("configure-admin-password-staging.py"))
config = importlib.util.module_from_spec(spec)
spec.loader.exec_module(config)

FILTER = 'resource.type="cloud_run_revision" AND resource.labels.service_name="diewish-frontend-staging" AND (httpRequest.requestUrl =~ "/auth/action[?]" OR httpRequest.requestUrl =~ "/admin/reset-password[?]")'


class ProtectedStagingCallbackTests(unittest.TestCase):
    def run_config(self, sinks=None, denied=None, expected_error=None):
        methods = []
        current = {"notification": {"sendEmail": {"callbackUri": "https://staging.firebaseapp.com/__/auth/action"}}, "signIn": {"phoneNumber": {"enabled": True}}}

        def request(req, **_kwargs):
            methods.append((req.get_method(), req.full_url))
            if denied and denied in req.full_url:
                raise urllib.error.HTTPError(req.full_url, 403, "Forbidden", {}, io.BytesIO(json.dumps({"error": {"status": "PERMISSION_DENIED", "message": "Permission logging.sinks.list denied; private-user-value"}}).encode()))
            if "/exclusions/" in req.full_url:
                value = {"filter": FILTER, "disabled": False}
            elif "/sinks" in req.full_url:
                value = {"sinks": sinks or [{"name": "_Default"}, {"name": "_Required"}]}
            elif req.get_method() == "PATCH":
                self.assertEqual(req.full_url.split("?", 1)[1], "updateMask=notification.sendEmail.callbackUri")
                self.assertEqual(json.loads(req.data), {"notification": {"sendEmail": {"callbackUri": config.CALLBACK}}})
                current["notification"]["sendEmail"]["callbackUri"] = config.CALLBACK
                value = current
            else:
                value = current
            return io.BytesIO(json.dumps(value).encode())

        output = io.StringIO()
        with patch.dict(os.environ, {"PROJECT_ID": config.PROJECT, "GITHUB_REF_NAME": "feature/staging-preview"}), patch.object(sys, "argv", ["config", "--apply"]), patch.object(config.subprocess, "run", return_value=type("Result", (), {"stdout": "synthetic-access-token"})()), patch.object(config.urllib.request, "urlopen", side_effect=request), patch("sys.stdout", output):
            if expected_error:
                with self.assertRaises(SystemExit) as error:
                    config.main()
                self.assertIn(expected_error, str(error.exception))
                self.assertNotIn("private-user-value", str(error.exception))
                self.assertFalse(any(method == "PATCH" for method, _url in methods))
            else:
                config.main()
                self.assertEqual(sum(method == "PATCH" for method, _url in methods), 1)
                self.assertIn("ADMIN_PASSWORD_CALLBACK_PASS", output.getvalue())
        self.assertNotIn("synthetic-access-token", output.getvalue())

    def test_logging_permission_failure_prevents_firebase_mutation(self):
        self.run_config(denied="/exclusions/", expected_error="PERMISSION_DENIED")

    def test_unverified_exports_prevent_firebase_mutation(self):
        self.run_config(denied="/sinks", expected_error="logging.sinks.list")

    def test_unprotected_custom_export_prevents_firebase_mutation(self):
        self.run_config(sinks=[{"name": "custom-export"}], expected_error="custom log export")

    def test_disabled_protection_prevents_firebase_mutation(self):
        self.run_config(sinks=[{"name": "custom-export", "exclusions": [{"filter": FILTER, "disabled": True}]}], expected_error="custom log export")

    def test_protected_exports_allow_only_callback_change(self):
        self.run_config(sinks=[{"name": "custom-export", "exclusions": [{"filter": FILTER}]}])

    def test_default_router_allows_only_callback_change(self):
        self.run_config()


if __name__ == "__main__":
    unittest.main()
