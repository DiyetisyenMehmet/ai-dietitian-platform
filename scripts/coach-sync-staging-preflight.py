"""Read-only Coach activation preflight; never reads secret payloads or user data."""
import argparse
import json
import os
import subprocess
import urllib.error
import urllib.request

PROJECT = "project-a2e260c1-839d-4f1d-b90"
REGION = "europe-west1"
SERVICE = "diewish-backend-staging"
RUNTIME = f"diewish-staging-runtime@{PROJECT}.iam.gserviceaccount.com"
DATABASE_SECRET = "diewish-staging-database-url"
MIGRATION_SECRET = "diewish-staging-direct-database-url"


def command(*args):
    result = subprocess.run(args, capture_output=True, text=True, check=False, timeout=45)
    if result.returncode:
        raise RuntimeError("staging-cli-unavailable")
    return result.stdout.strip()


def report(check, **values):
    print("COACH_PREFLIGHT_" + json.dumps({"check": check, **values}, sort_keys=True), flush=True)


def permissions(token, secret, requested):
    request = urllib.request.Request(
        f"https://secretmanager.googleapis.com/v1/projects/{PROJECT}/secrets/{secret}:testIamPermissions",
        data=json.dumps({"permissions": requested}).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            granted = set(json.load(response).get("permissions", []))
    except urllib.error.HTTPError as error:
        report("secret-permissions", secret=secret, state="UNKNOWN", httpStatus=error.code)
        return False
    except (urllib.error.URLError, TimeoutError, ValueError):
        report("secret-permissions", secret=secret, state="UNKNOWN")
        return False
    missing = sorted(set(requested) - granted)
    report("secret-permissions", secret=secret, granted=sorted(granted), missing=missing)
    return not missing


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=["deployer", "build"], required=True)
    phase = parser.parse_args().phase
    if os.environ.get("PROJECT_ID") != PROJECT:
        raise RuntimeError("non-staging-project")
    if os.environ.get("GITHUB_REF") != "refs/heads/feature/staging-preview":
        raise RuntimeError("non-staging-ref")
    token = command("gcloud", "auth", "print-access-token")
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
               listenerConfigured="COACH_SYNC_DATABASE_URL" in env,
               concurrency=spec.get("containerConcurrency"),
               timeout=spec.get("timeoutSeconds"),
               limits=container.get("resources", {}).get("limits"))
        permissions(token, DATABASE_SECRET, ["secretmanager.versions.add"])
        build_identity = command("gcloud", "builds", "get-default-service-account", "--project", PROJECT)
        report("build-identity", account=build_identity)
        return
    # The existing Cloud Build migration identity is the only identity that
    # already receives the migration secret. A new secret resource is unnecessary:
    # the existing runtime secret can hold one direct URL for DATABASE_URL and
    # COACH_SYNC_DATABASE_URL; the migration secret remains separate and unchanged.
    readable = permissions(token, MIGRATION_SECRET, ["secretmanager.versions.access"])
    writable = permissions(token, DATABASE_SECRET, ["secretmanager.versions.add"])
    if not readable or not writable:
        report("activation", state="BLOCKED", reason="missing-existing-secret-permission")
        raise SystemExit(3)
    report("activation", state="PREFLIGHT_PASS", note="No credentials or runtime settings changed")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.TimeoutExpired, KeyError, ValueError) as error:
        # Never print arbitrary command output, exception text or credentials.
        report("activation", state="BLOCKED", reason=type(error).__name__)
        raise SystemExit(2)
