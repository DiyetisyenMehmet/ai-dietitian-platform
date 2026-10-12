"""Manager review only: metadata reads, no secret payload, role, IAM or service writes."""
import json
import subprocess

PROJECT = "project-a2e260c1-839d-4f1d-b90"
REGION = "europe-west1"
SERVICE = "diewish-backend-staging"
RUNTIME = f"diewish-staging-runtime@{PROJECT}.iam.gserviceaccount.com"
SECRET = "diewish-staging-database-url"


def gcloud(*args):
    result = subprocess.run(["gcloud", *args], capture_output=True, text=True, timeout=45)
    if result.returncode:
        raise RuntimeError("metadata-read-unavailable")
    return result.stdout.strip()


def inspect(service, version):
    spec = service["spec"]["template"]["spec"]
    if spec.get("serviceAccountName") != RUNTIME:
        raise ValueError("unexpected-runtime-account")
    env = {item["name"]: item for item in spec["containers"][0].get("env", [])}
    if env.get("DIEWISH_ENVIRONMENT", {}).get("value") != "staging":
        raise ValueError("non-staging-runtime")
    if env.get("COACH_SYNC_ENABLED", {}).get("value", "false") != "false":
        raise ValueError("live-channel-already-enabled")
    reference = env.get("DATABASE_URL", {}).get("valueFrom", {}).get("secretKeyRef", {})
    if reference.get("name") != SECRET:
        raise ValueError("unexpected-runtime-secret")
    name = version.get("name", "")
    parts = name.split("/")
    if len(parts) != 6 or parts[0] != "projects" or parts[2:5] != ["secrets", SECRET, "versions"]:
        raise ValueError("unexpected-version-metadata")
    if parts[1] not in (PROJECT, "730419163638") or not parts[-1].isdigit():
        raise ValueError("non-staging-version")
    if version.get("state") != "ENABLED":
        raise ValueError("rollback-version-not-enabled")
    traffic = service.get("status", {}).get("traffic", [])
    serving = [item for item in traffic if item.get("percent", 0) > 0]
    if len(serving) != 1 or serving[0].get("percent") != 100 or not serving[0].get("revisionName", "").startswith(SERVICE + "-"):
        raise ValueError("serving-revision-needs-review")
    alias = reference.get("key", "")
    if alias != "latest" and alias != parts[-1]:
        raise ValueError("runtime-version-mismatch")
    # Only allowlisted, non-secret metadata is returned. Never emit container env.
    return {
        "project": PROJECT,
        "service": SERVICE,
        "servingRevision": serving[0]["revisionName"],
        "applicationSha": env.get("DIEWISH_APPLICATION_SHA", {}).get("value"),
        "oldNumericSecretVersion": parts[-1],
        "runtimeUsesLatest": alias == "latest",
        "secretWriteDeferred": True,
        "roleGrantDeferred": True,
        "activationDeferred": True,
        "nextApproval": "restricted database role and old-version pin before any new secret version",
    }


def main():
    if gcloud("config", "get-value", "project") != PROJECT:
        raise ValueError("select-isolated-staging-project")
    service = json.loads(gcloud("run", "services", "describe", SERVICE, "--project", PROJECT,
                                "--region", REGION, "--format=json"))
    version = json.loads(gcloud("secrets", "versions", "describe", "latest", "--secret", SECRET,
                                "--project", PROJECT, "--format=json"))
    print(json.dumps(inspect(service, version), indent=2))


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError, KeyError, subprocess.TimeoutExpired):
        print("SONUC=INCELEME_DURDU_HICBIR_DEGISIKLIK_YAPILMADI")
        raise SystemExit(2)
