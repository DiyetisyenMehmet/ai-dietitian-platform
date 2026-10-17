"""Offline workflow regression checks. Never execute deploy, browser or APK commands."""

import ast
import itertools
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = yaml.load(
    (ROOT / ".github/workflows/staging-preview.yml").read_text(),
    Loader=yaml.BaseLoader,  # YAML 1.1 must not turn the GitHub `on` key into True.
)
JOBS = WORKFLOW["jobs"]


def condition(expression, *, event="workflow_dispatch", qa=False, apk=False,
              deploy="success", message=""):
    """Evaluate only the boolean subset used by this workflow's job gates.

    This is a planning simulation, not a replacement for GitHub's runner.
    Unknown syntax fails closed; shell/cloud steps are never executed.
    """
    expression = expression.removeprefix("${{").removesuffix("}}").strip()
    values = {
        "github.event.head_commit.message": message,
        "github.event_name": event,
        "github.ref": "refs/heads/feature/staging-preview",
        "inputs.run_live_acceptance_tests": qa,
        "inputs.build_android_apk": apk,
        "needs.deploy-staging.result": deploy,
    }
    for key, value in values.items():
        expression = expression.replace(key, repr(value))
    expression = expression.replace("&&", " and ").replace("||", " or ")
    tree = ast.parse(expression, mode="eval")

    def evaluate(node):
        if isinstance(node, ast.Expression):
            return evaluate(node.body)
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.BoolOp):
            values = [evaluate(value) for value in node.values]
            return all(values) if isinstance(node.op, ast.And) else any(values)
        if isinstance(node, ast.Compare) and len(node.ops) == 1:
            left, right = evaluate(node.left), evaluate(node.comparators[0])
            if isinstance(node.ops[0], ast.Eq):
                return left == right
            if isinstance(node.ops[0], ast.NotEq):
                return left != right
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id == "always" and not node.args:
                return True
            if node.func.id == "contains" and len(node.args) == 2:
                return evaluate(node.args[1]) in evaluate(node.args[0])
        raise AssertionError(f"Unsupported workflow condition node: {type(node).__name__}")

    return bool(evaluate(tree))


class ReleaseOptionsTests(unittest.TestCase):
    def test_manual_input_defaults_are_boolean_and_off(self):
        inputs = WORKFLOW["on"]["workflow_dispatch"]["inputs"]
        self.assertEqual(set(inputs), {"run_live_acceptance_tests", "build_android_apk"})
        for value in inputs.values():
            self.assertEqual(value["type"], "boolean")
            self.assertEqual(value["default"], "false")
            self.assertEqual(value["required"], "false")

    def test_all_four_manual_choices_are_independent(self):
        for qa, apk in itertools.product((False, True), repeat=2):
            with self.subTest(qa=qa, apk=apk):
                options = dict(qa=qa, apk=apk)
                self.assertTrue(condition(JOBS["deploy-staging"]["if"], **options))
                self.assertEqual(condition(JOBS["live-acceptance"]["if"], **options), qa)
                self.assertEqual(condition(JOBS["staging-apk"]["if"], **options), apk)
        for job in ("live-acceptance", "staging-apk"):
            self.assertEqual(JOBS[job]["needs"], "deploy-staging")
            self.assertNotIn("continue-on-error", JOBS[job])

    def test_push_cannot_opt_into_live_writes_or_apk(self):
        for message in ("ordinary merge", "[deploy-staging]", "[nutrition-staging-verify]"):
            for job in ("live-acceptance", "staging-apk"):
                with self.subTest(message=message, job=job):
                    self.assertFalse(condition(JOBS[job]["if"], event="push", message=message,
                                               qa=True, apk=True))
        self.assertTrue(condition(JOBS["deploy-staging"]["if"], event="push",
                                  message="[deploy-staging]"))
        self.assertFalse(condition(JOBS["deploy-staging"]["if"], event="push"))

    def test_failed_or_skipped_deploy_blocks_both_optional_jobs(self):
        for result in ("failure", "cancelled", "skipped"):
            for job in ("live-acceptance", "staging-apk"):
                with self.subTest(result=result, job=job):
                    self.assertFalse(condition(JOBS[job]["if"], qa=True, apk=True,
                                               deploy=result))
            self.assertTrue(condition(JOBS["release-summary"]["if"], deploy=result))

    def test_mandatory_guards_are_not_optional(self):
        steps = JOBS["deploy-staging"]["steps"]
        names = [step.get("name") for step in steps]
        required = (
            "Wait for exact-SHA pre-deploy CI gates",
            "Validate staging contract",
            "Verify staging-only Google Cloud resources",
            "Verify nutrition remains disabled before staging changes",
            "Verify serving images and disabled nutrition policy",
            "Verify staging health and Authentication runtime",
            "Export verified staging runtime",
        )
        for name in required:
            step = steps[names.index(name)]
            self.assertNotIn("if", step)
            self.assertNotIn("continue-on-error", step)
        text = "\n".join(step.get("run", "") for step in steps)
        for contract in (
            'required=("Hardening CI" "Staging Config CI" "Notification preferences platform checks")',
            "head_sha=${GITHUB_SHA}", "--phase pre", "--phase post",
            '--backend-build "$BACKEND_BUILD_ID" --frontend-build "$FRONTEND_BUILD_ID"',
            "NUTRITION_JOBS_ENABLED=false", "DIEWISH_APPLICATION_SHA=${GITHUB_SHA}",
            "REFRESH_COOKIE_SAME_SITE=lax", "access-control-allow-origin:",
            "/api/health", "/api/identity/firebase-config", "accounts:createAuthUri",
        ):
            self.assertIn(contract, text)
        self.assertLess(names.index(required[0]), names.index("Deploy backend staging service"))
        self.assertEqual(JOBS["deploy-staging"]["environment"], "staging")
        self.assertEqual(WORKFLOW["env"]["BACKEND_SERVICE"], "diewish-backend-staging")
        self.assertEqual(WORKFLOW["env"]["FRONTEND_SERVICE"], "diewish-frontend-staging")

    def test_live_suites_and_build_only_exist_in_opt_in_jobs(self):
        for name, job in JOBS.items():
            commands = "\n".join(step.get("run", "") for step in job["steps"])
            if "npx playwright test" in commands:
                self.assertEqual(name, "live-acceptance")
            if "assembleDebug" in commands or "sdkmanager" in commands:
                self.assertEqual(name, "staging-apk")
            if any(step.get("uses") == "actions/upload-artifact@v4" for step in job["steps"]):
                self.assertIn(name, ("live-acceptance", "staging-apk"))
        qa = "\n".join(s.get("run", "") for s in JOBS["live-acceptance"]["steps"])
        for suite in ("dashboard-edit-sanity", "journey-compact", "staging-notification-sanity",
                      "mascot-preferences", "staging-nutrition-disabled-sanity"):
            self.assertIn(f"e2e/{suite}.spec.ts", qa)
        apk = "\n".join(s.get("run", "") for s in JOBS["staging-apk"]["steps"])
        self.assertIn('test "${DIEWISH_ANDROID_FCM_STATUS:-}" = "verified"', apk)
        self.assertIn(":app:testDebugUnitTest :app:assembleDebug", apk)

    def test_every_embedded_shell_script_parses_without_execution(self):
        for job_name, job in JOBS.items():
            for step in job["steps"]:
                if "run" in step:
                    with self.subTest(job=job_name, step=step.get("name")):
                        subprocess.run(["bash", "-n"], input=step["run"], text=True,
                                       check=True, capture_output=True)

    def test_actual_summary_script_reports_results_without_false_pass(self):
        summary = JOBS["release-summary"]
        self.assertIn("always()", summary["if"])
        self.assertEqual(set(summary["needs"]), {"deploy-staging", "live-acceptance", "staging-apk"})
        script = summary["steps"][0]["run"]
        labels = {"success": "PASS", "failure": "FAIL", "skipped": "NOT RUN",
                  "cancelled": "CANCELLED"}
        for deploy, qa, apk in itertools.product(labels, repeat=3):
            with self.subTest(deploy=deploy, qa=qa, apk=apk), tempfile.TemporaryDirectory() as tmp:
                output = Path(tmp) / "summary.md"
                env = dict(os.environ, DEPLOY_RESULT=deploy, LIVE_QA_RESULT=qa, APK_RESULT=apk,
                           GITHUB_STEP_SUMMARY=str(output), GITHUB_SHA="offline-fixture-sha",
                           GITHUB_RUN_NUMBER="1", FRONTEND_URL="https://frontend.invalid",
                           CANONICAL_FRONTEND_URL="https://canonical.invalid",
                           CUSTOM_FRONTEND_URL="https://custom.invalid", BACKEND_URL="https://backend.invalid",
                           ADMIN_STAGING_URL="https://admin.invalid", DIEWISH_STAGING_SMS_REGIONS="TR")
                subprocess.run(["bash", "-e", "-o", "pipefail", "-c", script], env=env,
                               text=True, check=True, capture_output=True)
                report = output.read_text()
                self.assertIn(f"mandatory verification: {labels[deploy]}\n", report)
                self.assertIn(f"synthetic accounts and AI plan): {labels[qa]}\n", report)
                self.assertIn(f"Android test APK: {labels[apk]}\n", report)
                self.assertEqual("APK artifact:" in report, apk == "success")
                self.assertEqual("Backend: https://backend.invalid" in report, deploy == "success")


if __name__ == "__main__":
    unittest.main(verbosity=2)
