"""Read-only Cloud Run metadata snapshot for #90; never reads a secret payload/DB.

No deployment, traffic/tag updates, IAM writes, migrations, scheduler runs or logs.
Only selected public metadata and secret *references* are emitted.
"""
import json
import subprocess
import sys

PROJECT = "project-a2e260c1-839d-4f1d-b90"
REGION = "europe-west1"
BACKEND = "diewish-backend-staging"
FRONTEND = "diewish-frontend-staging"
RUNTIME = f"diewish-staging-runtime@{PROJECT}.iam.gserviceaccount.com"
NEW_SECRET = "diewish-staging-test2-database-url"
PUBLIC_ENV = ("DIEWISH_APPLICATION_SHA", "DIEWISH_ENVIRONMENT", "NODE_ENV", "CORS_ORIGIN",
              "FRONTEND_URL", "ADMIN_FRONTEND_URL", "FIREBASE_PROJECT_ID", "NEXT_PUBLIC_SITE_URL",
              "NEXT_PUBLIC_API_BASE_URL", "DIEWISH_API_PROXY_TARGET",
              "ACCOUNT_SAFE_LINKING_ENABLED", "PHONE_PASSWORD_AUTH_ENABLED", "PHONE_SMS_RECOVERY_ENABLED",
              "COACH_SYNC_ENABLED", "STAGING_AUTOMATION_ENABLED", "SCHEDULER_TRIGGER_ENABLED",
              "NUTRITION_JOBS_ENABLED", "DIEWISH_STAGING_HOST_ROUTING_ENABLED",
              "DIEWISH_STAGING_ADMIN_API_ORIGIN", "DIEWISH_STAGING_USER_API_ORIGIN")


def read(*args):
    # Caller supplies only fixed read verbs. Never forward stderr or raw JSON on error.
    completed = subprocess.run(("gcloud", *args, "--project", PROJECT, "--format=json"),
                               capture_output=True, text=True, timeout=60, check=False)
    if completed.returncode:
        raise RuntimeError("metadata-read-unavailable:" + "/".join(args[:3]))
    return json.loads(completed.stdout)


def revision_snapshot(revision):
    spec = revision["spec"]
    container = spec["containers"][0]
    entries = {v["name"]: v for v in container.get("env", [])}
    secret_refs = {}
    for name, entry in entries.items():
        ref = entry.get("valueFrom", {}).get("secretKeyRef")
        if ref:
            secret_refs[name] = {"secret": ref.get("name"), "referenceVersion": ref.get("key")}
    annotations = revision.get("metadata", {}).get("annotations", {})
    return {
        "revision": revision["metadata"]["name"],
        "image": container.get("image"), "imageDigest": revision.get("status", {}).get("imageDigest"),
        "serviceAccount": spec.get("serviceAccountName"),
        "publicConfiguration": {k: entries[k].get("value") for k in PUBLIC_ENV if k in entries and "value" in entries[k]},
        "secretReferences": secret_refs,
        "plaintextDatabaseConfiguration": any(k in entries and "value" in entries[k] for k in ("DATABASE_URL", "DIRECT_DATABASE_URL")),
        "smtpPresence": {k: "VAR" if entries.get(k, {}).get("value") or entries.get(k, {}).get("valueFrom") else "YOK"
                         for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM")},
        "resources": container.get("resources", {}),
        "scaling": {k: annotations.get(k) for k in ("autoscaling.knative.dev/minScale", "autoscaling.knative.dev/maxScale")},
        "timeoutSeconds": spec.get("timeoutSeconds"), "containerConcurrency": spec.get("containerConcurrency"),
    }


def service_snapshot(name):
    service = read("run", "services", "describe", name, "--region", REGION)
    traffic = service["status"].get("traffic", [])
    revisions = sorted({row["revisionName"] for row in traffic if row.get("revisionName")})
    return {
        "service": name, "url": service["status"]["url"],
        "traffic": [{k: row[k] for k in ("revisionName", "percent", "tag", "url", "latestRevision") if k in row} for row in traffic],
        "revisions": [revision_snapshot(read("run", "revisions", "describe", rev, "--region", REGION)) for rev in revisions],
    }


def collect():
    result = {"project": PROJECT, "region": REGION, "mode": "READ_ONLY_NOT_DEPLOYED"}
    result["backend"] = service_snapshot(BACKEND)
    result["frontend"] = service_snapshot(FRONTEND)
    # Resolve references to metadata-only numerical versions; never 'versions access'.
    resolved = {}
    for service in (result["backend"], result["frontend"]):
        for revision in service["revisions"]:
            for ref in revision["secretReferences"].values():
                key = ref["secret"] + ":" + ref["referenceVersion"]
                if key not in resolved:
                    try:
                        version = read("secrets", "versions", "describe", ref["referenceVersion"], "--secret", ref["secret"])
                        resolved[key] = {"version": version["name"].rsplit("/", 1)[-1], "state": version.get("state")}
                    except RuntimeError:
                        resolved[key] = {"state": "BLOCKED_METADATA_PERMISSION"}
    result["resolvedSecretVersions"] = resolved
    jobs = read("scheduler", "jobs", "list", "--location", REGION)
    result["schedulers"] = [{"name": j["name"].rsplit("/", 1)[-1], "state": j.get("state")}
                            for j in jobs if j["name"].rsplit("/", 1)[-1].startswith("diewish")]
    result["domainMappings"] = {}
    for host in ("staging.diewish.com", "admin-staging.diewish.com"):
        try:
            mapping = read("beta", "run", "domain-mappings", "describe", "--domain", host, "--region", REGION)
            result["domainMappings"][host] = {"routeName": mapping.get("spec", {}).get("routeName")}
        except RuntimeError:
            result["domainMappings"][host] = {"state": "BLOCKED_METADATA_PERMISSION_OR_EXTERNAL_MAPPING"}
    try:
        read("secrets", "describe", NEW_SECRET)
        policy = read("secrets", "get-iam-policy", NEW_SECRET)
        result["test2Secret"] = {"name": NEW_SECRET, "exists": True,
            "directRuntimeAccessor": any(b.get("role") == "roles/secretmanager.secretAccessor" and
                ("serviceAccount:" + RUNTIME) in b.get("members", []) and not b.get("condition")
                for b in policy.get("bindings", [])),
            "inheritedPermission": "NOT_VERIFIED"}
    except RuntimeError:
        result["test2Secret"] = {"name": NEW_SECRET, "state": "BLOCKED_ABSENT_OR_METADATA_PERMISSION"}
    # This snapshot cannot grant GO: tagged revision provenance + new-secret binding + actual QA are mandatory.
    result["decision"] = "NO_GO_PENDING_REVIEW_AND_TAGGED_REVISION_ACCEPTANCE"
    return result


if __name__ == "__main__":
    try:
        print(json.dumps(collect(), indent=2, sort_keys=True))
    except (RuntimeError, KeyError, ValueError, subprocess.TimeoutExpired) as error:
        reason = str(error) if type(error) is RuntimeError else type(error).__name__
        print(json.dumps({"decision": "BLOCKED", "reason": reason}))
        sys.exit(2)
