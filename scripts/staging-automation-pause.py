"""Staging-only pause; no secrets, user rows, scheduler run/resume or deletion."""
import argparse
import json
import os
import subprocess
import urllib.error
import urllib.request

PROJECT = "project-a2e260c1-839d-4f1d-b90"
REGION = "europe-west1"
SERVICE = "diewish-backend-staging"
JOB = "diewish-notification-dispatch-staging"
RUNTIME = f"diewish-staging-runtime@{PROJECT}.iam.gserviceaccount.com"


def command(*args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=60, check=False)
    if result.returncode:
        raise RuntimeError("staging-control-plane-unavailable:" + "-".join(args[:3]))
    return result.stdout.strip()


def report(**fields):
    print("STAGING_AUTOMATION " + json.dumps(fields, sort_keys=True), flush=True)


def read(kind, name):
    args = ("gcloud", "run", kind, "describe", name, "--project", PROJECT, "--region", REGION)
    return json.loads(command(*args, "--format=json"))


def scheduler():
    return json.loads(command("gcloud", "scheduler", "jobs", "describe", JOB,
                              "--project", PROJECT, "--location", REGION, "--format=json"))


def check_job(job, url):
    target = job.get("httpTarget", {})
    identity = target.get("oidcToken", {})
    if (job.get("name") != f"projects/{PROJECT}/locations/{REGION}/jobs/{JOB}" or
            target.get("uri") != url + "/api/internal/scheduler/tick" or
            target.get("httpMethod") != "POST" or identity.get("audience") != url or
            identity.get("serviceAccountEmail") != RUNTIME):
        raise RuntimeError("unexpected-scheduler-target")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=("read", "pre", "pause"), required=True)
    options = parser.parse_args()
    if (os.environ.get("PROJECT_ID") != PROJECT or
            os.environ.get("GITHUB_REF") != "refs/heads/feature/staging-preview"):
        raise RuntimeError("non-staging-context")
    expected = os.environ["GITHUB_SHA"]
    head = command("git", "ls-remote", "origin", "refs/heads/feature/staging-preview").split()[0]
    if head != expected:
        raise RuntimeError("staging-head-moved")
    service = read("services", SERVICE)
    url = service["status"]["url"]
    traffic = [row for row in service["status"].get("traffic", []) if row.get("percent", 0) > 0]
    if len(traffic) != 1 or traffic[0].get("percent") != 100:
        raise RuntimeError("split-or-unknown-staging-traffic")
    revision_name = traffic[0]["revisionName"]
    revision = read("revisions", revision_name)
    spec = revision["spec"]
    container = spec["containers"][0]
    variables = {item["name"]: item for item in container.get("env", [])}
    value = lambda name: variables.get(name, {}).get("value")
    if spec.get("serviceAccountName") != RUNTIME or value("DIEWISH_ENVIRONMENT") != "staging":
        raise RuntimeError("unexpected-runtime")
    job = scheduler()
    check_job(job, url)
    report(phase=options.phase, stateBefore=job.get("state"), job=JOB,
           schedule=job.get("schedule"), target=url + "/api/internal/scheduler/tick",
           revision=revision_name, applicationSha=value("DIEWISH_APPLICATION_SHA"))
    if options.phase == "read":
        return
    if options.phase == "pre":
        prior = value("DIEWISH_APPLICATION_SHA")
        if not prior or len(prior) != 40 or any(c not in "0123456789abcdef" for c in prior):
            raise RuntimeError("serving-source-unverified")
        command("git", "fetch", "origin", prior)
        command("git", "diff", "--exit-code", prior, expected, "--", "backend/prisma")
        report(phase="pre", schema="identical-to-serving-source", result="PASS")
        return
    if (value("DIEWISH_APPLICATION_SHA") != expected or
            value("STAGING_AUTOMATION_ENABLED") != "false" or
            value("SCHEDULER_TRIGGER_ENABLED") != "true" or
            value("SCHEDULER_OIDC_AUDIENCE") != url or
            value("SCHEDULER_SERVICE_ACCOUNT_EMAIL") != RUNTIME):
        raise RuntimeError("pause-or-request-recovery-runtime-unverified")
    # Configuration existence only; never read secret payloads or SMTP recipients.
    for name in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"):
        entry = variables.get(name, {})
        if not entry.get("value") and not entry.get("valueFrom"):
            raise RuntimeError("recovery-email-config-missing")
    image = container.get("image", "")
    if not image.endswith(":" + expected):
        raise RuntimeError("serving-source-image-mismatch")
    build_id = os.environ.get("PAUSE_BACKEND_BUILD") or os.environ.get("BACKEND_BUILD_ID")
    if not build_id:
        raise RuntimeError("exact-source-build-evidence-missing")
    build = json.loads(command("gcloud", "builds", "describe", build_id,
                               "--project", PROJECT, "--region", "global", "--format=json"))
    images = [row for row in build.get("results", {}).get("images", []) if row.get("name") == image]
    if (build.get("status") != "SUCCESS" or build.get("substitutions", {}).get("_GIT_SHA") != expected or
            len(images) != 1 or not images[0].get("digest", "").startswith("sha256:") or
            not revision.get("status", {}).get("imageDigest", "").endswith("@" + images[0]["digest"])):
        raise RuntimeError("serving-digest-unverified")
    for endpoint, status in (("/api/internal/scheduler/tick", 404),
                             ("/api/internal/scheduler/password-reset", 401)):
        request = urllib.request.Request(url + endpoint, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                actual = response.status
        except urllib.error.HTTPError as error:
            actual = error.code
        if actual != status:
            raise RuntimeError("pause-or-recovery-route-check-failed")
    if job.get("state") == "ENABLED":
        command("gcloud", "scheduler", "jobs", "pause", JOB,
                "--project", PROJECT, "--location", REGION, "--quiet")
    elif job.get("state") != "PAUSED":
        raise RuntimeError("unexpected-job-state")
    after = scheduler()
    check_job(after, url)
    if after.get("state") != "PAUSED":
        raise RuntimeError("scheduler-pause-unverified")
    report(phase="pause", job=JOB, state="PAUSED", revision=revision_name,
           applicationSha=expected, inProcessAutomation="disabled", tickHttp=404,
           recoveryRouteUnauthenticatedHttp=401, result="PASS")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, KeyError, ValueError, IndexError, subprocess.TimeoutExpired,
            urllib.error.URLError) as error:
        reason = str(error) if type(error) is RuntimeError else type(error).__name__
        report(result="BLOCKED", reason=reason)
        raise SystemExit(2)
