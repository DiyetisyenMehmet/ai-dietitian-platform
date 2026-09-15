"""Read-only staging phone-auth diagnostics; never log credentials or users."""

import datetime
import json
import os
import subprocess
import urllib.error
import urllib.parse
import urllib.request

PROJECT = "project-a2e260c1-839d-4f1d-b90"
ORIGIN = "https://staging.diewish.com"


def main():
    if os.environ.get("PROJECT_ID", PROJECT) != PROJECT:
        raise SystemExit("Refusing a project other than isolated staging")
    if os.environ.get("GITHUB_REF", "refs/heads/feature/staging-preview") != "refs/heads/feature/staging-preview":
        raise SystemExit("Refusing a branch other than isolated staging")
    token = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True, check=False)
    if token.returncode:
        raise SystemExit("Staging credentials unavailable; no settings changed")
    headers = {"Authorization": "Bearer " + token.stdout.strip(), "x-goog-user-project": PROJECT}

    def get(label, url, authenticated=True):
        try:
            request = urllib.request.Request(url, headers=headers if authenticated else {}, method="GET")
            with urllib.request.urlopen(request, timeout=25) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            print(json.dumps({"check": label, "state": "UNKNOWN", "httpStatus": error.code}))
        except (urllib.error.URLError, TimeoutError, ValueError):
            print(json.dumps({"check": label, "state": "UNKNOWN", "reason": "request-failed"}))
        return None

    def report(label, value):
        print(json.dumps({"check": label, **value}, sort_keys=True))

    report("context", {"project": PROJECT, "at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "sha": os.environ.get("GITHUB_SHA")})
    config = get("identity-config", f"https://identitytoolkit.googleapis.com/admin/v2/projects/{PROJECT}/config")
    if config is not None:
        report("identity-config", {
            "phoneEnabled": config.get("signIn", {}).get("phoneNumber", {}).get("enabled", False),
            "smsRegionConfig": config.get("smsRegionConfig", {}),
            "authorizedDomains": config.get("authorizedDomains", []),
            "phoneEnforcementState": config.get("recaptchaConfig", {}).get("phoneEnforcementState", "OFF"),
            "useSmsBotScore": config.get("recaptchaConfig", {}).get("useSmsBotScore", False),
        })
    google = get("google-provider", f"https://identitytoolkit.googleapis.com/admin/v2/projects/{PROJECT}/defaultSupportedIdpConfigs/google.com")
    if google is not None:
        report("google-provider", {"enabled": google.get("enabled", False), "clientConfigured": bool(google.get("clientId"))})
    billing = get("billing", f"https://cloudbilling.googleapis.com/v1/projects/{PROJECT}/billingInfo")
    if billing is not None:
        report("billing", {"billingEnabled": billing.get("billingEnabled", False), "accountLinked": bool(billing.get("billingAccountName"))})
    public = get("runtime", ORIGIN + "/api/identity/firebase-config", authenticated=False)
    if public is not None:
        data = public.get("data", public)
        settings = data.get("config") or {}
        report("runtime", {"configured": data.get("configured"), "projectMatches": settings.get("projectId") == PROJECT, "authDomain": settings.get("authDomain"), "requiredFieldsPresent": all(settings.get(key) for key in ("apiKey", "appId", "authDomain", "projectId"))})

    end = datetime.datetime.now(datetime.timezone.utc)
    start = end - datetime.timedelta(hours=24)
    for label, metric in (
        ("sent-sms", "identitytoolkit.googleapis.com/usage/sent_sms_count"),
        ("blocked-sms", "identitytoolkit.googleapis.com/usage/blocked_sms_count"),
        ("phone-verifications", "firebaseauth.googleapis.com/phone_auth/phone_verification_count"),
    ):
        query = urllib.parse.urlencode({"filter": f'metric.type="{metric}"', "interval.startTime": start.isoformat(), "interval.endTime": end.isoformat(), "view": "FULL", "pageSize": 1000})
        metrics = get(label, f"https://monitoring.googleapis.com/v3/projects/{PROJECT}/timeSeries?{query}")
        if metrics is not None:
            series = metrics.get("timeSeries", [])
            report(label, {
                "windowHours": 24, "state": "DATA" if series else "NO_DATA", "partial": bool(metrics.get("nextPageToken")),
                "series": [{"region": item.get("metric", {}).get("labels", {}).get("region_code"), "total": sum(float(point.get("value", {}).get("int64Value", point.get("value", {}).get("doubleValue", 0))) for point in item.get("points", []))} for item in series],
            })


if __name__ == "__main__":
    main()
