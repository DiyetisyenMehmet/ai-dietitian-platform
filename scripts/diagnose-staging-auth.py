"""Read-only staging phone-auth diagnostics; never log credentials or users."""

import datetime
import json
import os
import subprocess
import urllib.error
import urllib.parse
import urllib.request

PROJECT = "project-a2e260c1-839d-4f1d-b90"
PROJECT_NUMBER = "730419163638"
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

    def collection(label, url, key, params):
        items = []
        for _ in range(10):
            page = get(label, url + "?" + urllib.parse.urlencode(params))
            if page is None:
                return items, False
            items.extend(page.get(key, []))
            if not page.get("nextPageToken"):
                return items, True
            params = {**params, "pageToken": page["nextPageToken"]}
        return items, False

    report("context", {"project": PROJECT, "at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "sha": os.environ.get("GITHUB_SHA")})
    config = get("identity-config", f"https://identitytoolkit.googleapis.com/admin/v2/projects/{PROJECT}/config")
    if config is not None:
        report("identity-config", {
            "phoneEnabled": config.get("signIn", {}).get("phoneNumber", {}).get("enabled", False),
            "smsRegionConfig": config.get("smsRegionConfig", {}),
            "authorizedDomains": config.get("authorizedDomains", []),
            "phoneEnforcementState": config.get("recaptchaConfig", {}).get("phoneEnforcementState", "OFF"),
            "useSmsTollFraudProtection": config.get("recaptchaConfig", {}).get("useSmsTollFraudProtection", False),
            "tollFraudManagedRules": config.get("recaptchaConfig", {}).get("tollFraudManagedRules", []),
            "recaptchaKeyTypes": sorted({
                item.get("type") for item in config.get("recaptchaConfig", {}).get("recaptchaKeys", [])
                if item.get("type")
            }),
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

    # Consumer-visible limits cannot reveal Google's private per-phone or abuse
    # restrictions. Preserve absent/partial data rather than declaring no limit.
    quotas, complete = collection(
        "identity-quotas",
        f"https://serviceusage.googleapis.com/v1beta1/projects/{PROJECT_NUMBER}/services/identitytoolkit.googleapis.com/consumerQuotaMetrics",
        "metrics", {"view": "FULL", "pageSize": 200},
    )
    report("identity-quotas", {
        "state": "DATA" if quotas else "NO_DATA" if complete else "UNKNOWN",
        "partial": not complete,
        "limits": [{
            "metric": metric.get("metric"), "displayName": metric.get("displayName"),
            "unit": limit.get("unit"),
            "buckets": [{
                "defaultLimit": bucket.get("defaultLimit"),
                "effectiveLimit": bucket.get("effectiveLimit"),
                "consumerOverride": bucket.get("consumerOverride", {}).get("overrideValue"),
                "adminOverride": bucket.get("adminOverride", {}).get("overrideValue"),
                "region": bucket.get("dimensions", {}).get("region"),
            } for bucket in limit.get("quotaBuckets", [])],
        } for metric in quotas for limit in metric.get("consumerQuotaLimits", [])],
    })

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

    # Official Identity Platform reCAPTCHA telemetry. Report only aggregate
    # counts/distributions and a narrow allowlist of non-PII labels.
    safe_metric_label_keys = {
        "verdict", "token_status", "status", "provider", "client_type",
        "recaptcha_action", "type", "tenant_name",
    }

    def summarize_recaptcha_series(items):
        summaries = []
        for item in items:
            labels = {
                key: value for key, value in item.get("metric", {}).get("labels", {}).items()
                if key in safe_metric_label_keys
            }
            points = item.get("points", [])
            total = 0
            numeric = False
            distributions = []
            for point in points:
                value = point.get("value", {})
                if "int64Value" in value:
                    total += int(value["int64Value"])
                    numeric = True
                elif "doubleValue" in value:
                    total += float(value["doubleValue"])
                    numeric = True
                elif "distributionValue" in value:
                    distribution = value["distributionValue"]
                    distributions.append({
                        "count": distribution.get("count"),
                        "mean": distribution.get("mean"),
                        "bucketCounts": distribution.get("bucketCounts", []),
                        "explicitBounds": distribution.get("bucketOptions", {}).get("explicitBuckets", {}).get("bounds", []),
                    })
            summary = {"labels": labels, "pointCount": len(points)}
            if numeric:
                summary["total"] = total
            if distributions:
                summary["distributions"] = distributions
            summaries.append(summary)
        return summaries

    for label, metric in (
        ("recaptcha-verdict-count", "identitytoolkit.googleapis.com/recaptcha/verdict_count"),
        ("recaptcha-token-count", "identitytoolkit.googleapis.com/recaptcha/token_count"),
        ("recaptcha-sms-tf-risk-scores", "identitytoolkit.googleapis.com/recaptcha/sms_tf_risk_scores"),
    ):
        series, complete = collection(
            label,
            f"https://monitoring.googleapis.com/v3/projects/{PROJECT}/timeSeries",
            "timeSeries",
            {
                "filter": f'metric.type="{metric}"',
                "interval.startTime": start.isoformat(),
                "interval.endTime": end.isoformat(),
                "view": "FULL",
                "pageSize": 1000,
            },
        )
        report(label, {
            "windowHours": 24,
            "state": "DATA" if series else "NO_DATA" if complete else "UNKNOWN",
            "partial": not complete,
            "series": summarize_recaptcha_series(series),
        })

    for label, metric, resource in (
        ("identity-api-requests", "serviceruntime.googleapis.com/api/request_count", "consumed_api"),
        ("identity-quota-exceeded", "serviceruntime.googleapis.com/quota/exceeded", "consumer_quota"),
    ):
        series, complete = collection(
            label, f"https://monitoring.googleapis.com/v3/projects/{PROJECT}/timeSeries", "timeSeries", {
                "filter": f'metric.type="{metric}" AND resource.type="{resource}" AND resource.labels.service="identitytoolkit.googleapis.com"',
                "interval.startTime": start.isoformat(), "interval.endTime": end.isoformat(),
                "view": "FULL", "pageSize": 1000,
            },
        )
        # Never print full labels: consumed_api includes a credential_id label.
        # quota/exceeded is a BOOL gauge, not a count of rejected SMS messages.
        summaries = []
        for item in series:
            labels = item.get("metric", {}).get("labels", {})
            if label == "identity-api-requests":
                summaries.append({
                    "method": item.get("resource", {}).get("labels", {}).get("method"),
                    "responseCode": labels.get("response_code"),
                    "total": sum(int(point["value"]["int64Value"]) for point in item.get("points", [])),
                })
            else:
                summaries.append({
                    "quotaMetric": labels.get("quota_metric"), "limitName": labels.get("limit_name"),
                    "exceededObserved": any(point["value"].get("boolValue") is True for point in item.get("points", [])),
                })
        report(label, {
            "windowHours": 24, "state": "DATA" if series else "NO_DATA" if complete else "UNKNOWN",
            "partial": not complete, "series": summaries,
        })


if __name__ == "__main__":
    main()
