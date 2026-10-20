"""Offline checks: never contact Google Cloud, Neon or notification providers."""
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("pause", ROOT / "scripts/staging-automation-pause.py")
pause = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pause)
SHA = "a" * 40
URL = "https://diewish-backend-staging-example.run.app"
IMAGE = f"europe-west1-docker.pkg.dev/{pause.PROJECT}/diewish-staging/backend:{SHA}"


class PauseTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.job = {"name": f"projects/{pause.PROJECT}/locations/{pause.REGION}/jobs/{pause.JOB}",
                    "state": "ENABLED", "schedule": "*/5 * * * *", "httpTarget": {
                        "httpMethod": "POST", "uri": URL + "/api/internal/scheduler/tick",
                        "oidcToken": {"audience": URL, "serviceAccountEmail": pause.RUNTIME}}}
        values = {"DIEWISH_ENVIRONMENT": "staging", "DIEWISH_APPLICATION_SHA": SHA,
                  "STAGING_AUTOMATION_ENABLED": "false", "SCHEDULER_TRIGGER_ENABLED": "true",
                  "SCHEDULER_OIDC_AUDIENCE": URL, "SCHEDULER_SERVICE_ACCOUNT_EMAIL": pause.RUNTIME,
                  "SMTP_HOST": "synthetic", "SMTP_USER": "synthetic",
                  "SMTP_PASSWORD": "synthetic", "SMTP_FROM": "test@example.invalid"}
        self.revision = {"spec": {"serviceAccountName": pause.RUNTIME, "containers": [{
            "image": IMAGE, "env": [{"name": k, "value": v} for k, v in values.items()]}]},
            "status": {"imageDigest": IMAGE + "@sha256:123"}}
        self.service = {"status": {"url": URL, "traffic": [{"revisionName": "test-revision", "percent": 100}]}}
        self.patches = [patch.dict(os.environ, {"PROJECT_ID": pause.PROJECT,
                        "GITHUB_REF": "refs/heads/feature/staging-preview", "GITHUB_SHA": SHA,
                        "PAUSE_BACKEND_BUILD": "test-build"}),
                        patch.object(pause, "command", side_effect=self.command),
                        patch.object(pause.urllib.request, "urlopen", side_effect=self.http),
                        patch("sys.stdout", new_callable=io.StringIO)]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)

    def command(self, *args):
        self.calls.append(args)
        if args[:2] == ("git", "ls-remote"):
            source = os.environ.get("PAUSE_SOURCE_SHA", SHA) if args[-1] == pause.LIVE_BRANCH else SHA
            return source + "\t" + args[-1]
        if args[:3] == ("gcloud", "run", "services"):
            return json.dumps(self.service)
        if args[:3] == ("gcloud", "run", "revisions"):
            return json.dumps(self.revision)
        if args[:3] == ("gcloud", "builds", "describe"):
            source = os.environ.get("PAUSE_SOURCE_SHA", SHA)
            return json.dumps({"status": "SUCCESS", "substitutions": {"_GIT_SHA": source},
                               "results": {"images": [{"name": IMAGE.replace(SHA, source), "digest": "sha256:123"}]}})
        if args[:3] == ("gcloud", "logging", "read"):
            return "[]"
        if args[:4] == ("gcloud", "scheduler", "jobs", "pause"):
            self.job["state"] = "PAUSED"
            return ""
        if args[:4] == ("gcloud", "scheduler", "jobs", "describe"):
            return json.dumps(self.job)
        if args[:2] in (("git", "fetch"), ("git", "diff")):
            return ""
        raise AssertionError("Unexpected control-plane operation")

    def http(self, request, **_kwargs):
        url = request if isinstance(request, str) else request.full_url
        code = 503 if url.endswith("/health/ready") else (404 if url.endswith("/tick") else (422 if url.endswith("/forgot") else 401))
        raise pause.urllib.error.HTTPError(url, code, "synthetic", None, None)

    def run_phase(self, phase):
        with patch.object(sys, "argv", ["pause", "--phase", phase]):
            pause.main()

    def mutations(self):
        return [call for call in self.calls if call[:4] == ("gcloud", "scheduler", "jobs", "pause")]

    def test_read_never_mutates(self):
        self.run_phase("read")
        self.assertFalse(self.mutations())

    def test_pause_is_idempotent_and_preserves_job(self):
        original = copy.deepcopy(self.job)
        self.run_phase("pause")
        self.run_phase("pause")
        self.assertEqual(len(self.mutations()), 1)
        original["state"] = "PAUSED"
        self.assertEqual(self.job, original)

    def test_wrong_target_blocks_before_pause(self):
        self.job["httpTarget"]["uri"] = "https://production.example/tick"
        with self.assertRaisesRegex(RuntimeError, "unexpected-scheduler-target"):
            self.run_phase("pause")
        self.assertFalse(self.mutations())

    def test_recovery_configuration_required(self):
        self.revision["spec"]["containers"][0]["env"] = [row for row in self.revision["spec"]["containers"][0]["env"] if row["name"] != "SMTP_HOST"]
        with self.assertRaisesRegex(RuntimeError, "recovery-email-config-missing"):
            self.run_phase("pause")
        self.assertFalse(self.mutations())

    def test_moving_head_blocks(self):
        with patch.dict(os.environ, {"GITHUB_SHA": "b" * 40}):
            with self.assertRaisesRegex(RuntimeError, "staging-head-moved"):
                self.run_phase("pause")
        self.assertFalse(self.mutations())

    def test_non_staging_blocks(self):
        with patch.dict(os.environ, {"GITHUB_REF": "refs/heads/main"}):
            with self.assertRaisesRegex(RuntimeError, "non-staging-context"):
                self.run_phase("pause")
        self.assertFalse(self.calls)

    def test_schema_precheck_has_no_db_access(self):
        self.run_phase("pre")
        self.assertTrue(any(call[:2] == ("git", "diff") for call in self.calls))
        self.assertFalse(self.mutations())

    def test_live_backport_requires_unchanged_account_and_schema_trees(self):
        source = "b" * 40
        for row in self.revision["spec"]["containers"][0]["env"]:
            if row["name"] == "DIEWISH_APPLICATION_SHA":
                row["value"] = pause.LIVE_BASE
        with patch.dict(os.environ, {"PAUSE_SOURCE_SHA": source}):
            self.run_phase("pre")
        self.assertTrue(any(call[:2] == ("git", "diff") and "backend/src/modules/account" in call for call in self.calls))
        self.assertFalse(self.mutations())

    def test_live_backport_refuses_to_overwrite_newer_serving_features(self):
        with patch.dict(os.environ, {"PAUSE_SOURCE_SHA": "b" * 40}):
            with self.assertRaisesRegex(RuntimeError, "serving-source-changed-backport-would-overwrite"):
                self.run_phase("pre")
        self.assertFalse(self.mutations())

    def test_live_backport_pause_preserves_legacy_request_recovery_without_assuming_smtp(self):
        source = "b" * 40
        rows = self.revision["spec"]["containers"][0]["env"]
        for row in rows:
            if row["name"] == "DIEWISH_APPLICATION_SHA":
                row["value"] = source
        self.revision["spec"]["containers"][0]["env"] = [row for row in rows if not row["name"].startswith("SMTP_")]
        with patch.dict(os.environ, {"PAUSE_SOURCE_SHA": source}):
            self.run_phase("pause")
        self.assertEqual(self.job["state"], "PAUSED")

    def test_deploy_cannot_resume_or_force_run(self):
        workflow = (ROOT / ".github/workflows/staging-preview.yml").read_text()
        self.assertIn("STAGING_AUTOMATION_ENABLED=false", workflow)
        self.assertIn("staging-automation-pause.py --phase pause", workflow)
        self.assertNotIn("gcloud scheduler jobs run", workflow)
        self.assertNotIn("gcloud scheduler jobs resume", workflow)
        self.assertNotIn("gcloud scheduler jobs create", workflow)
        build = (ROOT / ".github/cloudbuild/backend-staging-automation-pause.yaml").read_text()
        self.assertNotIn("secretEnv", build)
        self.assertNotIn("prisma migrate", build)


if __name__ == "__main__":
    unittest.main()
