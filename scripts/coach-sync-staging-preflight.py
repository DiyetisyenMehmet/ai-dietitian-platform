"""Read-only Coach activation preflight; never reads secret payloads or user data."""
import argparse
import json
import os
import subprocess

PROJECT = "project-a2e260c1-839d-4f1d-b90"
REGION = "europe-west1"
SERVICE = "diewish-backend-staging"
RUNTIME = f"diewish-staging-runtime@{PROJECT}.iam.gserviceaccount.com"


def command(*args):
    result = subprocess.run(args, capture_output=True, text=True, check=False, timeout=45)
    if result.returncode:
        raise RuntimeError("staging-cli-unavailable")
    return result.stdout.strip()


def report(check, **values):
    print("COACH_PREFLIGHT_" + json.dumps({"check": check, **values}, sort_keys=True), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=["deployer", "build"], required=True)
    phase = parser.parse_args().phase
    if os.environ.get("PROJECT_ID") != PROJECT:
        raise RuntimeError("non-staging-project")
    if os.environ.get("GITHUB_REF") != "refs/heads/feature/staging-preview":
        raise RuntimeError("non-staging-ref")
    if phase == "build":
        report("activation", state="NO_EXTRA_PERMISSION_REQUIRED",
               transport="application-pool-revisions",
               note="No listener account, new secret or secret write permission required")
        return
    account = command("gcloud", "auth", "list", "--filter=status:ACTIVE", "--format=value(account)")
    report("identity", phase=phase, account=account, project=PROJECT)
    if phase == "deployer":
        service = json.loads(command(
            "gcloud", "run", "services", "describe", SERVICE,
            "--project", PROJECT, "--region", REGION, "--format=json",
        ))
        spec = service["spec"]["template"]["spec"]
        if spec.get("serviceAccountName") != RUNTIME:
            raise RuntimeError("unexpected-staging-runtime-identity")
        container = spec["containers"][0]
        env = {item["name"]: item for item in container.get("env", [])}
        if env.get("DIEWISH_ENVIRONMENT", {}).get("value") != "staging":
            raise RuntimeError("runtime-not-staging")
        report("serving-runtime", revision=service["status"].get("latestReadyRevisionName"),
               applicationSha=env.get("DIEWISH_APPLICATION_SHA", {}).get("value"),
               image=container.get("image"),
               syncEnabled=env.get("COACH_SYNC_ENABLED", {}).get("value", "false"),
               transport="application-pool-revisions",
               obsoleteListenerSettingPresent="COACH_SYNC_DATABASE_URL" in env,
               concurrency=spec.get("containerConcurrency"),
               timeout=spec.get("timeoutSeconds"),
               limits=container.get("resources", {}).get("limits"))
        report("activation", state="READ_ONLY_REVIEW",
               note="Keep COACH_SYNC_ENABLED false until separate activation approval")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.TimeoutExpired, KeyError, ValueError) as error:
        # Never print arbitrary command output, exception text or credentials.
        report("activation", state="BLOCKED", reason=type(error).__name__)
        raise SystemExit(2)
