"""Read-only release guard. Never emits credentials, health data or provider bodies."""
import argparse
import json
import os
import subprocess

PROJECT = "project-a2e260c1-839d-4f1d-b90"
REGION = "europe-west1"
SERVICES = ("diewish-backend-staging", "diewish-frontend-staging")


def command(*args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=45, check=False)
    if result.returncode:
        raise RuntimeError("staging-read-unavailable:" + "-".join(args[:3]))
    return result.stdout.strip()


def disabled(container, explicit):
    variables = {entry["name"]: entry for entry in container.get("env", [])}
    entry = variables.get("NUTRITION_JOBS_ENABLED")
    if entry is None and not explicit:
        return variables
    if not entry or entry.get("value", "").lower() != "false" or "valueFrom" in entry:
        raise RuntimeError("nutrition-not-confirmed-disabled")
    return variables


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=("pre", "post"), required=True)
    parser.add_argument("--expected-sha")
    parser.add_argument("--backend-build")
    parser.add_argument("--frontend-build")
    options = parser.parse_args()
    phase = options.phase
    if os.environ.get("PROJECT_ID") != PROJECT:
        raise RuntimeError("unexpected-project")
    if os.environ.get("GITHUB_REF") != "refs/heads/feature/staging-preview":
        raise RuntimeError("unexpected-ref")
    expected = options.expected_sha or os.environ["GITHUB_SHA"]
    if len(expected) != 40 or any(c not in "0123456789abcdef" for c in expected):
        raise RuntimeError("invalid-expected-sha")
    head = command("git", "ls-remote", "origin", "refs/heads/feature/staging-preview").split()[0]
    if head != os.environ["GITHUB_SHA"]:
        raise RuntimeError("staging-head-moved")
    for service in SERVICES:
        data = json.loads(command("gcloud", "run", "services", "describe", service,
                                  "--project", PROJECT, "--region", REGION, "--format=json"))
        traffic = [row for row in data["status"].get("traffic", []) if row.get("percent", 0) > 0]
        if sum(row["percent"] for row in traffic) != 100:
            raise RuntimeError("unverified-traffic")
        for row in traffic:
            revision = row.get("revisionName")
            if not revision:
                raise RuntimeError("unverified-revision")
            runtime = json.loads(command("gcloud", "run", "revisions", "describe", revision,
                                         "--project", PROJECT, "--region", REGION, "--format=json"))
            container = runtime["spec"]["containers"][0]
            if service == SERVICES[0]:
                variables = disabled(container, phase == "post")
                if variables.get("DIEWISH_ENVIRONMENT", {}).get("value") != "staging":
                    raise RuntimeError("runtime-not-staging")
                if phase == "post" and variables.get("DIEWISH_APPLICATION_SHA", {}).get("value") != expected:
                    raise RuntimeError("application-sha-mismatch")
            if phase == "post":
                image = os.environ["BACKEND_IMAGE" if service == SERVICES[0] else "FRONTEND_IMAGE"]
                if not image.endswith(":" + expected):
                    raise RuntimeError("image-tag-mismatch")
                try:
                    digest = command("gcloud", "artifacts", "docker", "images", "describe", image,
                                     "--project", PROJECT, "--format=value(image_summary.digest)")
                except RuntimeError:
                    build_id = options.backend_build if service == SERVICES[0] else options.frontend_build
                    if not build_id:
                        raise
                    # Existing successful build metadata proves the immutable digest without adding IAM rights.
                    build = json.loads(command("gcloud", "builds", "describe", build_id,
                                               "--project", PROJECT, "--region", "global", "--format=json"))
                    if (build.get("status") != "SUCCESS" or
                            build.get("substitutions", {}).get("_GIT_SHA") != expected or
                            build.get("substitutions", {}).get("_IMAGE") != image):
                        raise RuntimeError("build-source-mismatch")
                    images = [row for row in build.get("results", {}).get("images", []) if row.get("name") == image]
                    if len(images) != 1:
                        raise RuntimeError("build-image-unverified")
                    digest = images[0].get("digest", "")
                    print("NUTRITION_RELEASE_GUARD " + json.dumps({
                        "service": service, "artifactLookup": "unavailable", "digestEvidence": "successful-exact-sha-cloud-build",
                    }), flush=True)
                actual = runtime.get("status", {}).get("imageDigest", container.get("image", ""))
                if not digest.startswith("sha256:") or not actual.endswith("@" + digest):
                    raise RuntimeError("serving-image-mismatch")
            print("NUTRITION_RELEASE_GUARD " + json.dumps({
                "phase": phase, "service": service, "revision": revision,
                "trafficPercent": row["percent"], "applicationSha": expected if phase == "post" else "prior",
                "nutritionJobs": ("explicit-false" if phase == "post" else "false-or-unset")
                if service == SERVICES[0] else "not-applicable",
            }, sort_keys=True), flush=True)
    jobs = json.loads(command("gcloud", "scheduler", "jobs", "list", "--project", PROJECT,
                              "--location", REGION, "--format=json"))
    nutrition = [job for job in jobs if "/api/internal/scheduler/nutrition-step" in
                 job.get("httpTarget", {}).get("uri", "")]
    if any(job.get("state") != "PAUSED" for job in nutrition):
        raise RuntimeError("nutrition-scheduler-enabled")
    print("NUTRITION_RELEASE_GUARD " + json.dumps({
        "phase": phase, "nutritionScheduler": "none-or-paused", "result": "PASS",
    }), flush=True)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, KeyError, ValueError, IndexError, subprocess.TimeoutExpired) as error:
        # Report only our bounded reason, never arbitrary CLI/error output.
        reason = str(error) if type(error) is RuntimeError else type(error).__name__
        print("NUTRITION_RELEASE_GUARD " + json.dumps({"result": "BLOCKED", "reason": reason}))
        raise SystemExit(2)
