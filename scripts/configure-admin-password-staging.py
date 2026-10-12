"""Configure the isolated staging Firebase callback only, preserving normal auth.

Run after the exact application SHA is serving and its tests have passed.
No codes, API keys, credentials, email addresses, or SMTP payloads are printed.
"""
import argparse
import json
import os
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request

PROJECT = "project-a2e260c1-839d-4f1d-b90"
CALLBACK = "https://staging.diewish.com/auth/action"


def safe_google_failure(error):
    try:
        payload = json.load(error).get("error", {})
    except (ValueError, AttributeError):
        payload = {}
    message = str(payload.get("message", ""))
    permissions = [value for value in re.findall(r"logging\.[a-zA-Z.]+", message) if value in {"logging.exclusions.get", "logging.exclusions.create", "logging.sinks.get", "logging.sinks.list", "logging.sinks.update"}]
    reasons = [str(item.get("reason", "")) for item in payload.get("details", []) if isinstance(item, dict)]
    return json.dumps({"httpStatus": error.code, "status": payload.get("status", "UNKNOWN"), "permissions": sorted(set(permissions)), "reasons": [value for value in reasons if re.fullmatch(r"[A-Z_]{1,80}", value)]})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if os.environ.get("PROJECT_ID") != PROJECT or os.environ.get("GITHUB_REF_NAME") != "feature/staging-preview":
        raise SystemExit("Refusing to configure an environment outside isolated staging.")
    token = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True, check=True).stdout.strip()
    endpoint = f"https://identitytoolkit.googleapis.com/admin/v2/projects/{PROJECT}/config"

    def request(method="GET", body=None):
        req = urllib.request.Request(endpoint + ("?updateMask=notification.sendEmail.callbackUri" if method == "PATCH" else ""), data=json.dumps(body).encode() if body else None, method=method, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "x-goog-user-project": PROJECT})
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            raise SystemExit(f"Staging callback configuration failed: HTTP {error.code}.") from None
    before = request()
    callback = before.get("notification", {}).get("sendEmail", {}).get("callbackUri", "")
    print(json.dumps({"project": PROJECT, "currentCallback": callback, "targetCallback": CALLBACK, "mode": "apply" if args.apply else "read-only"}))
    if not args.apply:
        return
    # Callback URLs carry Firebase codes until the browser strips them. Exclude
    # just these sensitive frontend request logs before enabling the callback.
    exclusion = "diewish-staging-password-action-codes"
    log_filter = 'resource.type="cloud_run_revision" AND resource.labels.service_name="diewish-frontend-staging" AND (httpRequest.requestUrl =~ "/auth/action[?]" OR httpRequest.requestUrl =~ "/admin/reset-password[?]")'
    log_base = f"https://logging.googleapis.com/v2/projects/{PROJECT}/exclusions"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        with urllib.request.urlopen(urllib.request.Request(f"{log_base}/{exclusion}", headers=headers), timeout=30) as response:
            current = json.load(response)
        if current.get("filter") != log_filter or current.get("disabled", False):
            raise SystemExit("Existing sensitive-URL exclusion differs; configuration review required.")
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise SystemExit(f"Cannot verify sensitive callback URL log protection: {safe_google_failure(error)}. No Firebase update performed.") from None
        payload = {"name": exclusion, "description": "Prevent Firebase action codes in staging frontend HTTP request logs; backend audit/error logs remain enabled.", "filter": log_filter, "disabled": False}
        try:
            req = urllib.request.Request(log_base, data=json.dumps(payload).encode(), headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=30) as response:
                json.load(response)
        except urllib.error.HTTPError as error:
            raise SystemExit(f"Cannot protect sensitive callback URL logs: {safe_google_failure(error)}. No Firebase update performed.") from None
    # The legacy exclusions endpoint protects only the _Default sink. Refuse
    # activation if another enabled export could retain a sensitive request URL.
    # Read router metadata only; do not read log entries or alter custom sinks.
    sink_url = f"https://logging.googleapis.com/v2/projects/{PROJECT}/sinks"
    while sink_url:
        try:
            with urllib.request.urlopen(urllib.request.Request(sink_url, headers=headers), timeout=30) as response:
                sinks = json.load(response)
        except urllib.error.HTTPError as error:
            raise SystemExit(f"Cannot verify sensitive URL export protection: {safe_google_failure(error)}. No Firebase update performed.") from None
        for sink in sinks.get("sinks", []):
            if sink.get("disabled", False) or sink.get("name") in {"_Default", "_Required"}:
                continue
            # _Required is immutable and contains Google audit logs, not Cloud
            # Run HTTP request logs. Custom filters are conservatively reviewed.
            if not any(item.get("filter") == log_filter and not item.get("disabled", False) for item in sink.get("exclusions", [])):
                raise SystemExit("An enabled custom log export lacks sensitive-URL protection; staging configuration review required. No Firebase update performed.")
        next_page = sinks.get("nextPageToken", "")
        sink_url = f"https://logging.googleapis.com/v2/projects/{PROJECT}/sinks?pageToken={urllib.parse.quote(next_page, safe='')}" if next_page else ""
    print("ADMIN_PASSWORD_CALLBACK_LOG_PROTECTION_PASS")
    # Single field mask: no template, sign-in provider, authorized domain, quota,
    # phone, Google or production changes. Normal actions use the existing handler.
    request("PATCH", {"notification": {"sendEmail": {"callbackUri": CALLBACK}}})
    after = request()
    if after.get("notification", {}).get("sendEmail", {}).get("callbackUri") != CALLBACK:
        raise SystemExit("Staging callback verification failed.")
    before.setdefault("notification", {}).setdefault("sendEmail", {})["callbackUri"] = CALLBACK
    if before != after:
        raise SystemExit("Unexpected Firebase configuration drift; inspect before any further action.")
    print("ADMIN_PASSWORD_CALLBACK_PASS; all other Firebase configuration preserved")


if __name__ == "__main__":
    main()
